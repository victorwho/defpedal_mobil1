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
} from '@defensivepedal/core';
import { encodePolyline } from '@defensivepedal/core';
import type { RouteResponse, Route, Step } from '@defensivepedal/core';

import { getElevationGain } from './elevation';
import { mobileEnv } from './env';
import { getAccessToken } from './supabase';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSRM_API_BASE = 'https://osrm.defensivepedal.com/route/v1/bicycle';
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
 */
const mapStep = (step: Step, index: number): NavigationStep => ({
  id: `step-${index}`,
  instruction:
    step.maneuver.type === 'depart'
      ? `Head ${step.maneuver.modifier ?? 'straight'} on ${step.name || 'the road'}`
      : step.maneuver.type === 'arrive'
        ? 'Arrive at your destination'
        : `${capitalizeFirst(step.maneuver.modifier ?? step.maneuver.type)} onto ${step.name || 'the road'}`,
  streetName: step.name || '',
  distanceMeters: step.distance,
  durationSeconds: step.duration,
  maneuver: step.maneuver,
  geometry: step.geometry,
  mode: step.mode,
});

const capitalizeFirst = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Map an OSRM/Mapbox route to our RouteOption.
 */
const mapRoute = (
  route: Route,
  source: 'custom_osrm' | 'mapbox',
  index: number,
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
    steps: allSteps.map(mapStep),
    riskSegments: [],
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
  origin: Coordinate,
  destination: Coordinate,
  avoidUnpaved: boolean,
  waypoints?: readonly Coordinate[],
): Promise<Route[]> => {
  const coords = buildCoordString(origin, destination, waypoints);
  // OSRM doesn't support alternatives with 3+ coordinates (waypoints)
  const hasWaypoints = waypoints && waypoints.length > 0;
  let url = `${OSRM_API_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${hasWaypoints ? 'false' : 'true'}&annotations=true`;

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

const fetchMapboxRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
  waypoints?: readonly Coordinate[],
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
 * Enrich a route with elevation data. Fetches the elevation profile
 * from the route geometry coordinates and computes totalClimbMeters
 * and adjustedDurationSeconds. Fails gracefully — returns unchanged
 * route if elevation fetch fails.
 */
const enrichRouteWithElevation = async (
  route: RouteOption,
  coordinates: [number, number][],
): Promise<RouteOption> => {
  const result = await getElevationGain(coordinates);

  if (result === null) return route;

  const adjustedDurationSeconds = computeAdjustedDuration(
    route.durationSeconds,
    result.elevationGain,
    route.distanceMeters,
  );

  // Fetch full elevation profile from server in parallel (non-blocking)
  let elevationProfile: number[] | undefined;

  try {
    if (mobileEnv.mobileApiUrl) {
      const response = await fetch(`${mobileEnv.mobileApiUrl}/v1/elevation-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates }),
      });

      if (response.ok) {
        const data = (await response.json()) as { elevationProfile: number[] };
        if (data.elevationProfile?.length > 0) {
          elevationProfile = data.elevationProfile;
        }
      }
    }
  } catch {
    // Elevation profile is optional — degrade gracefully
  }

  return {
    ...route,
    totalClimbMeters: Math.round(result.elevationGain),
    adjustedDurationSeconds: Math.round(adjustedDurationSeconds),
    elevationProfile,
  };
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
  const mode = request.mode;

  const source: 'custom_osrm' | 'mapbox' =
    mode === 'safe' ? 'custom_osrm' : 'mapbox';

  const waypoints = request.waypoints;

  const rawRoutes =
    mode === 'safe'
      ? await fetchOsrmRoutes(origin, destination, request.avoidUnpaved, waypoints)
      : await fetchMapboxRoutes(origin, destination, waypoints);

  const routes: RouteOption[] = rawRoutes.map((route, index) =>
    mapRoute(route, source, index),
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

  // Compute safe vs fast risk comparison if enabled
  let comparisonLabel: string | undefined;
  if (request.showRouteComparison && enrichedRoutes.length > 0) {
    try {
      const avgRisk = (segments: readonly RiskSegment[]) => {
        if (segments.length === 0) return 0;
        const total = segments.reduce((sum, s) => sum + s.riskScore, 0);
        return total / segments.length;
      };

      const currentSegments = enrichedRoutes[0].riskSegments;
      let comparisonSegments: readonly RiskSegment[] = [];

      if (mode === 'safe') {
        // Fetch fast route for comparison
        const fastRawRoutes = await fetchMapboxRoutes(origin, destination, waypoints);
        if (fastRawRoutes.length > 0) {
          const fastRoute = mapRoute(fastRawRoutes[0], 'mapbox', 0);
          const fastEnriched = await enrichRouteWithRisk(fastRoute, fastRawRoutes[0].geometry.coordinates);
          comparisonSegments = fastEnriched.riskSegments;
        }
      } else {
        // Fetch safe route for comparison
        const safeRawRoutes = await fetchOsrmRoutes(origin, destination, request.avoidUnpaved, waypoints);
        if (safeRawRoutes.length > 0) {
          const safeRoute = mapRoute(safeRawRoutes[0], 'custom_osrm', 0);
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

        if (mode === 'safe') {
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
        } else if (mode === 'fast') {
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

  const coverage: CoverageRegion = {
    countryCode: request.countryHint?.toUpperCase() ?? 'UNKNOWN',
    status: 'supported',
    safeRouting: true,
    fastRouting: true,
  };

  return {
    routes: enrichedRoutes,
    selectedMode: mode,
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
