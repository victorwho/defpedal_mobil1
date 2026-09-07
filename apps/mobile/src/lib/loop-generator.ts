/**
 * loop-generator — turn a rider's four choices into loops they can ride.
 *
 * The pure decisions all live in `@defensivepedal/core/loopPlan`: ring
 * geometry, the convergence controller, terrain cuts, the relaxation ladder and
 * the ranking. This module owns only the network and the sequencing — which
 * request to make next, how many, when to stop, and what to report while it
 * happens.
 *
 * ## The shape of one attempt
 *
 * Two rungs cost network, two do not. That asymmetry is the whole reason the
 * budget works:
 *
 *   1. `none`      — strict heading arc, strict distance. 8 rings.
 *   2. `heading`   — widened arc. 8 more rings, added to the same pool.
 *   3. `distance`  — no new requests. The pool already contains the loops that
 *                    were rejected for length; widening the tolerance simply
 *                    stops rejecting them.
 *   4. `terrain`   — no new requests either. Drop the terrain filter over what
 *                    we have and show the closest thing that exists.
 *
 * ## Why the measurement is staged
 *
 * Distance comes free with every OSRM response. Climb and risk do not — each
 * needs a call to our own API, and `/elevation-profile` and `/risk-segments`
 * share the `routePreview` rate-limit bucket at 30 requests per 60 seconds.
 * Measuring all sixteen candidates would let a rider rate-limit their own app
 * and take the risk overlay down with it, so only the three finalists are
 * measured, and only three more if the terrain ask went unmet.
 */
import {
  classifyTerrain,
  distanceError,
  headingAppliesAt,
  headingArcFor,
  highRiskMeters,
  initialRingRadiusMeters,
  isDegenerateLoop,
  isOutAndBack,
  LOOP_CANDIDATE_COUNT,
  loopBearings,
  matchesTerrain,
  nextRingRadiusMeters,
  rankCandidates,
  LOLLIPOP_STEM_LEGS,
  lollipopWaypoints,
  ringWaypoints,
  ringWaypointCountFor,
  terrainAppliesAt,
  withinRetraceCap,
  withinDistanceTolerance,
  type Coordinate,
  type LoopHeading,
  type LoopRelaxation,
  type LoopSurface,
  type LoopTerrain,
  type RouteOption,
} from '@defensivepedal/core';

import {
  enrichRouteWithElevation,
  enrichRouteWithRisk,
  fetchLoopRoute,
  fetchRouteScenicScore,
} from './mapbox-routing';
import type { Locale } from '../i18n';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Radius corrections allowed per ring before giving up on it.
 *
 * Two, not more. The controller converges fast when the network cooperates and
 * never converges at all when it does not — a ring pinned against a coastline
 * returns the same wrong distance whatever radius it is given. Spending a third
 * round trip discovering that costs the rider seconds and buys nothing; there
 * are seven other bearings that might work.
 */
const MAX_RADIUS_ITERATIONS = 2;

/** Rings thrown per rung. */
const RINGS_PER_RUNG = LOOP_CANDIDATE_COUNT;

/**
 * How many rings are in flight at once.
 *
 * Four rather than all eight: the map draws each loop as it lands, so a
 * staggered arrival is what makes the wait legible rather than a stall
 * followed by everything at once. It also keeps a burst off the OSRM box.
 */
const RING_CONCURRENCY = 4;

/** Finalists measured for climb and risk on the first pass. */
const MEASURED_FINALISTS = 3;

/** Loops shown at once. */
export const LOOPS_PER_ATTEMPT = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopSearchRequest {
  readonly start: Coordinate;
  readonly targetDistanceMeters: number;
  readonly terrain: LoopTerrain;
  readonly surface: LoopSurface;
  readonly heading: LoopHeading;
  readonly locale: Locale;
}

export interface GeneratedLoop {
  readonly id: string;
  readonly route: RouteOption;
  readonly coordinates: [number, number][];
  readonly bearingDegrees: number;
  readonly distanceMeters: number;
  /** Null until the elevation pass has run. */
  readonly climbMeters: number | null;
  readonly highRiskMeters: number;
  /**
   * Fraction of the loop on unpaved ways, in [0, 1]. Available from the moment
   * the ring is routed, because it is read off annotations we already request.
   */
  readonly unpavedShare: number;
  /** Fraction of the loop ridden twice, in [0, 1]. Free, like unpavedShare. */
  readonly retracedShare: number;
  /** Doubling back inside the loop only — what the cap tests. */
  readonly ringRetracedShare: number;
  /** Metres of out-and-back approach, both passes. 0 for a plain loop. */
  readonly stemMeters: number;
  /**
   * Length-weighted mean scenic score in [-1, 1]; 0 until measured, and 0
   * forever in an unscored area — both mean "do not move the ranking".
   */
  readonly scenicScore: number;
  /** Which rung of the ladder produced it. */
  readonly relaxation: LoopRelaxation;
  /** Measured terrain, or null when climb was never looked up. */
  readonly terrain: LoopTerrain | null;
  /** True once climb and risk have been fetched. */
  readonly measured: boolean;
}

export type LoopSearchOutcome =
  /**
   * Loops found. `relaxation` names what, if anything, was given up, and the
   * result card must say so — a relaxation the rider is not told about is
   * indistinguishable from the generator ignoring them.
   *
   * `relaxation === 'terrain'` IS the honest miss. There is deliberately no
   * separate failure status for it: the last rung of the ladder is "drop the
   * terrain ask and show the closest thing that exists", which is exactly what
   * a miss means. A second status would be a second way to say the same thing,
   * and the two would drift.
   *
   * `checked` is how many loops were actually measured. The miss copy quotes
   * it, and quoting a real number is the difference between a true statement
   * and a plausible lie.
   */
  | {
      readonly status: 'ok';
      readonly loops: readonly GeneratedLoop[];
      readonly relaxation: LoopRelaxation;
      readonly checked: number;
    }
  /** Nothing rideable came back at all. */
  | { readonly status: 'empty' }
  /** The rider cancelled. Never charge for this. */
  | { readonly status: 'cancelled' };

export interface LoopSearchCallbacks {
  /** Fires as each ring resolves, so the map can draw it immediately. */
  readonly onCandidate?: (loop: GeneratedLoop) => void;
  /** Fires with resolved/attempted counts for the progress line. */
  readonly onProgress?: (resolved: number, attempted: number) => void;
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// One ring
// ---------------------------------------------------------------------------

interface PooledLoop extends GeneratedLoop {
  /** Mutable during the search; frozen into `GeneratedLoop` on the way out. */
  readonly radiusMeters: number;
}

const aborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

/**
 * Route one bearing, correcting the radius until the length lands or the
 * iteration budget runs out.
 *
 * Returns the best attempt rather than only an in-tolerance one: a loop that
 * missed the strict band is exactly what the `distance` rung of the ladder
 * exists to rescue, and re-requesting it later would be a wasted round trip.
 * Returns null only for a ring that is unusable at any tolerance — degenerate,
 * or an out-and-back wearing a loop's clothes.
 */
const routeOneRing = async (
  request: LoopSearchRequest,
  bearingDegrees: number,
  relaxation: LoopRelaxation,
  waypointCount: number,
  /**
   * Ride out to somewhere else and loop THERE, rather than ringing the start.
   *
   * The shape a rider wants when the good riding is not where they live. Its
   * stem is retraced by construction, which the cap exempts via
   * `ringRetracedShare`.
   */
  lollipop: boolean,
  signal?: AbortSignal,
): Promise<PooledLoop | null> => {
  let radius = initialRingRadiusMeters(
    request.targetDistanceMeters,
    waypointCount,
  );
  /** A lollipop's size knob: the notional total the shape is built for. */
  let shapeBudget = request.targetDistanceMeters;
  let best: PooledLoop | null = null;

  for (let attempt = 0; attempt < MAX_RADIUS_ITERATIONS; attempt += 1) {
    if (aborted(signal)) return null;

    // Both shapes converge, they just have different size knobs: a plain ring
    // scales its radius, a lollipop scales the whole stem+ring budget. Skipping
    // convergence for lollipops was a real bug — measured against live OSRM,
    // an unconverged 30 km request came back at 53 km, so every lollipop was
    // then thrown out by the distance filter and none was ever offered.
    const waypoints = lollipop
      ? lollipopWaypoints(
          request.start,
          bearingDegrees,
          shapeBudget,
          waypointCount,
        )
      : ringWaypoints(request.start, radius, bearingDegrees, waypointCount);

    let result;
    try {
      result = await fetchLoopRoute(request.start, waypoints, {
        terrain: request.terrain,
        surface: request.surface,
        locale: request.locale,
        // The measurement has to agree with the shape we just built, or the
        // stem exemption silently does nothing — which is exactly how the
        // previous detector failed.
        stemLegs: lollipop ? LOLLIPOP_STEM_LEGS : 0,
        signal,
      });
    } catch {
      // One dead bearing is not a dead search — out of coverage, a timeout, or
      // a ring that collapsed into water. Seven others are still running.
      return best;
    }

    const distanceMeters = result.route.distanceMeters;

    if (
      isDegenerateLoop(distanceMeters, request.targetDistanceMeters) ||
      isOutAndBack(request.start, result.coordinates, distanceMeters)
    ) {
      // Correcting off a collapsed ring sends the radius nowhere useful.
      return best;
    }

    const candidate: PooledLoop = {
      id: result.route.id,
      route: result.route,
      coordinates: result.coordinates,
      bearingDegrees,
      distanceMeters,
      climbMeters: null,
      highRiskMeters: 0,
      unpavedShare: result.unpavedShare,
      retracedShare: result.retracedShare,
      scenicScore: 0,
      ringRetracedShare: result.ringRetracedShare,
      stemMeters: result.stemMeters,
      relaxation,
      terrain: null,
      measured: false,
      radiusMeters: radius,
    };

    const better =
      best === null ||
      distanceError(candidate, request.targetDistanceMeters) <
        distanceError(best, request.targetDistanceMeters);
    if (better) best = candidate;

    if (withinDistanceTolerance(candidate, request.targetDistanceMeters, 'none')) {
      return candidate;
    }

    if (lollipop) {
      // Same proportional controller, applied to the budget rather than a
      // radius — it scales the stem and the ring together, keeping the shape.
      shapeBudget = nextRingRadiusMeters(
        shapeBudget,
        distanceMeters,
        request.targetDistanceMeters,
      );
    } else {
      radius = nextRingRadiusMeters(
        radius,
        distanceMeters,
        request.targetDistanceMeters,
      );
    }
  }

  return best;
};

/** Run `tasks` with bounded concurrency, preserving completion order effects. */
const runPooled = async <T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal,
): Promise<T[]> => {
  const results: T[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (aborted(signal)) return;
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      results.push(await tasks[index]!());
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );

  return results;
};

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Fetch climb and risk for one loop.
 *
 * Two API calls, both against the shared `routePreview` bucket. Both degrade
 * quietly: `enrichRouteWithElevation` and `enrichRouteWithRisk` return the
 * route unchanged on failure, so a measured loop with no climb reads as
 * unmeasured rather than as flat — which matters, because `matchesTerrain`
 * refuses to claim a terrain it never measured.
 */
const measureLoop = async (loop: PooledLoop): Promise<PooledLoop> => {
  // Three calls, all on the shared routePreview bucket. Scenic joins climb and
  // risk here rather than being fetched for every candidate, for exactly the
  // same reason: the bucket is 30/60s and only finalists are worth measuring.
  const [withElevation, withRisk, scenicScore] = await Promise.all([
    enrichRouteWithElevation(loop.route, loop.coordinates),
    enrichRouteWithRisk(loop.route, loop.coordinates),
    fetchRouteScenicScore(loop.coordinates),
  ]);

  const climbMeters = withElevation.totalClimbMeters;
  const riskSegments = withRisk.riskSegments;

  return {
    ...loop,
    route: {
      ...loop.route,
      totalClimbMeters: climbMeters,
      elevationProfile: withElevation.elevationProfile,
      adjustedDurationSeconds: withElevation.adjustedDurationSeconds,
      riskSegments,
    },
    climbMeters,
    highRiskMeters: highRiskMeters(riskSegments),
    scenicScore,
    terrain:
      climbMeters === null
        ? null
        : classifyTerrain(climbMeters, loop.distanceMeters),
    measured: true,
  };
};

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

const strip = (loop: PooledLoop): GeneratedLoop => {
  const { radiusMeters: _radiusMeters, ...rest } = loop;
  return rest;
};

/**
 * Find loops for one request.
 *
 * Walks the relaxation ladder, stopping at the first rung that produces
 * something the rider asked for. The rung it stopped at is returned so the
 * result card can name what moved — a relaxation the rider is not told about
 * is indistinguishable from the generator ignoring them.
 */
export const searchLoops = async (
  request: LoopSearchRequest,
  callbacks: LoopSearchCallbacks = {},
): Promise<LoopSearchOutcome> => {
  const { onCandidate, onProgress, signal } = callbacks;

  const pool: PooledLoop[] = [];
  const measured = new Map<string, PooledLoop>();
  let attempted = 0;
  let capRescueDone = false;

  /** Throw a rung's worth of rings into the pool. */
  const generateRung = async (
    relaxation: LoopRelaxation,
    shapeOffset = 0,
  ): Promise<void> => {
    const heading = headingAppliesAt(relaxation) ? request.heading : 'any';
    const bearings = loopBearings(
      heading,
      RINGS_PER_RUNG,
      headingArcFor(relaxation),
    );

    // Alternate the ring shape across the batch. Shape is as decisive as
    // bearing for how much a loop repeats itself, and neither 3 nor 6 wins
    // everywhere, so a batch samples both rather than betting on one.
    const tasks = bearings.map((bearing, index) => async () => {
      const loop = await routeOneRing(
        request,
        bearing,
        relaxation,
        ringWaypointCountFor(index + shapeOffset),
        // Every OTHER candidate rides out somewhere before looping, rather
        // than every third. Measured against live OSRM around Rasnov and
        // Bucharest, a lollipop clears the doubling-back cap noticeably less
        // often than a plain ring — it has to close a loop out where the road
        // network is thinner — so sampling them at the same rate as rings is
        // what gives the rider a real chance of being offered one. They still
        // compete on merit; this only decides how many get to try.
        //
        // Mixed into the same pool rather than hidden behind a control: the
        // terrain preference already steers towards them where it matters,
        // because a ring in the foothills measures hillier than one round the
        // town.
        (index + shapeOffset) % 2 === 1,
        signal,
      );
      attempted += 1;
      if (loop) {
        pool.push(loop);
        onCandidate?.(strip(loop));
      }
      onProgress?.(pool.length, attempted);
      return loop;
    });

    await runPooled(tasks, RING_CONCURRENCY, signal);
  };

  /** Measure up to `limit` unmeasured loops from `ordered`, nearest-first. */
  const measureSome = async (
    ordered: readonly PooledLoop[],
    limit: number,
  ): Promise<PooledLoop[]> => {
    const pending = ordered
      .filter((loop) => !measured.has(loop.id))
      .slice(0, limit);

    const results = await Promise.all(
      pending.map(async (loop) => {
        const done = await measureLoop(loop);
        measured.set(loop.id, done);
        onCandidate?.(strip(done));
        return done;
      }),
    );

    return results;
  };

  /** Everything in the pool, with measurements folded in where we have them. */
  const currentPool = (): PooledLoop[] =>
    pool.map((loop) => measured.get(loop.id) ?? loop);

  const ladder: LoopRelaxation[] = [
    'none',
    'heading',
    'distance',
    'terrain',
    'retrace',
  ];

  for (const relaxation of ladder) {
    if (aborted(signal)) return { status: 'cancelled' };

    // Only the first two rungs cost network. `distance` and `terrain` are
    // filter relaxations over loops we have already paid for.
    if (relaxation === 'none' || relaxation === 'heading') {
      await generateRung(relaxation, relaxation === 'heading' ? 1 : 0);
      if (aborted(signal)) return { status: 'cancelled' };
    }

    // Before bending the doubling-back cap — the one constraint the rider set
    // as a hard limit — spend one more sweep hunting a loop that satisfies it.
    // Compliant loops exist in every network measured; they are just bearing-
    // and shape-dependent, so the fix for "the cap always bends" is to look
    // harder, not to lower the bar. OSRM is our own box, so this costs latency
    // and nothing else.
    if (relaxation === 'retrace' && !capRescueDone) {
      capRescueDone = true;
      await generateRung('heading', 1);
      await generateRung('heading', 0);
      if (aborted(signal)) return { status: 'cancelled' };

      const rescued = currentPool().filter(
        (loop) =>
          withinDistanceTolerance(
            loop,
            request.targetDistanceMeters,
            'distance',
          ) && withinRetraceCap(loop, 'distance'),
      );
      if (rescued.length > 0) {
        const finalists = rankCandidates(rescued, request).slice(
          0,
          LOOPS_PER_ATTEMPT,
        );
        await measureSome(finalists, LOOPS_PER_ATTEMPT);
        if (aborted(signal)) return { status: 'cancelled' };
        return {
          status: 'ok',
          loops: rankCandidates(
            finalists.map((l) => measured.get(l.id) ?? l),
            request,
          ).map(strip),
          // The cap held; only distance was widened to get there.
          relaxation: 'distance',
          checked: measured.size,
        };
      }
    }

    const viable = currentPool().filter(
      (loop) =>
        withinDistanceTolerance(loop, request.targetDistanceMeters, relaxation) &&
        withinRetraceCap(loop, relaxation),
    );
    if (viable.length === 0) continue;

    const ordered = rankCandidates(viable, request);

    // Terrain is the one constraint that needs measurement to test, so it is
    // the one that decides how much measuring we do.
    if (!terrainAppliesAt(relaxation)) {
      const finalists = ordered.slice(0, LOOPS_PER_ATTEMPT);
      await measureSome(finalists, LOOPS_PER_ATTEMPT);
      if (aborted(signal)) return { status: 'cancelled' };

      const resolved = rankCandidates(
        finalists.map((loop) => measured.get(loop.id) ?? loop),
        request,
      );
      return {
        status: 'ok',
        loops: resolved.map(strip),
        relaxation,
        checked: measured.size,
      };
    }

    await measureSome(ordered, MEASURED_FINALISTS);
    if (aborted(signal)) return { status: 'cancelled' };

    let matching = currentPool().filter(
      (loop) =>
        withinDistanceTolerance(loop, request.targetDistanceMeters, relaxation) &&
        withinRetraceCap(loop, relaxation) &&
        matchesTerrain(loop, request.terrain),
    );

    // Escalate once. Claiming no hilly loop exists after checking three of
    // sixteen would be an honest-looking lie, so buy three more measurements
    // before saying it.
    if (matching.length === 0) {
      await measureSome(rankCandidates(currentPool(), request), MEASURED_FINALISTS);
      if (aborted(signal)) return { status: 'cancelled' };

      matching = currentPool().filter(
        (loop) =>
          withinDistanceTolerance(loop, request.targetDistanceMeters, relaxation) &&
          matchesTerrain(loop, request.terrain),
      );
    }

    if (matching.length > 0) {
      return {
        status: 'ok',
        loops: rankCandidates(matching, request)
          .slice(0, LOOPS_PER_ATTEMPT)
          .map(strip),
        relaxation,
        checked: measured.size,
      };
    }
  }

  // Ladder exhausted with nothing viable at any tolerance: the roads around
  // this start do not close into a loop of the length asked for.
  return { status: 'empty' };
};
