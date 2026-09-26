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
  LoopSurface,
  LoopTerrain,
  GeoJsonLineString,
  NavigationStep,
  RerouteRequest,
  RiskSegment,
  RouteCanopyComparison,
  RouteComparison,
  RouteOption,
  RoutePreviewRequest,
  RoutePreviewResponse,
  SafeRoutingProfile,
} from '@defensivepedal/core';
import { describeOsrmFailure, downsampleCoordinates, encodePolyline, extractRouteFeatures, haversineDistance, isHeatRoutingAvailable, isRingOutAndBack, isRiskDataAvailable, busyRoadMeters, isRouteSupported, parseCanopyCompareResponse, readOsrmResponse, resolveSafeRoutingProfile, retracedShare, ringRetracedShare, routeEdgeKeys, spurShare, splitStemAndRing, unpavedShare, usesFlatProfile, excludesUnpaved } from '@defensivepedal/core';
import type { RouteResponse, Route, Step } from '@defensivepedal/core';

import { mobileEnv } from './env';
import { SUPPORTED_LOCALES, type Locale } from '../i18n';
import { buildManeuverInstruction } from './maneuverInstructions';
import { mobileApiFetch } from './mobileApiFetch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Single OSRM deployment (2026-07-12): one graph covering every supported
 * country (EU-27 + EEA + CH, plus the UK since b47v1 on 2026-09-21), so
 * there is no per-country server split anymore and cross-border rides
 * route natively. The former
 * osrm-es.* pair is retired. Coverage gating lives in `isRouteSupported`
 * (`countryCoverage.ts`); adding coverage = extend the bboxes there, not
 * this constant.
 *
 * Risk segments (colored overlays + safe-vs-fast comparison) follow
 * `RISK_DATA_COUNTRIES` in core — the full routing list since the
 * 2026-08-01 EU-wide dataset, the UK included since b47v1.
 */
const OSRM_BASE: Record<SafeRoutingProfile, string> = {
  standard: 'https://osrm.defensivepedal.com/route/v1/bicycle',
  flat: 'https://osrm-flat.defensivepedal.com/route/v1/bicycle',
  // E-bike routing — bicycle46-ebike.lua, the production safety profile with
  // pedelec effort pricing (EN 15194, assist to 25 km/h). Risk weights, legal
  // gates and access rules are byte-identical to standard; only what a
  // vertical metre costs changes. ONE hostname for every country — never
  // derive it per country (there is no osrm-es-ebike; a suffixed host fails
  // TLS). No e-bike flat or cool graph exists, which is why the profile is
  // resolved to exactly one instance in core (`resolveSafeRoutingProfile`).
  ebike: 'https://osrm-ebike.defensivepedal.com/route/v1/bicycle',
  // Cool routing — the heat-model instance, a customized copy of the EU-wide
  // standard graph. Routes in all 31 covered countries (measured 2026-09-17);
  // dispatch still gates on isHeatRoutingAvailable so a future divergence
  // narrows one list in core (HEAT_ROUTING_COUNTRIES).
  cool: 'https://osrm-shade.defensivepedal.com/route/v1/bicycle',
};

const MAPBOX_DIRECTIONS_BASE =
  'https://api.mapbox.com/directions/v5/mapbox/cycling';
const REQUEST_TIMEOUT_MS = 15_000;

// Mapbox Directions API rejects cycling routes whose straight-line origin→
// destination distance exceeds ~400km with HTTP 422 "Route exceeds maximum
// distance limitation". Guard both the main fast/flat fetch and the
// safe-vs-fast comparison fetch to suppress MOBILE-2 / MOBILE-C Sentry noise.
const MAPBOX_MAX_STRAIGHT_LINE_M = 400_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch `url` and consume its body via `read`, with BOTH phases inside the
 * abort window.
 *
 * ⚠️ The `read` callback is why this takes one. Its predecessor returned the
 * bare `Response` and cleared its timer in `finally`, which fires when the
 * HEADERS arrive — so every caller then parsed the body with no timer armed and
 * the AbortController disarmed. A router that sent headers and then stalled hung
 * FOREVER on the rider's critical path: route preview showed a spinner that
 * never resolved, and a loop search stalled mid-fan-out. Passing the reader in
 * keeps the window open until the body is actually consumed, without this
 * helper needing to know how each caller parses it (OSRM goes through
 * `readOsrmResponse`, Mapbox reads `.text()` or `.json()` by status).
 * See docs/plans/external-review-triage-2026-09-25.md P1-2 / P1-3.
 *
 * The body gets its own budget rather than sharing the header one, so no call
 * that succeeds today gets less time to transfer than it had before — the
 * defect was that the body was unbounded, not that it was slow.
 */
const fetchAndRead = async <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  callerSignal?: AbortSignal,
): Promise<T> => {
  const controller = new AbortController();
  let timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  // Loop generation fans out eight of these and lets the rider cancel; without
  // forwarding the caller's signal, a cancelled search keeps every in-flight
  // request running to completion against OSRM.
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await fetch(url, { signal: controller.signal });

    // Re-arm for the body read. This is the line whose absence was the bug.
    clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    return await read(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Distinguish "the rider cancelled" from "the network was too slow" —
      // only the latter is worth surfacing or reporting.
      if (callerSignal?.aborted) throw error;
      throw new Error(`Route request timed out after ${timeoutMs / 1000}s.`);
    }
    // A reader's own error (OSRM InvalidValue, a Mapbox non-2xx, malformed
    // JSON) propagates unchanged — it is not a transport failure.
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    callerSignal?.removeEventListener('abort', onCallerAbort);
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

/**
 * OSRM answered `Ok` but every route was distance-0 — the loose coverage
 * bbox admitted a point the graph has no data for. Distinguished from
 * network/server errors so the caller can degrade to Mapbox (coverage miss)
 * instead of surfacing a retryable error (transient failure).
 */
class OsrmOutOfCoverageError extends Error {}

/**
 * Marks a route that had to drop the rider's "avoid unpaved" request.
 *
 * A warning code rather than a sentence: the string crosses into the UI, which
 * localises it. Rendering English from here would be the one place in the app
 * that does.
 */
export const PAVED_FALLBACK_WARNING = 'no_paved_route';

/**
 * Marks a route that could not honour "avoid unpaved" because it did not come
 * from OSRM at all.
 *
 * Mapbox Directions has no unpaved exclusion on the cycling profile, so every
 * Fast route — and every Safe route that degraded to Mapbox on a coverage miss
 * — silently ignored the preference. The rider had a toggle on, a route on
 * screen, and no way to know the two were unrelated. That is the shape of the
 * complaint that found this: "avoid unpaved selected, route uses trails".
 */
export const UNPAVED_UNSUPPORTED_WARNING = 'unpaved_not_supported';

/**
 * Shade-graph canopy comparison endpoint.
 *
 * Lives on the same host as the shade router but is NOT a routing call: it
 * routes the pair on both graphs itself and reports how much of each sits
 * under tree canopy. Rate limited to 60/min per IP.
 */
const CANOPY_COMPARE_URL = 'https://osrm-shade.defensivepedal.com/compare';

/**
 * Shorter than the 15s routing budget on purpose. This is a garnish on a
 * route the rider already has; it runs concurrently with the elevation and
 * risk enrichment, and if it is the slowest thing in the preview it has
 * stopped being worth waiting for.
 */
const CANOPY_TIMEOUT_MS = 8_000;

/**
 * How long the preview will WAIT for the canopy call once everything else is
 * done — as opposed to how long the request itself is allowed to live.
 *
 * These are two different budgets and conflating them was a real defect: the
 * fetch starts early and overlaps the elevation and risk round-trips, so in
 * the normal case it has long since resolved and this costs nothing. But when
 * the shade host is slow or half-down, awaiting the full 8s timeout would add
 * those seconds to a route the rider already has. "Fails open" has to mean the
 * route display is unaffected in TIME as well as in content, so the wait is
 * capped here and the in-flight request is simply abandoned.
 */
const CANOPY_WAIT_DEADLINE_MS = 1_500;

/**
 * Resolve `promise`, or `undefined` if it has not settled within `ms`.
 *
 * The abandoned promise cannot reject (see `fetchCanopyComparison`), so
 * nothing is left to go unhandled.
 */
const resolveWithinDeadline = async <T>(
  promise: Promise<T | undefined>,
  ms: number,
): Promise<T | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Ask the shade server how much of each route runs under trees.
 *
 * Resolves to `undefined` for every failure — HTTP 400/429/502, a timeout, a
 * `NoRoute`/`TooLong` code, `display: false`, or a body we cannot read. The
 * caller renders nothing in that case and the route is unaffected, which is
 * the whole contract: this can never degrade a route preview.
 *
 * Note the coordinate order: `/compare` takes **lon,lat**, like OSRM's own
 * path segments and unlike our `Coordinate`.
 */
export const fetchCanopyComparison = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteCanopyComparison | undefined> => {
  const url =
    `${CANOPY_COMPARE_URL}?from=${origin.lon},${origin.lat}` +
    `&to=${destination.lon},${destination.lat}`;

  try {
    return await fetchAndRead(
      url,
      async (response) => {
        // 429 (rate limited), 400 and 502 all land here and all mean "show
        // nothing" — there is no retry, because a second call is exactly what
        // the 60/min budget is protecting against.
        if (!response.ok) return undefined;
        return parseCanopyCompareResponse(await response.json()) ?? undefined;
      },
      CANOPY_TIMEOUT_MS,
    );
  } catch {
    return undefined;
  }
};

export interface OsrmRouteFetch {
  readonly routes: Route[];
  /**
   * True when `exclude=unpaved` was asked for and had to be dropped because
   * nothing paved connects these points.
   *
   * The alternative was worse in both directions: the throw fell through to
   * Mapbox fast routing, so a rider asking for a SAFE, PAVED route silently
   * got one that was neither.
   */
  readonly pavedFallback: boolean;
}

const fetchOsrmRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
  avoidUnpaved: boolean,
  profile: SafeRoutingProfile,
  waypoints?: readonly Coordinate[],
): Promise<OsrmRouteFetch> => {
  const coords = buildCoordString(origin, destination, waypoints);
  // OSRM doesn't support alternatives with 3+ coordinates (waypoints)
  const hasWaypoints = waypoints && waypoints.length > 0;
  // Each profile is a separate graph behind its own hostname. The profile is
  // resolved once by the caller (`resolveSafeRoutingProfile`), so this never
  // has to know how the rider's flags combine.
  const base = OSRM_BASE[profile];
  let url = `${base}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${hasWaypoints ? 'false' : 'true'}&annotations=true`;

  if (avoidUnpaved) {
    url += '&exclude=unpaved';
  }

  // Body first, status second, and the order is the fix. OSRM reports "nothing
  // paved connects these points" as HTTP 400 with `code: NoRoute`, so a
  // status-first check threw straight past the fallback below. On this path
  // that throw propagates out of `directPreviewRoute` and the rider gets a
  // failed route preview rather than the paved route they asked for with a
  // note. It reproduces every time for a start that snaps to an unpaved edge.
  // See `osrmResponse.ts` for the measurements.
  const answer = await fetchAndRead(url, (response) =>
    readOsrmResponse<RouteResponse>(response),
  );

  if (answer.outcome === 'no_route') {
    // Nothing paved connects these points. Ask again without the constraint
    // and say so, rather than failing into a route that is neither safe nor
    // paved. Retried once only — a second NoRoute is a real failure.
    if (avoidUnpaved) {
      const relaxed = await fetchOsrmRoutes(
        origin,
        destination,
        false,
        profile,
        waypoints,
      );
      return { routes: relaxed.routes, pavedFallback: true };
    }
    throw new Error(`OSRM returned no routes (code: ${answer.code})`);
  }

  if (answer.outcome === 'empty') {
    throw new Error(`OSRM returned no routes (code: ${answer.code})`);
  }

  if (answer.outcome === 'failed') {
    throw new Error(`OSRM routing failed (${describeOsrmFailure(answer)})`);
  }

  const data = answer.data;

  // Zero-distance guard: for points OUTSIDE its data (e.g. Belgrade inside
  // the loose RO bbox, Bosnia inside the HR bbox, the Canaries), OSRM does
  // NOT error — it snaps both endpoints to the same far-away edge and
  // returns `Ok` with a distance-0 route (probed 2026-07-12). Throw the
  // typed error so `directPreviewRoute` degrades to Mapbox fast routing
  // instead of rendering a garbage route or surfacing a hard error.
  const routable = data.routes.filter((route) => route.distance > 0);
  if (routable.length === 0) {
    throw new OsrmOutOfCoverageError(
      'OSRM returned only zero-distance routes (outside data coverage).',
    );
  }

  return { routes: routable, pavedFallback: false };
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
  const data = await fetchAndRead(url, async (response) => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Mapbox routing failed (${response.status}): ${errorText || 'Unknown error'}`,
      );
    }
    return (await response.json()) as RouteResponse;
  });

  if (data.code !== 'Ok' || !data.routes?.length) {
    if (data.code === 'NoSegment') {
      throw new Error(`No cycling route found near this location. Try moving your pin closer to a road. (NoSegment)`);
    }
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
 * Where a route's duration came from, as far as climbing is concerned.
 *
 * `durationIncludesClimbs: true` — a ROUTER computed it. Every router this app
 * uses already slows the rider on climbs inside its own duration, so the ETA
 * stays at that duration and only the elevation data is added.
 * `durationIncludesClimbs: false` — an elevation-blind estimate (a GPX course
 * is distance at a constant pace), so climb time is added here.
 *
 * Required rather than defaulted: a caller that guesses wrong either counts
 * every climb twice or not at all, and neither shows up as a failure.
 *
 * MEASURED 2026-09-16, not assumed. The same road ridden both ways, identical
 * distance, against the live services: uphill is slower on every router by MORE
 * than this penalty's own up/down difference — OSRM Brașov→Poiana 671 s vs the
 * penalty's 336 s, Sinaia→Cota 1400 2,072 s vs 787 s, Tibidabo 489 s vs 191 s,
 * Innsbruck 287 s vs 100 s; Mapbox cycling Brașov→Poiana 914 s vs 336 s,
 * Stuttgart 410 s vs 147 s. Flat controls are symmetric (Copenhagen 1.00 on
 * both). The Lua reason for OSRM is `grade_speed_factor` on way speeds in
 * bicycle46/-flat/36 and a power-balance climb speed in bicycle46-ebike (§E1).
 * Adding the penalty on top counted every climb twice for the whole life of the
 * app: Râșnov → Poiana Brașov previewed 1 h 41 for an OSRM 1 h 30, and 1 h 16
 * on e-bike for 1 h 04 — while navigation, which sums raw step durations,
 * disagreed with its own preview from the first second of the ride.
 */
export interface ElevationEnrichmentOptions {
  readonly durationIncludesClimbs: boolean;
}

/**
 * Enrich a route with elevation data. Fetches elevation profile, gain, and loss
 * from the server using Mapbox Terrain-RGB tiles. Computes totalClimbMeters
 * and adjustedDurationSeconds (see `ElevationEnrichmentOptions` for when climb
 * time is added). Fails gracefully — returns unchanged route if elevation
 * fetch fails.
 */
export const enrichRouteWithElevation = async (
  route: RouteOption,
  coordinates: [number, number][],
  options: ElevationEnrichmentOptions,
): Promise<RouteOption> => {
  if (!mobileEnv.mobileApiUrl) return route;

  try {
    // Same 12k-point cap as the risk-segments POST below — EU-length routes
    // otherwise blow the server body limit (Sentry, 2026-07-12), and the
    // elevation chart is a uniform resample anyway.
    const bounded = downsampleCoordinates(coordinates, MAX_RISK_GEOMETRY_POINTS);

    // Routed through mobileApiFetch rather than a bare fetch: this call had NO
    // timeout at all and is awaited on the route-preview path, so a stalled
    // server left the preview spinner up forever. `catch` degrades gracefully,
    // but a hang never throws. See
    // docs/plans/external-review-triage-2026-09-25.md P1-3.
    //
    // maxRetries: 0 on purpose — elevation is optional enrichment the rider is
    // actively waiting on, so one bounded attempt beats three.
    const data = await mobileApiFetch<ElevationResponse>('/v1/elevation-profile', {
      method: 'POST',
      body: JSON.stringify({ coordinates: bounded }),
      maxRetries: 0,
    });

    const elevationGain = data.elevationGain ?? 0;
    const adjustedDurationSeconds = options.durationIncludesClimbs
      ? route.durationSeconds
      : computeAdjustedDuration(route.durationSeconds, elevationGain, route.distanceMeters);

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
    // Routed through mobileApiFetch rather than a bare fetch: this had NO
    // timeout and is awaited on the route-preview path, so a stalled server
    // left the preview spinner up forever (P1-3). mobileApiFetch also supplies
    // the same `Authorization: Bearer <supabase-jwt>` this used to build by
    // hand, plus the 401-refresh-and-retry it did not have.
    //
    // maxRetries: 0 — risk enrichment is optional and the rider is waiting.
    const data = await mobileApiFetch<{ riskSegments: RiskSegment[] }>(
      '/v1/risk-segments',
      {
        method: 'POST',
        body: JSON.stringify({ geometry }),
        maxRetries: 0,
      },
    );
    return data.riskSegments ?? [];
  } catch {
    return [];
  }
};

// Cap the geometry POSTed to /v1/risk-segments AND /v1/elevation-profile.
// EU-wide routing means a long cross-country route can carry hundreds of
// thousands of points — the raw body blows past the server's limit (Sentry
// FST_ERR_CTP_BODY_TOO_LARGE on both endpoints, 2026-07-12) and inflates
// the PostGIS / Terrain-RGB cost. 12k points ≈ ~300 KB JSON and ≈ 8 m
// spacing on a 100 km ride — far finer than the risk overlay or elevation
// chart needs.
const MAX_RISK_GEOMETRY_POINTS = 12_000;

/**
 * Risk segments for a bare coordinate array.
 *
 * Exported for surfaces that have geometry but no `RouteOption` to enrich —
 * historical trips are the live case: a past ride keeps its polyline but the
 * `routePreview` that carried its risk segments is long gone, so the trip map
 * and the trip share image had nothing to colour with and fell back to a single
 * flat line (reported from the device on preview 0.2.174).
 *
 * Returns `[]` rather than throwing on any failure, and `[]` is also the honest
 * answer outside the covered countries — the server gates that, so there is no
 * client-side country check here and no reverse-geocode round-trip. Every
 * consumer must treat an empty result as "draw the plain line", never as an
 * excuse to invent a colour.
 */
export const fetchRiskSegmentsForCoordinates = async (
  coordinates: readonly [number, number][],
): Promise<RiskSegment[]> => {
  if (coordinates.length < 2) return [];

  const geometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: downsampleCoordinates(
      coordinates as [number, number][],
      MAX_RISK_GEOMETRY_POINTS,
    ) as [number, number][],
  };

  return fetchRouteRiskSegments(geometry);
};

export const enrichRouteWithRisk = async (
  route: RouteOption,
  coordinates: [number, number][],
): Promise<RouteOption> => {
  // Shares the downsample + 12k cap with every other caller, so the limit that
  // exists to stop FST_ERR_CTP_BODY_TOO_LARGE has exactly one owner.
  const riskSegments = await fetchRiskSegmentsForCoordinates(coordinates);
  if (riskSegments.length === 0) return route;

  return { ...route, riskSegments };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DirectPreviewOptions {
  /**
   * Whether a shade route may fetch its canopy comparison.
   *
   * False for reroutes. `directReroute` shares this whole function, so without
   * an opt-out every mid-ride reroute on a Cool ride fired a `/compare` call
   * that NOTHING renders — the row lives only on route-preview. That wasted a
   * slice of the 60/min per-IP budget (shared across a carrier NAT), and did
   * it at the one moment latency actually matters: the rider is off-course.
   */
  readonly canopyComparison?: boolean;
}

export const directPreviewRoute = async (
  request: RoutePreviewRequest,
  options?: DirectPreviewOptions,
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
  let effectiveMode = requestedMode === 'safe' && !canUseOsrm ? 'fast' : requestedMode;
  // Flipped when OSRM answers a supported-bbox pair with only degenerate
  // zero-distance routes — a loose-bbox mis-hit (e.g. Chișinău sits inside
  // the RO box but outside the graph). Treated exactly like unsupported
  // coverage from that point on.
  let osrmCoverageMiss = false;

  // Fast/flat mode uses Mapbox Directions, which rejects routes > ~400km
  // straight-line distance (MOBILE-C). Fail fast with a clear message.
  const assertWithinMapboxDistance = () => {
    if (haversineDistance([origin.lat, origin.lon], [destination.lat, destination.lon]) > MAPBOX_MAX_STRAIGHT_LINE_M) {
      throw new Error(
        'Route is too long for fast routing. Please switch to Safe routing.',
      );
    }
  };

  // Which OSRM graph serves this request. Cool routing only where the shade
  // graph has data (RO at launch) — a stale persisted avoidHeat preference
  // outside coverage degrades to the next flag, mirroring the safe→fast
  // degrade above. E-bike covers every supported country on one hostname.
  const safeProfile = resolveSafeRoutingProfile(
    request,
    support.supported && isHeatRoutingAvailable(support.country),
  );

  let rawRoutes: Route[];
  let pavedFallback = false;
  /** True when the rider asked to avoid unpaved and this path cannot. */
  let unpavedUnsupported = false;
  if (effectiveMode === 'safe' && support.supported) {
    try {
      const fetched = await fetchOsrmRoutes(
        origin,
        destination,
        request.avoidUnpaved,
        safeProfile,
        waypoints,
      );
      rawRoutes = fetched.routes;
      pavedFallback = fetched.pavedFallback;
    } catch (error) {
      if (!(error instanceof OsrmOutOfCoverageError)) throw error;
      effectiveMode = 'fast';
      osrmCoverageMiss = true;
      assertWithinMapboxDistance();
      rawRoutes = await fetchMapboxRoutes(origin, destination, waypoints, request.locale);
      unpavedUnsupported = Boolean(request.avoidUnpaved);
    }
  } else {
    assertWithinMapboxDistance();
    rawRoutes = await fetchMapboxRoutes(origin, destination, waypoints, request.locale);
    // Fast routing is Mapbox, which has no unpaved exclusion on the cycling
    // profile. The preference is simply not achievable here, and saying so is
    // the difference between a limitation and a broken toggle.
    unpavedUnsupported = Boolean(request.avoidUnpaved);
  }

  const source: 'custom_osrm' | 'mapbox' =
    effectiveMode === 'safe' ? 'custom_osrm' : 'mapbox';

  /*
   * Canopy comparison for shade routes.
   *
   * Started HERE, immediately after the route comes back and before the
   * elevation/risk enrichment below, so it overlaps work the preview is
   * already waiting on and costs no wall-clock of its own. Awaited once, at
   * the end, next to the response.
   *
   * Eligibility is deliberately narrow — this describes the route on screen
   * or it describes nothing:
   *
   *  - `safeProfile === 'cool'` is the only signal that the shade graph
   *    actually served this route. `request.avoidHeat` is not: it is still
   *    true when heat routing is unavailable for the country and the request
   *    fell through to another profile.
   *  - A coverage miss means Mapbox served the route, so there is no shade
   *    route to compare.
   *  - `/compare` takes one origin and one destination and has no way to
   *    express a via point, so on a multi-stop route its numbers would
   *    describe a DIFFERENT path than the one the rider is looking at. Two
   *    honest percentages about the wrong route are still the wrong route.
   *  - `avoidUnpaved` is the same problem in quieter form. Our shade route is
   *    fetched with `exclude=unpaved`; `/compare` has no such parameter and —
   *    measured against the live server on 2026-09-17 — passing one anyway
   *    returns a BYTE-IDENTICAL response, i.e. it is accepted and silently
   *    ignored (error-log #93/#98). So there is no way to align the two, and
   *    "fixing" it by appending the parameter would look like it worked.
   */
  const canopyPromise =
    options?.canopyComparison !== false &&
    effectiveMode === 'safe' &&
    support.supported &&
    !osrmCoverageMiss &&
    safeProfile === 'cool' &&
    (waypoints?.length ?? 0) === 0 &&
    !request.avoidUnpaved
      ? fetchCanopyComparison(origin, destination)
      : null;

  const routes: RouteOption[] = rawRoutes.map((route, index) => {
    const mapped = mapRoute(route, source, index, locale);
    // The rider asked to avoid unpaved and we could not honour it. Say so on
    // the route itself rather than handing back something that quietly is not
    // what was asked for.
    const warnings = [
      ...mapped.warnings,
      ...(pavedFallback ? [PAVED_FALLBACK_WARNING] : []),
      ...(unpavedUnsupported ? [UNPAVED_UNSUPPORTED_WARNING] : []),
    ];
    return warnings.length === mapped.warnings.length
      ? mapped
      : { ...mapped, warnings };
  });

  // Enrich all routes with elevation data in parallel (non-blocking). Every
  // route here came from a router (OSRM or Mapbox), whose duration already
  // includes climbing.
  const elevationEnriched = await Promise.all(
    rawRoutes.map((rawRoute, index) =>
      enrichRouteWithElevation(routes[index], rawRoute.geometry.coordinates, {
        durationIncludesClimbs: true,
      }),
    ),
  );

  // Enrich all routes with risk segments in parallel (non-blocking).
  // `road_risk_data` exists only in RISK_DATA_COUNTRIES — elsewhere every
  // POST to /v1/risk-segments is a guaranteed-empty round trip per route
  // alternative, so skip the fetch entirely.
  const riskDataEligible =
    support.supported && isRiskDataAvailable(support.country);
  const enrichedRoutes = riskDataEligible
    ? await Promise.all(
        rawRoutes.map((rawRoute, index) =>
          enrichRouteWithRisk(elevationEnriched[index], rawRoute.geometry.coordinates),
        ),
      )
    : elevationEnriched;

  // Compute safe vs fast risk comparison if enabled — only meaningful when
  // we actually have an OSRM safe route to compare against, AND the country
  // has road_risk_data populated (gate shared with the risk enrichment above
  // via core's RISK_DATA_COUNTRIES). The inner `currentSegments.length > 0 &&
  // comparisonSegments.length > 0` guard stays as the backstop: `avgRisk([])`
  // is 0, and a `'same'` verdict from two empty arrays would render a false
  // "Same safety" label.
  const comparisonEligible =
    request.showRouteComparison &&
    !osrmCoverageMiss &&
    riskDataEligible;

  let comparison: RouteComparison | undefined;
  if (comparisonEligible && enrichedRoutes.length > 0) {
    try {
      const avgRisk = (segments: readonly RiskSegment[]) => {
        if (segments.length === 0) return 0;
        const total = segments.reduce((sum, s) => sum + s.riskScore, 0);
        return total / segments.length;
      };

      const currentSegments = enrichedRoutes[0].riskSegments;
      let comparisonSegments: readonly RiskSegment[] = [];
      let comparisonDurationSeconds: number | undefined;

      if (effectiveMode === 'safe') {
        // Skip comparison for very long routes — Mapbox 422s at > ~400km (MOBILE-2)
        if (haversineDistance([origin.lat, origin.lon], [destination.lat, destination.lon]) > MAPBOX_MAX_STRAIGHT_LINE_M) {
          // Leave comparison undefined; no comparison for extreme-distance routes.
        } else {
        // Fetch fast route for comparison
        const fastRawRoutes = await fetchMapboxRoutes(origin, destination, waypoints, request.locale);
        if (fastRawRoutes.length > 0) {
          const fastRoute = mapRoute(fastRawRoutes[0], 'mapbox', 0, locale);
          const fastEnriched = await enrichRouteWithRisk(fastRoute, fastRawRoutes[0].geometry.coordinates);
          comparisonSegments = fastEnriched.riskSegments;
          // Raw (not elevation-adjusted) duration — the comparison route is
          // never elevation-enriched, so compare raw vs raw for a fair delta.
          comparisonDurationSeconds = fastRoute.durationSeconds;
        }
        }
      } else {
        // Fetch safe route for comparison — guarded by support.supported above
        const safeRawRoutes = (
          await fetchOsrmRoutes(
            origin,
            destination,
            request.avoidUnpaved,
            safeProfile,
            waypoints,
          )
        ).routes;
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
          let verdict: RouteComparison['verdict'];
          if (currentAvg < comparisonAvg) {
            verdict = 'safer';
          } else if (currentAvg > comparisonAvg) {
            // Edge case: safe route scored worse — still inform the user
            verdict = 'similar';
          } else {
            verdict = 'same';
          }

          // Time cost of the calmer route vs the fast one — feeds the
          // "+X min for a calmer ride" line on the preview screen.
          //
          // Deliberately NOT produced for the cool graph. On a shade route
          // this delta is the time cost of the shade PATH, and it renders
          // directly above the canopy comparison, where the two read as one
          // statement: "+4 min ... / Shade route: 29% tree-lined". Shade is
          // not allowed to be priced in minutes — the shade profile changes
          // which roads are chosen, not how fast they are ridden, so the
          // delta is not a cost of shade and must not be presented as one.
          // (The "calmer ride" framing is also wrong here: the cool graph
          // optimises canopy, not traffic.)
          let extraMinutes: number | undefined;
          if (
            verdict === 'safer' &&
            comparisonDurationSeconds !== undefined &&
            safeProfile !== 'cool'
          ) {
            const extra = Math.round(
              (enrichedRoutes[0].durationSeconds - comparisonDurationSeconds) / 60,
            );
            if (extra >= 1) extraMinutes = extra;
          }

          comparison = {
            against: 'fast',
            verdict,
            diffPercent: verdict === 'safer' ? diffPercent : 0,
            extraMinutes,
            // Length-weighted tier-level exposure, alongside the older
            // score-level `diffPercent`. See `describeBusyRoadSaving`.
            busyRoadMeters: {
              current: busyRoadMeters(currentSegments),
              comparison: busyRoadMeters(comparisonSegments),
            },
          };
        } else if (effectiveMode === 'fast') {
          let verdict: RouteComparison['verdict'];
          if (currentAvg > comparisonAvg) {
            verdict = 'less_safe';
          } else if (currentAvg < comparisonAvg) {
            verdict = 'similar';
          } else {
            verdict = 'same';
          }

          comparison = {
            against: 'safe',
            verdict,
            diffPercent: verdict === 'less_safe' ? diffPercent : 0,
          };
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

  // A coverage miss reports as unsupported — the bbox said yes but the graph
  // said no, and the rider got the same Mapbox fallback either way.
  const effectivelyCovered = support.supported && !osrmCoverageMiss;
  const coverage: CoverageRegion = {
    countryCode: resolvedCountryCode,
    status: effectivelyCovered ? 'supported' : 'unsupported',
    safeRouting: effectivelyCovered,
    fastRouting: true,
  };

  // In flight across the elevation and risk round-trips, so this normally
  // resolves instantly. Capped so a slow shade host cannot hold up a route
  // the rider already has — see CANOPY_WAIT_DEADLINE_MS.
  const canopy = canopyPromise
    ? await resolveWithinDeadline(canopyPromise, CANOPY_WAIT_DEADLINE_MS)
    : undefined;

  return {
    routes: enrichedRoutes,
    selectedMode: effectiveMode,
    coverage,
    comparison,
    canopy,
    generatedAt: new Date().toISOString(),
  };
};

export const directReroute = async (
  request: RerouteRequest,
): Promise<RoutePreviewResponse> => {
  // Reroute uses the same logic as preview, minus the canopy comparison:
  // nothing renders it mid-ride, and a reroute is the worst moment to spend
  // latency or rate-limit budget on a garnish.
  return directPreviewRoute(request, { canopyComparison: false });
};

// ---------------------------------------------------------------------------
// Loop generation
// ---------------------------------------------------------------------------

/**
 * One generated loop, straight from OSRM.
 *
 * Returns the decoded coordinates alongside the route because every downstream
 * step needs them — risk and elevation enrichment take a bare coordinate array,
 * and the shape checks (`isOutAndBack`) measure the geometry directly. Decoding
 * the polyline again at each call site would be pure waste.
 */
export interface LoopRouteResult {
  readonly route: RouteOption;
  readonly coordinates: [number, number][];
  /**
   * Fraction of the loop on unpaved ways, in [0, 1].
   *
   * Read straight off `annotation.classes`, which the request already asks for
   * — no extra call and no rate-limit cost.
   */
  readonly unpavedShare: number;
  /**
   * Fraction of the loop ridden twice, in [0, 1]. Measured exactly from
   * `annotation.nodes` — also already requested, so also free.
   */
  readonly retracedShare: number;
  /** Doubling back inside the loop only, ignoring a deliberate stem. */
  readonly ringRetracedShare: number;
  /**
   * True when the rider asked for paved only and no paved loop exists here, so
   * the constraint was dropped to return something at all.
   */
  readonly pavedFallback: boolean;
  /** Metres of out-and-back approach, both passes. 0 for a plain loop. */
  readonly stemMeters: number;
  /**
   * Fraction of the loop on out-and-back spurs — detours hanging off the ride,
   * as distinct from the shared corridor out of town. Free: read off the same
   * annotation nodes the retrace figures use.
   */
  readonly spurShare: number;
  /**
   * The road stretches this loop uses, undirected.
   *
   * Carried so candidates can be compared by CONTENT. Route ids are minted
   * from `Date.now()`, so two identical routes fetched a millisecond apart get
   * different ids and an id-based comparison can never see they are the same.
   */
  readonly edgeKeys: readonly string[];
  /**
   * True when the LOOP portion is a there-and-back.
   *
   * Scoped to the ring rather than the whole route, and the scope is the
   * point: a lollipop rides out before it loops, so measuring the whole route
   * penalises the shape for being the shape. Measured on 300 real candidates,
   * five of 150 lollipops crossed the threshold purely because of their
   * approach.
   */
  readonly ringOutAndBack: boolean;
}

/**
 * Route one candidate ring: `start → w1 → w2 → w3 → start`.
 *
 * OSRM has no round-trip service, so a loop is a waypoint ring we synthesize
 * and then measure. Three things about this request are load-bearing:
 *
 *  - `alternatives=false`, because OSRM refuses alternatives with 3+ waypoints
 *    anyway, and because we want the ring we asked for rather than a variation.
 *  - `annotations=true`, which is what makes `leg.annotation.classes` available
 *    downstream — the same array `routeFeatures` reads for tunnels and bridges.
 *  - `terrain === 'flat'` selects the flat instance. That is the only terrain we
 *    can actually *request*: `bicycle36-flat` carries a 7× uphill penalty, while
 *    there is no hill-seeking counterpart, so Rolling and Hilly can only be
 *    ranked after measurement.
 *
 * The route comes back stamped `source: 'generated_loop'`, which is what
 * suppresses ordinary reroute and enables the forward-only snap window. Losing
 * that stamp means an off-route rider gets routed to `destination` — which on a
 * loop is where they started.
 *
 * Throws `OsrmOutOfCoverageError` when every route is degenerate, matching
 * `fetchOsrmRoutes`: OSRM answers out-of-data requests with `Ok` and a
 * distance-0 route rather than an error.
 */
export const fetchLoopRoute = async (
  start: Coordinate,
  waypoints: readonly Coordinate[],
  options: {
    readonly terrain: LoopTerrain;
    readonly surface: LoopSurface;
    readonly locale: Locale;
    /**
     * Legs at each end that are approach rather than loop — 1 for a lollipop,
     * whose anchor sits in `waypoints` before and after the ring, 0 otherwise.
     *
     * Taken from the caller because only the caller knows the shape it built.
     * Inferring it from the route was tried and does not work: see the note on
     * `splitStemAndRing`.
     */
    readonly stemLegs?: number;
    /** Internal: set when this call is the relaxed retry. Not for callers. */
    readonly pavedFallback?: boolean;
    readonly signal?: AbortSignal;
  },
): Promise<LoopRouteResult> => {
  const points = [start, ...waypoints, start];
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const base = usesFlatProfile(options.terrain) ? OSRM_BASE.flat : OSRM_BASE.standard;

  let url =
    `${base}/${coords}?overview=full&geometries=geojson&steps=true` +
    `&alternatives=false&annotations=true&continue_straight=false`;

  if (excludesUnpaved(options.surface)) {
    url += '&exclude=unpaved';
  }

  // Body first, status second — see the note on the point-to-point fetcher
  // above, and `osrmResponse.ts` for why.
  const answer = await fetchAndRead(
    url,
    (response) => readOsrmResponse<RouteResponse>(response),
    REQUEST_TIMEOUT_MS,
    options.signal,
  );

  if (answer.outcome === 'no_route') {
    // Same fallback as the point-to-point path, and it matters more here: a
    // failed candidate is silently dropped by `routeOneRing`, so without this
    // a paved-only search in trail country would report "no loops found" and
    // blame the search rather than the constraint.
    if (excludesUnpaved(options.surface)) {
      return fetchLoopRoute(start, waypoints, {
        ...options,
        surface: 'any',
        pavedFallback: true,
      });
    }
    throw new Error(`OSRM returned no loop (code: ${answer.code})`);
  }

  if (answer.outcome === 'empty') {
    throw new Error(`OSRM returned no loop (code: ${answer.code})`);
  }

  if (answer.outcome === 'failed') {
    throw new Error(`OSRM loop routing failed (${describeOsrmFailure(answer)})`);
  }

  const data = answer.data;
  const routable = data.routes.filter((route) => route.distance > 0);
  if (routable.length === 0) {
    throw new OsrmOutOfCoverageError(
      'OSRM returned only zero-distance loops (outside data coverage).',
    );
  }

  const raw = routable[0]!;
  const mapped = mapRoute(raw, 'custom_osrm', 0, options.locale);

  return {
    route: {
      ...mapped,
      id: `loop-${Math.round(raw.distance)}-${points.length}-${mapped.id}`,
      source: 'generated_loop',
      routingProfileVersion: usesFlatProfile(options.terrain)
        ? 'flat-profile-v1'
        : 'safety-profile-v1',
    },
    coordinates: raw.geometry.coordinates as [number, number][],
    unpavedShare: unpavedShare(raw.legs),
    retracedShare: retracedShare(raw.legs),
    ringRetracedShare: ringRetracedShare(raw.legs, options.stemLegs ?? 0),
    stemMeters: splitStemAndRing(raw.legs, options.stemLegs ?? 0).stemMeters,
    edgeKeys: routeEdgeKeys(raw.legs),
    spurShare: spurShare(raw.legs, options.stemLegs ?? 0),
    pavedFallback: options.pavedFallback ?? false,
    ringOutAndBack: isRingOutAndBack(raw.legs, options.stemLegs ?? 0),
  };
};


/**
 * Length-weighted mean scenic score for a route, from `/v1/scenic-segments`.
 *
 * Returns 0 on any failure or in an unscored area. That is deliberate and it
 * matters: 0 is the neutral value in the ranking, so a region with no scenic
 * coverage — or a server hiccup — ranks exactly as it did before scenic
 * existed, rather than pushing every candidate around on missing data.
 */
export const fetchRouteScenicScore = async (
  coordinates: [number, number][],
): Promise<number> => {
  if (!mobileEnv.mobileApiUrl) return 0;

  const geometry: GeoJsonLineString = {
    type: 'LineString',
    coordinates: downsampleCoordinates(
      coordinates,
      MAX_RISK_GEOMETRY_POINTS,
    ) as [number, number][],
  };

  try {
    // Bare fetch with no timeout, same as elevation and risk segments (P1-3).
    // mobileApiFetch supplies the Bearer token this built by hand.
    const data = await mobileApiFetch<{
      scenicSegments?: { scenicScore: number; geometry: GeoJsonLineString }[];
    }>('/v1/scenic-segments', {
      method: 'POST',
      body: JSON.stringify({ geometry }),
      maxRetries: 0,
    });
    const segments = data.scenicSegments ?? [];
    if (segments.length === 0) return 0;

    let weighted = 0;
    let total = 0;
    for (const segment of segments) {
      const coords = segment.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      let length = 0;
      for (let i = 1; i < coords.length; i += 1) {
        const [x0, y0] = coords[i - 1] as [number, number];
        const [x1, y1] = coords[i] as [number, number];
        length += Math.hypot(x1 - x0, y1 - y0);
      }
      if (length <= 0) continue;
      weighted += segment.scenicScore * length;
      total += length;
    }
    return total > 0 ? weighted / total : 0;
  } catch {
    return 0;
  }
};

/** Scenic via-point candidates on a ring, for loop generation. */
export const fetchScenicVias = async (
  start: Coordinate,
  ringRadiusMeters: number,
): Promise<{ lat: number; lon: number; scenicScore: number; sector: number }[]> => {
  if (!mobileEnv.mobileApiUrl) return [];
  try {
    // Bare fetch with no timeout (P1-3). This one is called during loop
    // generation, which fans out, so a stalled response stalled the search.
    const path =
      `/v1/scenic-vias` +
      `?lat=${start.lat}&lon=${start.lon}&radius=${Math.round(ringRadiusMeters)}`;
    const data = await mobileApiFetch<{
      vias?: { lat: number; lon: number; scenicScore: number; sector: number }[];
    }>(path, { maxRetries: 0 });
    return data.vias ?? [];
  } catch {
    return [];
  }
};
