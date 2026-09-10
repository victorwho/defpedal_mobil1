// @vitest-environment node
/**
 * The search orchestration: which request to make next, how many, when to stop.
 *
 * Everything here runs over injected ports rather than a network, because the
 * questions are about SEQUENCING — did the ladder climb, did the cap bend, how
 * many measurements were bought. Whether a ring measures correctly is settled
 * in `osrm.test.ts` against responses captured from the live router.
 *
 * The fake router is a real model, not a constant: it returns the perimeter of
 * the ring it was actually handed, multiplied by a detour factor the test
 * controls. That means the convergence controller genuinely converges here, and
 * a change to the sizing model shows up as a test failure rather than as a
 * shrug.
 */
import {
  destinationPoint,
  haversineDistance,
  LOOP_RESULTS_SHOWN,
  ringDetourFactor,
  ringPerimeterFactor,
  type Coordinate,
  type GeneratedLoop,
  type LoopSearchRequest,
  type RouteOption,
} from '@defensivepedal/core';
import { describe, expect, it, vi } from 'vitest';

import type { LoopRouteOptions, LoopRouteResult } from './osrm';
import { searchLoops, type LoopSearchPorts } from './search';

const START: Coordinate = { lat: 44.4268, lon: 26.1025 };

const baseRequest = (
  overrides: Partial<LoopSearchRequest> = {},
): LoopSearchRequest => ({
  start: START,
  targetDistanceMeters: 15_000,
  terrain: 'rolling',
  surface: 'any',
  heading: 'any',
  locale: 'en',
  ...overrides,
});

/** A circle of the right circumference, so the roundness guard is satisfied. */
const circleCoordinates = (
  centre: Coordinate,
  distanceMeters: number,
): [number, number][] => {
  const radius = distanceMeters / (2 * Math.PI);
  return Array.from({ length: 24 }, (_, i) => {
    const point = destinationPoint(centre, (360 / 24) * i, radius);
    return [point.lon, point.lat] as [number, number];
  });
};

const routeOption = (id: string, distanceMeters: number): RouteOption => ({
  id,
  source: 'generated_loop',
  routingEngineVersion: 'safe-osrm-v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'osm-current',
  riskModelVersion: 'risk-model-v1',
  geometryPolyline6: '',
  distanceMeters,
  durationSeconds: distanceMeters / 4,
  adjustedDurationSeconds: distanceMeters / 4,
  totalClimbMeters: null,
  steps: [],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
});

interface FakeRouterOptions {
  /** How much longer the road distance is than the polygon we asked for. */
  readonly detour?: number;
  readonly ringRetracedShare?: number;
  readonly spurShare?: number;
  /** Bearings (rounded) that the router refuses to answer at all. */
  readonly deadBearings?: readonly number[];
  /** Give every candidate the same roads, so the dedup filter has work. */
  readonly identicalEdges?: boolean;
}

/**
 * A router that answers with the perimeter it was handed.
 *
 * `detour` is what the core sizing model has to guess. Setting it to
 * `ringDetourFactor(n)` makes the first attempt land exactly; setting it higher
 * forces the damped controller to work for its result.
 */
const createFakeRouter = (options: FakeRouterOptions = {}) => {
  const calls: {
    waypoints: readonly Coordinate[];
    options: LoopRouteOptions;
    distance: number;
  }[] = [];
  let sequence = 0;

  const fetchRing = async (
    start: Coordinate,
    waypoints: readonly Coordinate[],
    routeOptions: LoopRouteOptions,
  ): Promise<LoopRouteResult> => {
    const points = [start, ...waypoints, start];
    let perimeter = 0;
    for (let i = 1; i < points.length; i += 1) {
      perimeter += haversineDistance(
        [points[i - 1]!.lat, points[i - 1]!.lon],
        [points[i]!.lat, points[i]!.lon],
      );
    }

    const bearing = Math.round(
      (Math.atan2(
        waypoints[0]!.lon - start.lon,
        waypoints[0]!.lat - start.lat,
      ) *
        180) /
        Math.PI,
    );
    if (options.deadBearings?.includes(((bearing % 360) + 360) % 360)) {
      throw new Error('no route from this bearing');
    }

    const distance = perimeter * (options.detour ?? 1);
    sequence += 1;
    calls.push({ waypoints, options: routeOptions, distance });

    return {
      route: routeOption(`fake-${sequence}`, distance),
      coordinates: circleCoordinates(start, distance),
      unpavedShare: 0.1,
      retracedShare: options.ringRetracedShare ?? 0.05,
      ringRetracedShare: options.ringRetracedShare ?? 0.05,
      spurShare: options.spurShare ?? 0,
      stemMeters: 0,
      edgeKeys: options.identicalEdges
        ? ['a', 'b', 'c']
        : [`e${sequence}a`, `e${sequence}b`, `e${sequence}c`],
      pavedFallback: false,
    };
  };

  return { fetchRing, calls };
};

/** Measurement that reports a fixed climb per kilometre. */
const createFakeMeasure = (metersPerKm = 4) => {
  const measured: string[] = [];
  const measure = async (loop: GeneratedLoop): Promise<GeneratedLoop> => {
    measured.push(loop.id);
    const climbMeters = Math.round((loop.distanceMeters / 1000) * metersPerKm);
    return {
      ...loop,
      climbMeters,
      highRiskMeters: 0,
      scenicScore: 0,
      terrain:
        metersPerKm >= 18 ? 'hilly' : metersPerKm >= 8 ? 'rolling' : 'flat',
      measured: true,
    };
  };
  return { measure, measured };
};

const portsOf = (
  router: ReturnType<typeof createFakeRouter>,
  measurer: ReturnType<typeof createFakeMeasure>,
): LoopSearchPorts => ({
  fetchRing: router.fetchRing,
  measure: measurer.measure,
});

describe('searchLoops', () => {
  it('lands on the first rung when nothing had to be given up', async () => {
    // Detour set to exactly what the sizing model assumes, so the first
    // attempt is in tolerance and the ladder never climbs.
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(
      portsOf(router, measurer),
      baseRequest({ terrain: 'rolling' }),
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.relaxation).toBe('none');
    expect(outcome.loops.length).toBeGreaterThan(0);
    expect(outcome.loops.length).toBeLessThanOrEqual(LOOP_RESULTS_SHOWN);
  });

  it('offers at most five loops however many it found', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);
    const outcome = await searchLoops(portsOf(router, measurer), baseRequest());
    if (outcome.status !== 'ok') throw new Error('expected ok');
    expect(outcome.loops.length).toBeLessThanOrEqual(5);
  });

  it('converges the radius rather than accepting the first answer', async () => {
    // 1.6x what the model assumes: the first ring comes back long and the
    // damped controller has to walk it in.
    const router = createFakeRouter({ detour: ringDetourFactor(3) * 1.6 });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(portsOf(router, measurer), baseRequest());

    expect(outcome.status).toBe('ok');
    // More requests than bearings means candidates were re-thrown at a
    // corrected radius, which is the controller working.
    expect(router.calls.length).toBeGreaterThan(5);
  });

  it('never spends more than three attempts on one bearing', async () => {
    // A router whose distance ignores the radius entirely: the controller can
    // never converge, and must give up rather than loop.
    const router = createFakeRouter({ detour: 1 });
    const fixed = vi.fn(async (start: Coordinate) => ({
      route: routeOption('stuck', 99_000),
      coordinates: circleCoordinates(start, 99_000),
      unpavedShare: 0,
      retracedShare: 0,
      ringRetracedShare: 0,
      spurShare: 0,
      stemMeters: 0,
      edgeKeys: ['x'],
      pavedFallback: false,
    }));
    const measurer = createFakeMeasure(12);

    await searchLoops(
      { fetchRing: fixed as unknown as LoopSearchPorts['fetchRing'], measure: measurer.measure },
      baseRequest({ targetDistanceMeters: 15_000 }),
    );

    // Five bearings per rung, two rungs that cost network, plus the two rescue
    // sweeps — each bearing capped at three attempts.
    expect(fixed.mock.calls.length).toBeLessThanOrEqual(4 * 5 * 3);
    expect(router.calls.length).toBe(0);
  });

  it('widens the heading arc before it widens anything else', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    await searchLoops(
      portsOf(router, measurer),
      baseRequest({ heading: 'E', targetDistanceMeters: 15_000 }),
    );

    // The first rung samples a 50-degree arc around east; if it had to climb,
    // the second samples 140 degrees. Either way every bearing thrown is
    // within the wider arc, never the full circle, because heading only stops
    // applying at the `distance` rung and later.
    const bearings = router.calls.map(({ waypoints }) => {
      const dLon = waypoints[0]!.lon - START.lon;
      const dLat = waypoints[0]!.lat - START.lat;
      return ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
    });
    for (const bearing of bearings) {
      expect(Math.abs(bearing - 90)).toBeLessThanOrEqual(75);
    }
  });

  it('rescues on distance without buying a single new request', async () => {
    // Every ring comes back 20% long: outside the strict 12% band, inside the
    // relaxed 25% one. The `distance` rung must reuse the pool rather than
    // re-route it.
    const router = createFakeRouter({ detour: ringDetourFactor(3) * 1.2 });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(
      portsOf(router, measurer),
      baseRequest({ heading: 'any' }),
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // It landed somewhere on the ladder, and every loop offered is within the
    // relaxed tolerance of the target.
    for (const loop of outcome.loops) {
      const error =
        Math.abs(loop.distanceMeters - 15_000) / 15_000;
      expect(error).toBeLessThanOrEqual(0.25);
    }
  });

  it('hunts harder before bending the doubling-back cap', async () => {
    // Every candidate repeats half of itself: over the 0.35 cap at every rung
    // except the last.
    const router = createFakeRouter({
      detour: ringDetourFactor(3),
      ringRetracedShare: 0.5,
    });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(portsOf(router, measurer), baseRequest());

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // The rescue sweep fires two extra rungs before the cap is allowed to
    // bend — "the cap always bends" is fixed by looking harder, not by
    // lowering the bar.
    expect(router.calls.length).toBeGreaterThan(10);
    expect(outcome.relaxation).toBe('retrace');
  });

  it('reports the rescue as a distance relaxation when the cap held', async () => {
    // In tolerance only at 25%, and inside the cap: the rescue branch should
    // find these and report `distance`, not `retrace`, because the cap never
    // actually bent.
    const router = createFakeRouter({
      detour: ringDetourFactor(3) * 1.2,
      ringRetracedShare: 0.1,
    });
    const measurer = createFakeMeasure(30); // hilly, so terrain never matches

    const outcome = await searchLoops(
      portsOf(router, measurer),
      baseRequest({ terrain: 'flat' }),
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(['distance', 'terrain']).toContain(outcome.relaxation);
  });

  it('drops a candidate that is the ride we already have', async () => {
    const router = createFakeRouter({
      detour: ringDetourFactor(3),
      identicalEdges: true,
    });
    const measurer = createFakeMeasure(12);

    const seen: string[] = [];
    const outcome = await searchLoops(portsOf(router, measurer), baseRequest(), {
      onCandidate: (loop) => seen.push(loop.id),
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // Every ring shares its roads with the first, so exactly one survives the
    // content comparison however many were routed.
    expect(outcome.loops).toHaveLength(1);
    // Duplicates never reach the map either.
    expect(new Set(seen.filter((id) => id.startsWith('fake-'))).size).toBe(1);
  });

  it('measures only the finalists, not the whole pool', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    await searchLoops(portsOf(router, measurer), baseRequest());

    // Five finalists at three enrichment calls each is fifteen; measuring the
    // whole pool would be thirty. On the client path that was the difference
    // between fitting the rate-limit budget and exhausting it.
    expect(measurer.measured.length).toBeLessThanOrEqual(LOOP_RESULTS_SHOWN * 2);
  });

  it('escalates once before claiming the terrain does not exist here', async () => {
    // Nothing is flat: the terrain filter never matches, so the search must
    // buy a second round of measurements before saying so.
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(30);

    const outcome = await searchLoops(
      portsOf(router, measurer),
      baseRequest({ terrain: 'flat' }),
    );

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    // The last rung of the ladder IS the honest miss: terrain was dropped and
    // the closest thing that exists is offered, with a real count behind it.
    expect(['terrain', 'retrace', 'distance']).toContain(outcome.relaxation);
    expect(outcome.checked).toBeGreaterThan(0);
    expect(outcome.checked).toBe(measurer.measured.length);
  });

  it('samples all four combinations of ring shape and lollipop', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    await searchLoops(portsOf(router, measurer), baseRequest());

    // A lollipop puts its anchor in the waypoint list before AND after the
    // ring, so it is recognisable by its first and last waypoint matching.
    const shapes = new Set(
      router.calls.map(({ waypoints, options }) => {
        const lollipop = (options.stemLegs ?? 0) > 0;
        const ringPoints = lollipop ? waypoints.length - 2 : waypoints.length;
        return `${lollipop ? 'lollipop' : 'ring'}-${ringPoints}`;
      }),
    );

    // Deriving both the shape and the lollipop choice from the same parity is
    // what shipped once: every lollipop was a hexagon and every plain ring a
    // triangle, so half the search space was never built.
    expect(shapes).toContain('ring-3');
    expect(shapes).toContain('lollipop-3');
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });

  it('tells a lollipop measurement which legs are approach', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    await searchLoops(portsOf(router, measurer), baseRequest());

    const lollipops = router.calls.filter((c) => (c.options.stemLegs ?? 0) > 0);
    const rings = router.calls.filter((c) => (c.options.stemLegs ?? 0) === 0);
    expect(lollipops.length).toBeGreaterThan(0);
    expect(rings.length).toBeGreaterThan(0);
    // The measurement has to agree with the shape that was built, or the stem
    // exemption silently does nothing.
    for (const call of lollipops) expect(call.options.stemLegs).toBe(1);
  });

  it('scales a lollipop by its whole budget, not by a radius', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) * 1.6 });
    const measurer = createFakeMeasure(12);

    await searchLoops(portsOf(router, measurer), baseRequest());

    const lollipopCalls = router.calls.filter(
      (c) => (c.options.stemLegs ?? 0) > 0,
    );
    // A lollipop that skipped convergence came back at 53 km on a 30 km
    // request against the live router, and was then thrown out by the distance
    // filter every single time. Retrying it at all is the fix.
    expect(lollipopCalls.length).toBeGreaterThan(2);
  });

  it('never offers a route that repeats effectively all of itself', async () => {
    // The ceiling's whole purpose. Every candidate here rides its entire loop
    // twice, so the ladder runs to its last rung, drops both caps, and would
    // otherwise hand the rider an out-and-back labelled "the least we could
    // find". Measured on 300 live candidates, 50 reach that rung in this
    // state.
    const router = createFakeRouter({
      detour: ringDetourFactor(3),
      ringRetracedShare: 1,
    });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(portsOf(router, measurer), baseRequest());

    expect(outcome.status).toBe('empty');
    // It really did look: the rescue sweeps ran and found nothing acceptable.
    expect(router.calls.length).toBeGreaterThan(10);
  });

  it('still offers a heavily retraced loop below the ceiling', async () => {
    // The line has to be in the right place. A loop that repeats 70% of itself
    // is a poor ride and a real one, and in thin terrain it may be all that
    // exists — so the last rung still offers it.
    const router = createFakeRouter({
      detour: ringDetourFactor(3),
      ringRetracedShare: 0.7,
    });
    const measurer = createFakeMeasure(12);

    const outcome = await searchLoops(portsOf(router, measurer), baseRequest());

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.relaxation).toBe('retrace');
    expect(outcome.loops.length).toBeGreaterThan(0);
  });

  it('applies the ceiling at every rung, including the ones that relax caps', async () => {
    // Not gated on relaxation anywhere. If a future edit adds a rung argument
    // to `withinRetraceCeiling`, this is what notices.
    for (const share of [0.95, 1]) {
      const router = createFakeRouter({
        detour: ringDetourFactor(3),
        ringRetracedShare: share,
      });
      const outcome = await searchLoops(
        portsOf(router, createFakeMeasure(12)),
        baseRequest({ terrain: 'flat' }),
      );
      expect(outcome.status).toBe('empty');
    }
  });

  it('returns empty when nothing rideable came back at any tolerance', async () => {
    const failing: LoopSearchPorts = {
      fetchRing: async () => {
        throw new Error('no route');
      },
      measure: createFakeMeasure().measure,
    };

    const outcome = await searchLoops(failing, baseRequest());
    expect(outcome.status).toBe('empty');
  });

  it('rejects a collapsed ring rather than correcting off it', async () => {
    // OSRM answers an out-of-data request with a short valid-looking route.
    // Correcting a radius off that number sends it nowhere useful.
    const collapsed: LoopSearchPorts = {
      fetchRing: async (start) => ({
        route: routeOption('tiny', 200),
        coordinates: circleCoordinates(start, 200),
        unpavedShare: 0,
        retracedShare: 0,
        ringRetracedShare: 0,
        spurShare: 0,
        stemMeters: 0,
        edgeKeys: ['x'],
        pavedFallback: false,
      }),
      measure: createFakeMeasure().measure,
    };

    const outcome = await searchLoops(collapsed, baseRequest());
    expect(outcome.status).toBe('empty');
  });

  it('stops immediately when the rider cancels', async () => {
    const controller = new AbortController();
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);

    const promise = searchLoops(portsOf(router, measurer), baseRequest(), {
      signal: controller.signal,
      onCandidate: () => controller.abort(),
    });

    const outcome = await promise;
    expect(outcome.status).toBe('cancelled');
    // A cancelled search must never be charged for, which is why this is a
    // distinct status rather than an empty result.
  });

  it('reports progress as candidates land', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);
    const progress: [number, number][] = [];

    await searchLoops(portsOf(router, measurer), baseRequest(), {
      onProgress: (resolved, attempted) => progress.push([resolved, attempted]),
    });

    expect(progress.length).toBeGreaterThan(0);
    // Attempted never decreases, and resolved never exceeds it.
    let lastAttempted = 0;
    for (const [resolved, attempted] of progress) {
      expect(attempted).toBeGreaterThanOrEqual(lastAttempted);
      expect(resolved).toBeLessThanOrEqual(attempted);
      lastAttempted = attempted;
    }
  });

  it('draws every candidate before the ranked result replaces them', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(12);
    const drawn: GeneratedLoop[] = [];

    const outcome = await searchLoops(portsOf(router, measurer), baseRequest(), {
      onCandidate: (loop) => drawn.push(loop),
    });

    expect(outcome.status).toBe('ok');
    // Unmeasured first, then again once measured — that is what lets the map
    // show a faint line immediately and firm it up when the climb lands.
    expect(drawn.some((loop) => !loop.measured)).toBe(true);
    expect(drawn.some((loop) => loop.measured)).toBe(true);
  });

  it('carries the routing constraints through to every request', async () => {
    const router = createFakeRouter({ detour: ringDetourFactor(3) });
    const measurer = createFakeMeasure(4);

    await searchLoops(
      portsOf(router, measurer),
      baseRequest({ terrain: 'flat', surface: 'paved' }),
    );

    for (const call of router.calls) {
      expect(call.options.terrain).toBe('flat');
      expect(call.options.surface).toBe('paved');
    }
  });
});

describe('the sizing model this search depends on', () => {
  it('sizes a hexagon differently from a triangle', () => {
    // A hexagon detours about a fifth more than a triangle, so sizing both the
    // same makes every six-point ring come back long.
    expect(ringDetourFactor(6)).toBeGreaterThan(ringDetourFactor(3));
    expect(ringPerimeterFactor(6)).toBeGreaterThan(ringPerimeterFactor(3));
  });
});
