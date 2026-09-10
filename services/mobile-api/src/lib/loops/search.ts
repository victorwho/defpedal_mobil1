/**
 * loops/search — turn a rider's four choices into loops they can ride.
 *
 * A faithful server-side port of `apps/mobile/src/lib/loop-generator.ts`. Every
 * decision it makes is imported from `@defensivepedal/core/loopPlan`, exactly as
 * the client does: ring geometry, the convergence controller, terrain cuts, the
 * relaxation ladder, the caps and the ranking. Nothing about loop QUALITY is
 * decided here — this module owns only the network and the sequencing, which is
 * which request to make next, how many, when to stop, and what to report while
 * it happens.
 *
 * It is a port and not an improvement, deliberately. The feature flag can serve
 * either implementation to the same rider, so a difference between them is a
 * bug report about loops changing for no reason. Improvements are listed in
 * `docs/plans/loop-generator.md` under "Server-side TODO" and land after the
 * flag does.
 *
 * ## The shape of one attempt
 *
 * Two rungs cost network, two do not. That asymmetry is the whole reason the
 * budget works:
 *
 *   1. `none`      — strict heading arc, strict distance. 5 rings.
 *   2. `heading`   — widened arc. 5 more rings, added to the same pool.
 *   3. `distance`  — no new requests. The pool already contains the loops that
 *                    were rejected for length; widening the tolerance simply
 *                    stops rejecting them.
 *   4. `terrain`   — no new requests either. Drop the terrain filter over what
 *                    we have and show the closest thing that exists.
 *
 * ## Ports
 *
 * Routing and measurement arrive as injected functions rather than imports, so
 * the orchestration can be exercised over recorded OSRM responses with no
 * network at all. That is what lets the parity test run this module and the
 * app's against the same fixtures and compare the ranked output.
 */
import {
  classifyTerrain,
  distanceError,
  headingAppliesAt,
  headingArcFor,
  initialRingRadiusMeters,
  isDegenerateLoop,
  LOLLIPOP_STEM_LEGS,
  LOOP_CANDIDATE_COUNT,
  LOOP_DUPLICATE_OVERLAP,
  LOOP_RESULTS_SHOWN,
  lollipopWaypoints,
  loopBearings,
  matchesTerrain,
  nextRingRadiusMeters,
  rankCandidates,
  ringWaypointCountFor,
  ringWaypoints,
  routeOverlapShare,
  terrainAppliesAt,
  withinDistanceTolerance,
  withinRetraceCap,
  withinRetraceCeiling,
  withinSpurCap,
  type Coordinate,
  type GeneratedLoop,
  type LoopRelaxation,
  type LoopSearchOutcome,
  type LoopSearchRequest,
} from '@defensivepedal/core';

import type { LoopRouteOptions, LoopRouteResult } from './osrm';

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/**
 * Attempts to land a ring on the requested length.
 *
 * Three, not two. With the sizing model corrected the first attempt is close,
 * so most candidates return on attempt one or two and never spend the third —
 * average cost goes DOWN versus the old two, where nearly every candidate used
 * both and still missed. The third exists for the tail: a first shot 50% long
 * needs two damped corrections to reach the 12% tolerance.
 */
const MAX_RADIUS_ITERATIONS = 3;

/** Rings thrown per rung. */
const RINGS_PER_RUNG = LOOP_CANDIDATE_COUNT;

/**
 * How many rings are in flight at once.
 *
 * Four rather than all five: the map draws each loop as it lands, so a
 * staggered arrival is what makes the wait legible rather than a stall followed
 * by everything at once. It also keeps a burst off the OSRM box, which matters
 * more from here than it did from a phone — one server can have many searches
 * running at once where one handset has exactly one.
 */
const RING_CONCURRENCY = 4;

/**
 * Finalists measured for climb, risk and scenery on the first pass.
 *
 * Matches what the rider is shown: a row without a climb figure is a row they
 * cannot choose between, and showing more rows than we measure produced exactly
 * that.
 */
const MEASURED_FINALISTS = LOOP_RESULTS_SHOWN;

/** Loops offered at once. */
export const LOOPS_PER_ATTEMPT = LOOP_RESULTS_SHOWN;

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface LoopSearchPorts {
  /** Route one ring. Throws on failure; the caller drops that candidate. */
  fetchRing(
    start: Coordinate,
    waypoints: readonly Coordinate[],
    options: LoopRouteOptions,
  ): Promise<LoopRouteResult>;
  /** Fetch climb, risk and scenery for one loop. Never throws. */
  measure(loop: GeneratedLoop): Promise<GeneratedLoop>;
}

export interface LoopSearchCallbacks {
  /** Fires as each ring resolves, so the client can draw it immediately. */
  readonly onCandidate?: (loop: GeneratedLoop) => void;
  /** Fires with resolved/attempted counts for the progress line. */
  readonly onProgress?: (resolved: number, attempted: number) => void;
  readonly signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// One ring
// ---------------------------------------------------------------------------

interface PooledLoop extends GeneratedLoop {
  /** Mutable during the search; stripped on the way out. Internal. */
  readonly radiusMeters: number;
  /** Road stretches used, for comparing candidates by content. Internal. */
  readonly edgeKeys: readonly string[];
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
  ports: LoopSearchPorts,
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
    // convergence for lollipops was a real bug — measured against live OSRM, an
    // unconverged 30 km request came back at 53 km, so every lollipop was then
    // thrown out by the distance filter and none was ever offered.
    const waypoints = lollipop
      ? lollipopWaypoints(
          request.start,
          bearingDegrees,
          shapeBudget,
          waypointCount,
        )
      : ringWaypoints(request.start, radius, bearingDegrees, waypointCount);

    let result: LoopRouteResult;
    try {
      result = await ports.fetchRing(request.start, waypoints, {
        terrain: request.terrain,
        surface: request.surface,
        // The measurement has to agree with the shape we just built, or the
        // stem exemption silently does nothing — which is exactly how the
        // previous detector failed.
        stemLegs: lollipop ? LOLLIPOP_STEM_LEGS : 0,
        signal,
      });
    } catch {
      // One dead bearing is not a dead search — out of coverage, a timeout, or
      // a ring that collapsed into water. The others are still running.
      return best;
    }

    const distanceMeters = result.route.distanceMeters;

    if (
      isDegenerateLoop(distanceMeters, request.targetDistanceMeters) ||
      // Scoped to the LOOP, not the whole route. Measuring the whole route
      // penalised a lollipop for having a lollipop's shape, and abandoning the
      // bearing here means attempts two and three never happen — so a
      // candidate that was merely the wrong SIZE never got resized.
      result.ringOutAndBack
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
      edgeKeys: result.edgeKeys,
      scenicScore: 0,
      ringRetracedShare: result.ringRetracedShare,
      spurShare: result.spurShare,
      pavedFallback: result.pavedFallback,
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

    if (
      withinDistanceTolerance(candidate, request.targetDistanceMeters, 'none')
    ) {
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

/** Run `tasks` with bounded concurrency. */
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
// The search
// ---------------------------------------------------------------------------

const strip = (loop: PooledLoop): GeneratedLoop => {
  const { radiusMeters: _radiusMeters, edgeKeys: _edgeKeys, ...rest } = loop;
  return rest;
};

/**
 * Find loops for one request.
 *
 * Walks the relaxation ladder, stopping at the first rung that produces
 * something the rider asked for. The rung it stopped at is returned so the
 * result card can name what moved — a relaxation the rider is not told about is
 * indistinguishable from the generator ignoring them.
 */
export const searchLoops = async (
  ports: LoopSearchPorts,
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
      const slot = index + shapeOffset;
      const loop = await routeOneRing(
        ports,
        request,
        bearing,
        relaxation,
        // Shape changes every SECOND slot while the ring/lollipop choice
        // alternates every slot, so a batch covers all four combinations.
        // Deriving both from the same parity — which is what shipped once —
        // made every lollipop a hexagon and every plain ring a triangle, so
        // half the search space was never tried.
        ringWaypointCountFor(Math.floor(slot / 2)),
        // Every OTHER candidate rides out somewhere before looping. Measured
        // against live OSRM around Rasnov and Bucharest, a lollipop clears the
        // doubling-back cap noticeably less often than a plain ring — it has to
        // close a loop out where the road network is thinner — so sampling them
        // at the same rate as rings is what gives the rider a real chance of
        // being offered one. They still compete on merit; this only decides how
        // many get to try.
        slot % 2 === 1,
        signal,
      );
      attempted += 1;
      if (loop) {
        // Reject a candidate that is the ride we already have. Neighbouring
        // bearings routinely converge onto the same roads, and offering both
        // spends one of five slots on a choice the rider cannot make.
        //
        // Compared by CONTENT, never by id: two byte-identical routes carry
        // different ids, so an id-based filter could never match them. That is
        // why duplicates used to reach the list.
        const duplicate = pool.some(
          (existing) =>
            routeOverlapShare(existing.edgeKeys, loop.edgeKeys) >=
            LOOP_DUPLICATE_OVERLAP,
        );
        if (!duplicate) {
          pool.push(loop);
          onCandidate?.(strip(loop));
        }
      }
      onProgress?.(pool.length, attempted);
      return loop;
    });

    await runPooled(tasks, RING_CONCURRENCY, signal);
  };

  /** Measure up to `limit` unmeasured loops from `ordered`, best first. */
  const measureSome = async (
    ordered: readonly PooledLoop[],
    limit: number,
  ): Promise<PooledLoop[]> => {
    const pending = ordered
      .filter((loop) => !measured.has(loop.id))
      .slice(0, limit);

    return Promise.all(
      pending.map(async (loop) => {
        const done = (await ports.measure(strip(loop))) as GeneratedLoop;
        const pooled: PooledLoop = {
          ...done,
          radiusMeters: loop.radiusMeters,
          edgeKeys: loop.edgeKeys,
        };
        measured.set(loop.id, pooled);
        onCandidate?.(done);
        return pooled;
      }),
    );
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
    // harder, not to lower the bar.
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
          ) &&
          withinRetraceCap(loop, 'distance') &&
          withinSpurCap(loop, 'distance') &&
          withinRetraceCeiling(loop),
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
        withinDistanceTolerance(
          loop,
          request.targetDistanceMeters,
          relaxation,
        ) &&
        withinRetraceCap(loop, relaxation) &&
        withinSpurCap(loop, relaxation) &&
        // Never relaxed, at any rung. `withinRetraceCap` is a preference the
        // ladder may give up so a rider in thin terrain still gets a ride;
        // this is the line past which the route is not a loop at all, and
        // offering it as "the least we could find" offers the wrong thing.
        withinRetraceCeiling(loop),
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
        withinDistanceTolerance(
          loop,
          request.targetDistanceMeters,
          relaxation,
        ) &&
        withinRetraceCap(loop, relaxation) &&
        withinSpurCap(loop, relaxation) &&
        withinRetraceCeiling(loop) &&
        matchesTerrain(loop, request.terrain),
    );

    // Escalate once. Claiming no hilly loop exists after checking five of ten
    // would be an honest-looking lie, so buy five more measurements before
    // saying it.
    if (matching.length === 0) {
      await measureSome(
        rankCandidates(currentPool(), request),
        MEASURED_FINALISTS,
      );
      if (aborted(signal)) return { status: 'cancelled' };

      matching = currentPool().filter(
        (loop) =>
          withinDistanceTolerance(
            loop,
            request.targetDistanceMeters,
            relaxation,
          ) &&
          withinRetraceCeiling(loop) &&
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

/** Re-exported so the route handler and tests agree on the terrain classifier. */
export { classifyTerrain };
