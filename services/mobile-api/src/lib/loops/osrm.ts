/**
 * One candidate ring, routed against the live OSRM graph.
 *
 * A server-side port of `fetchLoopRoute` in the app's `mapbox-routing.ts`. It
 * has to stay behaviourally identical to that function for as long as the
 * feature flag can point either way, which is what
 * `__tests__/loops-parity.test.ts` exists to hold it to.
 *
 * Three things about the request are load-bearing:
 *
 *  - `alternatives=false`, because OSRM refuses alternatives with 3+ waypoints
 *    anyway, and because we want the ring we asked for rather than a variation.
 *  - `annotations=true`, which carries `annotation.nodes` and
 *    `annotation.distance` — everything the retrace, spur and stem measurements
 *    are built from. Without it every candidate measures 0 and passes every cap
 *    silently.
 *  - `terrain === 'flat'` selects the flat instance. That is the only terrain we
 *    can actually *request*: `bicycle36-flat` carries a 7x uphill penalty, and
 *    there is no hill-seeking counterpart, so Rolling and Hilly can only ever be
 *    ranked after measurement.
 */
import {
  encodePolyline,
  excludesUnpaved,
  extractRouteFeatures,
  formatInstruction,
  readOsrmResponse,
  describeOsrmFailure,
  isRingOutAndBack,
  retracedShare,
  ringRetracedShare,
  routeEdgeKeys,
  spurShare,
  splitStemAndRing,
  unpavedShare,
  usesFlatProfile,
  type Coordinate,
  type LoopSurface,
  type LoopTerrain,
  type NavigationStep,
  type Route,
  type RouteOption,
  type RouteResponse,
} from '@defensivepedal/core';

import { config } from '../../config';

/** How long one ring request may take before it is abandoned. */
const OSRM_TIMEOUT_MS = 15_000;

/**
 * OSRM answered `Ok` but every route was distance-0.
 *
 * Named because it is not an error condition: for points outside its data OSRM
 * snaps both ends to the same far-away edge and returns a valid-looking route
 * of zero length rather than failing. The caller drops the candidate instead of
 * correcting a radius off a number that means nothing.
 */
export class OsrmOutOfCoverageError extends Error {}

export interface LoopRouteResult {
  readonly route: RouteOption;
  readonly coordinates: [number, number][];
  readonly unpavedShare: number;
  readonly retracedShare: number;
  readonly ringRetracedShare: number;
  readonly spurShare: number;
  readonly stemMeters: number;
  readonly edgeKeys: readonly string[];
  readonly pavedFallback: boolean;
  /**
   * True when the LOOP portion is a there-and-back.
   *
   * Measured here rather than by the caller because it needs the legs, and
   * because scope is the whole point: a lollipop's ride out inflates a
   * whole-route measurement by construction, which used to reject the shape
   * for having the shape.
   */
  readonly ringOutAndBack: boolean;
}

export interface LoopRouteOptions {
  readonly terrain: LoopTerrain;
  readonly surface: LoopSurface;
  /**
   * Legs at each end that are approach rather than loop — 1 for a lollipop,
   * whose anchor sits in `waypoints` before and after the ring, 0 otherwise.
   *
   * Taken from the caller because only the caller knows the shape it built.
   * Inferring it from the route was tried and does not work: a literal
   * out-and-back shares barely half its edges between the two directions, so
   * the mirrored-prefix detector this replaced reported a 0 m stem for every
   * lollipop ever generated.
   */
  readonly stemLegs?: number;
  /** Internal: set when this call is the relaxed retry. Not for callers. */
  readonly pavedFallback?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Every step of every leg, in ride order.
 *
 * `flatMap`, not `legs[0]` — a ring has four legs and a lollipop six, so
 * reading only the first would hand the rider turn-by-turn for the opening
 * quarter of the ride and silence after that. The server's existing
 * `normalizeRoutePreviewResponse` does read `legs[0]`, which is right for the
 * single-leg A-to-B routes it was written for and wrong here. That is why this
 * builds its own route object rather than reusing that normaliser.
 *
 * Instructions are the plain English fallback on purpose. OSRM ships no
 * instruction text and the localised phrase catalogue lives in the app's i18n
 * layer, so the client re-derives the rider-visible string from `maneuver` and
 * `streetName`. Rendering what the server sends would put English turn cues in
 * front of every Romanian and Spanish rider. See `GeneratedLoop` in core.
 */
const toNavigationSteps = (route: Route): NavigationStep[] =>
  route.legs
    .flatMap((leg) => leg.steps)
    .map((step, index) => ({
      id: `step-${index}`,
      instruction: formatInstruction(step),
      streetName: step.name || '',
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuver: step.maneuver,
      geometry: step.geometry,
      mode: step.mode,
    }));

/**
 * A unique id per candidate.
 *
 * A counter rather than the clock. The client mints loop ids from `Date.now()`,
 * and with four rings in flight two can resolve inside the same millisecond and
 * collide — which downstream means one candidate silently overwriting another
 * in the measured map. Ids never cross a request boundary, so a process-local
 * counter is both sufficient and collision-proof.
 */
let candidateSequence = 0;

export const buildLoopRouteOption = (
  raw: Route,
  terrain: LoopTerrain,
): RouteOption => {
  candidateSequence += 1;
  return {
    id: `loop-${Math.round(raw.distance)}-${candidateSequence}`,
    // The marker that suppresses ordinary reroute. On a loop the destination
    // IS the origin, so an unsuppressed reroute asks for the shortest way home
    // and silently deletes the rest of the ride.
    source: 'generated_loop',
    routingEngineVersion: config.versions.safeRoutingEngineVersion,
    routingProfileVersion: usesFlatProfile(terrain)
      ? 'flat-profile-v1'
      : config.versions.safeRoutingProfileVersion,
    mapDataVersion: config.versions.mapDataVersion,
    riskModelVersion: config.versions.riskModelVersion,
    geometryPolyline6: encodePolyline(raw.geometry.coordinates),
    distanceMeters: raw.distance,
    durationSeconds: raw.duration,
    adjustedDurationSeconds: raw.duration,
    totalClimbMeters: null,
    steps: toNavigationSteps(raw),
    riskSegments: [],
    routeFeatures: extractRouteFeatures(raw, 0),
    warnings: [],
  };
};

/**
 * Everything measurable off a routed ring, none of which costs a further call.
 *
 * Split out from the fetch so the tests can run it over recorded responses —
 * every share below is derived from `annotation`, which is exactly the part a
 * hand-built fixture gets wrong.
 */
export const measureLoopGeometry = (
  raw: Route,
  terrain: LoopTerrain,
  stemLegs: number,
  pavedFallback: boolean,
): LoopRouteResult => ({
  route: buildLoopRouteOption(raw, terrain),
  coordinates: raw.geometry.coordinates as [number, number][],
  unpavedShare: unpavedShare(raw.legs),
  retracedShare: retracedShare(raw.legs),
  ringRetracedShare: ringRetracedShare(raw.legs, stemLegs),
  spurShare: spurShare(raw.legs, stemLegs),
  stemMeters: splitStemAndRing(raw.legs, stemLegs).stemMeters,
  edgeKeys: routeEdgeKeys(raw.legs),
  pavedFallback,
  ringOutAndBack: isRingOutAndBack(raw.legs, stemLegs),
});

export const buildLoopUrl = (
  start: Coordinate,
  waypoints: readonly Coordinate[],
  options: Pick<LoopRouteOptions, 'terrain' | 'surface'>,
): string => {
  const points = [start, ...waypoints, start];
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const base = usesFlatProfile(options.terrain)
    ? config.safeOsrmFlatBaseUrl
    : config.safeOsrmBaseUrl;

  let url =
    `${base}/${coords}?overview=full&geometries=geojson&steps=true` +
    `&alternatives=false&annotations=true&continue_straight=false`;

  if (excludesUnpaved(options.surface)) url += '&exclude=unpaved';
  return url;
};

const fetchWithTimeout = async (
  url: string,
  callerSignal?: AbortSignal,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onAbort);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onAbort);
  }
};

/**
 * Route one candidate ring: `start -> w1 -> w2 -> w3 -> start`.
 *
 * Retries once without `exclude=unpaved` when nothing paved connects the ring,
 * and says so through `pavedFallback`. That matters more here than on a
 * point-to-point route: a failed candidate is silently dropped by the caller,
 * so without the retry a paved-only search in trail country would report "no
 * loops found" and blame the search rather than the constraint.
 */
export const fetchLoopRoute = async (
  start: Coordinate,
  waypoints: readonly Coordinate[],
  options: LoopRouteOptions,
): Promise<LoopRouteResult> => {
  const response = await fetchWithTimeout(
    buildLoopUrl(start, waypoints, options),
    options.signal,
  );

  // Body first, status second. OSRM answers "nothing paved connects this ring"
  // with HTTP 400 carrying `code: NoRoute`, so testing the status first threw
  // straight past the fallback below — which is the whole reason the fallback
  // exists. See `osrmResponse.ts` for the measurements.
  const answer = await readOsrmResponse<RouteResponse>(response);

  if (answer.outcome === 'no_route') {
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
    throw new Error(
      `OSRM loop routing failed (${describeOsrmFailure(answer)})`,
    );
  }

  const data = answer.data;
  const routable = data.routes.filter((route) => route.distance > 0);
  if (routable.length === 0) {
    throw new OsrmOutOfCoverageError(
      'OSRM returned only zero-distance loops (outside data coverage).',
    );
  }

  return measureLoopGeometry(
    routable[0]!,
    options.terrain,
    options.stemLegs ?? 0,
    options.pavedFallback ?? false,
  );
};
