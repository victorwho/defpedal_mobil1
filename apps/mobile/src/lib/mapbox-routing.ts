/**
 * Direct routing integration:
 * - **Safe mode**: Custom OSRM server at osrm.defensivepedal.com
 * - **Fast mode**: Mapbox Directions API v5
 *
 * Maps OSRM / Mapbox Directions responses to the app's RoutePreviewResponse.
 */
import type {
  Coordinate,
  CoverageRegion,
  GeoJsonLineString,
  NavigationStep,
  RerouteRequest,
  RiskSegment,
  RouteOption,
  RoutePreviewRequest,
  RoutePreviewResponse,
  SupportedCountry,
} from '@defensivepedal/core';
import { encodePolyline, extractRouteFeatures, isRouteSupported } from '@defensivepedal/core';
import type { RouteResponse, Route, Step } from '@defensivepedal/core';

import { mobileEnv } from './env';
import { SUPPORTED_LOCALES, type Locale } from '../i18n';
import { buildManeuverInstruction } from './maneuverInstructions';
import { getAccessToken } from './supabase';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Per-country OSRM endpoints. Both endpoints of a ride must resolve to the
 * same country (OSRM data is partitioned per server) — see `isRouteSupported`
 * in `@defensivepedal/core`. Adding a new country = one entry here + one
 * bbox in `countryCoverage.ts`.
 *
 * Risk segments are currently RO-only; ES routes still render but without
 * colored risk overlays until `road_risk_data` is populated for Spain.
 */
const OSRM_BASES: Record<SupportedCountry, { safe: string; flat: string }> = {
  RO: {
    safe: 'https://osrm.defensivepedal.com/route/v1/bicycle',
    flat: 'https://osrm-flat.defensivepedal.com/route/v1/bicycle',
  },
  ES: {
    safe: 'https://osrm-es.defensivepedal.com/route/v1/bicycle',
    flat: 'https://osrm-es-flat.defensivepedal.com/route/v1/bicycle',
  },
};

const MAPBOX_DIRECTIONS_BASE =
  'https://api.mapbox.com/directions/v5/mapbox/cycling';
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fetchWithTimeout = async (
  url: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Route request timed out after ${timeoutMs / 1000}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const generateRouteId = (source: 'custom_osrm' | 'mapbox', index: number): string =>
  `${source}-${Date.now()}-${index}`;

/**
 * Map an OSRM/Mapbox step to our NavigationStep.
 *
 * Mapbox Directions returns a localized `maneuver.instruction` when called
 * with `&language=<code>` — prefer that so the rider's UI locale flows
 * through to turn-by-turn text. Falls back to a locale-aware string built from
 * the raw maneuver `type` + `modifier` for safe-mode (OSRM) routes, which
 * don't ship an instruction field. See `maneuverInstructions.ts`.
 */
const mapStep = (step: Step, index: number, locale: Locale): NavigationStep => {
  const mapboxInstruction = (step.maneuver as { instruction?: string }).instruction;
  return {
    id: `step-${index}`,
    instruction:
      mapboxInstruction && mapboxInstruction.length > 0
        ? mapboxInstruction
        : buildManeuverInstruction(step, locale),
    streetName: step.name || '',
    distanceMeters: step.distance,
    durationSeconds: step.duration,
    maneuver: step.maneuver,
    geometry: step.geometry,
    mode: step.mode,
  };
};

/**
 * Map an OSRM/Mapbox route to our RouteOption.
 */
const mapRoute = (
  route: Route,
  source: 'custom_osrm' | 'mapbox',
  index: number,
  locale: Locale,
): RouteOption => {
  const allSteps = route.legs.flatMap((leg) => leg.steps);

  return {
    id: generateRouteId(source, index),
    source,
    routingEngineVersion: source === 'custom_osrm' ? 'safe-osrm-v1' : 'mapbox-directions-v5',
    routingProfileVersion: source === 'custom_osrm' ? 'safety-profile-v1' : 'mapbox-cycling-v1',
    mapDataVersion: source === 'custom_osrm' ? 'osm-current' : 'mapbox-current',
    riskModelVersion: source === 'custom_osrm' ? 'risk-model-v1' : 'none',
    geometryPolyline6: encodePolyline(route.geometry.coordinates),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    adjustedDurationSeconds: route.duration,
    totalClimbMeters: null,
    steps: allSteps.map((step, stepIndex) => mapStep(step, stepIndex, locale)),
    riskSegments: [],
    // Route-feature awareness markers (tunnels, bridges, unprotected lefts).
    // OSRM safe profile populates `annotation.classes` so tunnel/bridge runs
    // surface; Mapbox cycling skips classes so fast routes only get left-turn
    // detection from step maneuvers. Same extractor the server uses — kept
    // in core so both paths produce identical features. See
    // `packages/core/src/routeFeatures.ts`.
    routeFeatures: extractRouteFeatures(route, index),
    warnings: [],
  };
};

// ---------------------------------------------------------------------------
// Fetch routes from OSRM (safe mode)
// ---------------------------------------------------------------------------

const buildCoordString = (
  origin: Coordinate,
  destination: Coordinate,
  waypoints?: readonly Coordinate[],
): string => {
  const points = [origin, ...(waypoints ?? []), destination];
  return points.map((p) => `${p.lon},${p.lat}`).join(';');
};

const fetchOsrmRoutes = async (
  country: SupportedCountry,
  origin: Coordinate,
  destination: Coordinate,
  avoidUnpaved: boolean,
  avoidHills: boolean,
  waypoints?: readonly Coordinate[],
): Promise<Route[]> => {
  const coords = buildCoordString(origin, destination, waypoints);
  // OSRM doesn't support alternatives with 3+ coordinates (waypoints)
  const hasWaypoints = waypoints && waypoints.length > 0;
  // Use flat-profile endpoint when avoidHills is set (separate OSRM instance)
  const base = avoidHills ? OSRM_BASES[country].flat : OSRM_BASES[country].safe;
  let url = `${base}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${hasWaypoints ? 'false' : 'true'}&annotations=true`;

  if (avoidUnpaved) {
    url += '&exclude=unpaved';
  }

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `OSRM routing failed (${response.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as RouteResponse;

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM returned no routes (code: ${data.code})`);
  }

  return data.routes;
};

// ---------------------------------------------------------------------------
// Fetch routes from Mapbox Directions (fast mode)
// ---------------------------------------------------------------------------

// Mapbox Directions supports a fixed set of language codes for step
// instructions. Anything else falls back silently — so we keep the surface
// to the locales we actually translate the UI into.
const MAPBOX_DIRECTIONS_LANGUAGES = new Set(['en', 'ro', 'es']);

const fetchMapboxRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
  waypoints?: readonly Coordinate[],
  locale?: string,
): Promise<Route[]> => {
  const token = mobileEnv.mapboxPublicToken;

  if (!token) {
    throw new Error('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not configured.');
  }

  const coords = buildCoordString(origin, destination, waypoints);
  const hasWaypoints = waypoints && waypoints.length > 0;
  const params = new URLSearchParams({
    alternatives: hasWaypoints ? 'false' : 'true',
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    access_token: token,
  });

  // Localize maneuver `instruction` text. Default to EN when the caller's
  // locale isn't in Mapbox's supported set.
  const language =
    locale && MAPBOX_DIRECTIONS_LANGUAGES.has(locale) ? locale : 'en';
  params.set('language', language);

  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?${params.toString()}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Mapbox routing failed (${response.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as RouteResponse;

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`Mapbox returned no routes (code: ${data.code})`);
  }

  return data.routes;
};

// ---------------------------------------------------------------------------
// Elevation enrichment
// ---------------------------------------------------------------------------

const HILL_START_PENALTY_SEC = 10;
const ELEVATION_TIME_FACTOR = 0.75;
const CLIMB_THRESHOLD_M = 2;

/**
 * Count distinct climbs from an elevation gain total isn't possible without
 * the raw profile, but we can estimate from the gain/distance ratio.
 * For adjusted duration we use the same formula as routeAnalysis.ts.
 */
const computeAdjustedDuration = (
  flatDuration: number,
  elevationGain: number,
  distanceMeters: number,
): number => {
  // Estimate number of climbs: roughly one climb per 500m of gain in typical cycling terrain
  const estimatedClimbs =
    elevationGain > CLIMB_THRESHOLD_M ? Math.max(1, Math.round(elevationGain / 30)) : 0;

  return (
    flatDuration +
    elevationGain * ELEVATION_TIME_FACTOR +
    estimatedClimbs * HILL_START_PENALTY_SEC
  );
};

/**
 * Server response from /v1/elevation-profile (Mapbox Terrain-RGB).
 */
interface ElevationResponse {
  elevationProfile: number[];
  elevationGain: number;
  elevationLoss: number;
}

/**
 * Enrich a route with elevation data. Fetches elevation profile, gain, and loss
 * from the server using Mapbox Terrain-RGB tiles. Computes totalClimbMeters
 * and adjustedDurationSeconds. Fails gracefully — returns unchanged route
 * if elevation fetch fails.
 */
const enrichRouteWithElevation = async (
  route: RouteOption,
  coordinates: [number, number][],
): Promise<RouteOption> => {
  if (!mobileEnv.mobileApiUrl) return route;

  try {
    const response = await fetch(`${mobileEnv.mobileApiUrl}/v1/elevation-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates }),
    });

    if (!response.ok) return route;

    const data = (await response.json()) as ElevationResponse;

    const elevationGain = data.elevationGain ?? 0;
    const adjustedDurationSeconds = computeAdjustedDuration(
      route.durationSeconds,
      elevationGain,
      route.distanceMeters,
    );

    return {
      ...route,
      totalClimbMeters: Math.round(elevationGain),
      adjustedDurationSeconds: Math.round(adjustedDurationSeconds),
      elevationProfile: data.elevationProfile?.length > 0 ? data.elevationProfile : undefined,
    };
  } catch {
    // Elevation data is optional — degrade gracefully
    return route;
  }
};

// ---------------------------------------------------------------------------
// Risk segment enrichment (calls server API for Supabase RPC)
// ---------------------------------------------------------------------------

const fetchRouteRiskSegments = async (
  geometry: GeoJsonLineString,
): Promise<RiskSegment[]> => {
  if (!mobileEnv.mobileApiUrl) return [];

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${mobileEnv.mobileApiUrl}/v1/risk-segments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ geometry }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { riskSegments: RiskSegment[] };
    return data.riskSegments ?? [];
  } catch {
    return [];
  }
};

const enrichRouteWithRisk = async (
  route: RouteOption,
  coordinates: [number, number][],
): Promise<RouteOption> => {
  const geometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates,
  };

  const riskSegments = await fetchRouteRiskSegments(geometry);
  if (riskSegments.length === 0) return route;

  return { ...route, riskSegments };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const directPreviewRoute = async (
  request: RoutePreviewRequest,
): Promise<RoutePreviewResponse> => {
  const origin = request.startOverride ?? request.origin;
  const destination = request.destination;
  const requestedMode = request.mode;
  const waypoints = request.waypoints;
  // Drives the safe-mode (OSRM) maneuver-instruction fallback language. Mapbox
  // routes carry their own localized instruction (see `fetchMapboxRoutes`).
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(request.locale)
    ? (request.locale as Locale)
    : 'en';

  // Resolve country support up-front. UI gates upstream should prevent a
  // safe/flat request landing outside a supported country, but we degrade
  // here too as defense-in-depth: silent fall-back to Mapbox fast routing.
  const support = isRouteSupported(origin, destination);
  const canUseOsrm = support.supported;
  const effectiveMode = requestedMode === 'safe' && !canUseOsrm ? 'fast' : requestedMode;
  const source: 'custom_osrm' | 'mapbox' =
    effectiveMode === 'safe' ? 'custom_osrm' : 'mapbox';

  const rawRoutes =
    effectiveMode === 'safe' && support.supported
      ? await fetchOsrmRoutes(
          support.country,
          origin,
          destination,
          request.avoidUnpaved,
          request.avoidHills,
          waypoints,
        )
      : await fetchMapboxRoutes(origin, destination, waypoints, request.locale);

  const routes: RouteOption[] = rawRoutes.map((route, index) =>
    mapRoute(route, source, index, locale),
  );

  // Enrich all routes with elevation data in parallel (non-blocking)
  const elevationEnriched = await Promise.all(
    rawRoutes.map((rawRoute, index) =>
      enrichRouteWithElevation(routes[index], rawRoute.geometry.coordinates),
    ),
  );

  // Enrich all routes with risk segments in parallel (non-blocking)
  const enrichedRoutes = await Promise.all(
    rawRoutes.map((rawRoute, index) =>
      enrichRouteWithRisk(elevationEnriched[index], rawRoute.geometry.coordinates),
    ),
  );

  // Compute safe vs fast risk comparison if enabled — only meaningful when
  // we actually have an OSRM safe route to compare against, AND the country
  // has road_risk_data populated. ES rows are being ingested via the external
  // OSM scoring pipeline (same one that produced ~975k RO rows); until the
  // bulk-insert lands the inner `currentSegments.length > 0 &&
  // comparisonSegments.length > 0` guard means the eligibility check passes
  // but no label is produced — graceful no-op. Once Spanish risk data ships,
  // the comparison + RiskDistributionCard activate automatically with no
  // further code change.
  const COMPARISON_ELIGIBLE_COUNTRIES: readonly SupportedCountry[] = ['RO', 'ES'];
  const comparisonEligible =
    request.showRouteComparison &&
    support.supported &&
    COMPARISON_ELIGIBLE_COUNTRIES.includes(support.country);

  let comparisonLabel: string | undefined;
  if (comparisonEligible && enrichedRoutes.length > 0) {
    try {
      const avgRisk = (segments: readonly RiskSegment[]) => {
        if (segments.length === 0) return 0;
        const total = segments.reduce((sum, s) => sum + s.riskScore, 0);
        return total / segments.length;
      };

      const currentSegments = enrichedRoutes[0].riskSegments;
      let comparisonSegments: readonly RiskSegment[] = [];

      if (effectiveMode === 'safe') {
        // Fetch fast route for comparison
        const fastRawRoutes = await fetchMapboxRoutes(origin, destination, waypoints, request.locale);
        if (fastRawRoutes.length > 0) {
          const fastRoute = mapRoute(fastRawRoutes[0], 'mapbox', 0, locale);
          const fastEnriched = await enrichRouteWithRisk(fastRoute, fastRawRoutes[0].geometry.coordinates);
          comparisonSegments = fastEnriched.riskSegments;
        }
      } else {
        // Fetch safe route for comparison — guarded by support.supported above
        const safeRawRoutes = await fetchOsrmRoutes(
          support.country,
          origin,
          destination,
          request.avoidUnpaved,
          request.avoidHills,
          waypoints,
        );
        if (safeRawRoutes.length > 0) {
          const safeRoute = mapRoute(safeRawRoutes[0], 'custom_osrm', 0, locale);
          const safeEnriched = await enrichRouteWithRisk(safeRoute, safeRawRoutes[0].geometry.coordinates);
          comparisonSegments = safeEnriched.riskSegments;
        }
      }

      if (currentSegments.length > 0 && comparisonSegments.length > 0) {
        const currentAvg = avgRisk(currentSegments);
        const comparisonAvg = avgRisk(comparisonSegments);

        const diffPercent = comparisonAvg > 0
          ? Math.round(Math.abs(1 - currentAvg / comparisonAvg) * 100)
          : 0;

        if (effectiveMode === 'safe') {
          if (currentAvg < comparisonAvg) {
            comparisonLabel = diffPercent >= 1
              ? `${diffPercent}% safer than fast route`
              : 'Slightly safer than fast route';
          } else if (currentAvg > comparisonAvg) {
            // Edge case: safe route scored worse — still inform the user
            comparisonLabel = 'Similar safety to fast route';
          } else {
            comparisonLabel = 'Same safety as fast route';
          }
        } else if (effectiveMode === 'fast') {
          if (currentAvg > comparisonAvg) {
            comparisonLabel = diffPercent >= 1
              ? `${diffPercent}% less safe than safe route`
              : 'Slightly less safe than safe route';
          } else if (currentAvg < comparisonAvg) {
            comparisonLabel = 'Similar safety to safe route';
          } else {
            comparisonLabel = 'Same safety as safe route';
          }
        }
      }
    } catch {
      // Comparison failed silently — don't block the main response
    }
  }

  // Country code reflects what we resolved from GPS, not what the client
  // hinted. Falls back to the legacy `countryHint` for backwards-compat with
  // request shapes that pre-date GPS-based resolution.
  const resolvedCountryCode =
    support.supported
      ? support.country
      : support.originCountry ?? request.countryHint?.toUpperCase() ?? 'UNKNOWN';

  const coverage: CoverageRegion = {
    countryCode: resolvedCountryCode,
    status: support.supported ? 'supported' : 'unsupported',
    safeRouting: support.supported,
    fastRouting: true,
  };

  return {
    routes: enrichedRoutes,
    selectedMode: effectiveMode,
    coverage,
    comparisonLabel,
    generatedAt: new Date().toISOString(),
  };
};

export const directReroute = async (
  request: RerouteRequest,
): Promise<RoutePreviewResponse> => {
  // Reroute uses the same logic as preview
  return directPreviewRoute(request);
};
