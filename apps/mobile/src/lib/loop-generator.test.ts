/**
 * The loop generator's sequencing, with the network stubbed.
 *
 * What is actually under test here is the budget and the ladder — how many
 * requests an attempt makes, which rungs cost network, when measurement
 * escalates, and what a cancelled or empty search reports. The geometry and
 * ranking maths are covered by `loopPlan.test.ts` in core.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  destinationPoint,
  encodePolyline,
  LOOP_CANDIDATE_COUNT,
  LOOP_RESULTS_SHOWN,
  MAX_RETRACE_SHARE,
  type Coordinate,
  type RiskSegment,
  type RouteOption,
} from '@defensivepedal/core';

const fetchLoopRoute = vi.fn();
const enrichRouteWithElevation = vi.fn();
const enrichRouteWithRisk = vi.fn();
const fetchRouteScenicScore = vi.fn();

vi.mock('./mapbox-routing', () => ({
  fetchLoopRoute: (...args: unknown[]) => fetchLoopRoute(...args),
  enrichRouteWithElevation: (...args: unknown[]) => enrichRouteWithElevation(...args),
  enrichRouteWithRisk: (...args: unknown[]) => enrichRouteWithRisk(...args),
  fetchRouteScenicScore: (...args: unknown[]) => fetchRouteScenicScore(...args),
}));

const { searchLoops, LOOPS_PER_ATTEMPT } = await import('./loop-generator');

const START: Coordinate = { lat: 44.4268, lon: 26.1025 };

/** A ring of coordinates that passes `isOutAndBack` and `isDegenerateLoop`. */
const circleFor = (distanceMeters: number): [number, number][] => {
  const radius = distanceMeters / (2 * Math.PI);
  return Array.from({ length: 48 }, (_, i) => {
    const p = destinationPoint(START, (360 / 48) * i, radius);
    return [p.lon, p.lat] as [number, number];
  });
};

const routeOf = (id: string, distanceMeters: number): RouteOption => ({
  id,
  source: 'generated_loop',
  routingEngineVersion: 'safe-osrm-v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'osm-current',
  riskModelVersion: 'risk-model-v1',
  geometryPolyline6: encodePolyline(circleFor(distanceMeters)),
  distanceMeters,
  durationSeconds: distanceMeters / 4,
  adjustedDurationSeconds: distanceMeters / 4,
  totalClimbMeters: null,
  steps: [],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
});

/** Every ring resolves at the target length, with a given retrace share. */
const alwaysRetracing = (share: number, distanceMeters = 15_000) => {
  let n = 0;
  fetchLoopRoute.mockImplementation(async () => {
    n += 1;
    return {
      route: routeOf(`loop-${n}`, distanceMeters),
      coordinates: circleFor(distanceMeters),
      unpavedShare: 0,
      retracedShare: share,
      ringRetracedShare: share,
      stemMeters: 0,
      edgeKeys: [`e-${n}-a`, `e-${n}-b`],
    };
  });
};

/** Every ring resolves at exactly the target length. */
const alwaysOnTarget = (distanceMeters: number) => {
  let n = 0;
  fetchLoopRoute.mockImplementation(async () => {
    n += 1;
    return {
      route: routeOf(`loop-${n}`, distanceMeters),
      coordinates: circleFor(distanceMeters),
    };
  });
};

const request = {
  start: START,
  targetDistanceMeters: 15_000,
  terrain: 'rolling' as const,
  surface: 'paved' as const,
  heading: 'E' as const,
  locale: 'en' as const,
};

/** Climb chosen so `classifyTerrain` lands on the named band for 15 km. */
const CLIMB = { flat: 30, rolling: 180, hilly: 400 };

const withClimb = (metres: number | null) =>
  enrichRouteWithElevation.mockImplementation(async (route: RouteOption) => ({
    ...route,
    totalClimbMeters: metres,
  }));

const busySegment = (): RiskSegment => ({
  id: 'busy',
  riskScore: 90,
  riskCategory: 'High risk',
  color: '#B00020',
  geometry: {
    type: 'LineString',
    coordinates: [
      [26.10, 44.43],
      [26.12, 44.43],
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  withClimb(CLIMB.rolling);
  enrichRouteWithRisk.mockImplementation(async (route: RouteOption) => ({
    ...route,
    riskSegments: [],
  }));
  // Unscored area: neutral, so scenic must not move any existing ordering.
  fetchRouteScenicScore.mockResolvedValue(0);
});

describe('a straightforward search', () => {
  it('returns a full set of loops with nothing given up', async () => {
    alwaysOnTarget(15_000);
    const outcome = await searchLoops(request);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.loops).toHaveLength(LOOP_RESULTS_SHOWN);
    expect(outcome.relaxation).toBe('none');
  });

  it('throws only one rung of rings when the first rung succeeds', async () => {
    alwaysOnTarget(15_000);
    await searchLoops(request);
    // One bearing per candidate, each converging on its first attempt.
    expect(fetchLoopRoute).toHaveBeenCalledTimes(LOOP_CANDIDATE_COUNT);
  });

  it('measures every offered loop, not every candidate', async () => {
    // The rate-limit budget is the point: /elevation-profile and
    // /risk-segments share a 30-per-60s bucket with the risk overlay.
    alwaysOnTarget(15_000);
    await searchLoops(request);
    expect(enrichRouteWithElevation).toHaveBeenCalledTimes(LOOP_RESULTS_SHOWN);
    expect(enrichRouteWithRisk).toHaveBeenCalledTimes(LOOP_RESULTS_SHOWN);
  });

  it('reports each loop as it lands so the map can draw it', async () => {
    alwaysOnTarget(15_000);
    const onCandidate = vi.fn();
    await searchLoops(request, { onCandidate });
    expect(onCandidate.mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('reports progress against the number attempted', async () => {
    alwaysOnTarget(15_000);
    const onProgress = vi.fn();
    await searchLoops(request, { onProgress });
    const [resolved, attempted] = onProgress.mock.calls.at(-1)!;
    expect(attempted).toBe(LOOP_CANDIDATE_COUNT);
    expect(resolved).toBeGreaterThan(0);
  });

  it('routes flat terrain through the flat profile', async () => {
    alwaysOnTarget(15_000);
    withClimb(CLIMB.flat);
    await searchLoops({ ...request, terrain: 'flat' });
    expect(fetchLoopRoute).toHaveBeenCalledWith(
      START,
      expect.anything(),
      expect.objectContaining({ terrain: 'flat' }),
    );
  });

  it('passes the surface appetite through to the exclude flag', async () => {
    alwaysOnTarget(15_000);
    await searchLoops({ ...request, surface: 'any' });
    expect(fetchLoopRoute).toHaveBeenCalledWith(
      START,
      expect.anything(),
      expect.objectContaining({ surface: 'any' }),
    );
  });
});

describe('the relaxation ladder', () => {
  it('widens the heading before touching anything else', async () => {
    alwaysOnTarget(15_000);
    // Nothing rolling anywhere, so the first rung cannot satisfy terrain.
    withClimb(CLIMB.flat);

    const outcome = await searchLoops(request);
    // One rung of rings for `none`, one more for `heading`.
    expect(fetchLoopRoute).toHaveBeenCalledTimes(LOOP_CANDIDATE_COUNT * 2);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.relaxation).toBe('terrain');
  });

  it('spends no further requests on the distance and terrain rungs', async () => {
    // Those rungs re-filter loops already paid for, so two rungs is the ceiling
    // no matter how deep the ladder goes.
    alwaysOnTarget(15_000);
    withClimb(CLIMB.flat);
    await searchLoops(request);
    expect(fetchLoopRoute).toHaveBeenCalledTimes(LOOP_CANDIDATE_COUNT * 2);
  });

  it('rescues a too-long loop by widening the distance tolerance', async () => {
    // 18 km against a 15 km ask: outside +-12%, inside +-25%.
    alwaysOnTarget(18_000);
    withClimb(CLIMB.rolling);

    const outcome = await searchLoops(request);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.relaxation).toBe('distance');
  });
});

describe('the honest miss', () => {
  it('escalates measurement before claiming a terrain does not exist', async () => {
    alwaysOnTarget(15_000);
    withClimb(CLIMB.flat);

    const outcome = await searchLoops({ ...request, terrain: 'hilly' });
    if (outcome.status !== 'ok') throw new Error('expected loops');
    // The last rung of the ladder IS the honest miss.
    expect(outcome.relaxation).toBe('terrain');
    // Three finalists plus a three-loop escalation, per rung that asks.
    expect(outcome.checked).toBeGreaterThan(3);
  });

  it('quotes a real count of what was checked', async () => {
    alwaysOnTarget(15_000);
    withClimb(CLIMB.flat);

    const outcome = await searchLoops({ ...request, terrain: 'hilly' });
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.checked).toBe(enrichRouteWithElevation.mock.calls.length);
  });

  it('still hands back the closest loops it found', async () => {
    alwaysOnTarget(15_000);
    withClimb(CLIMB.flat);

    const outcome = await searchLoops({ ...request, terrain: 'hilly' });
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.loops.length).toBeGreaterThan(0);
  });

  it('never claims a terrain for a loop whose climb failed to measure', async () => {
    alwaysOnTarget(15_000);
    withClimb(null);

    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.relaxation).toBe('terrain');
    expect(outcome.loops.every((loop) => loop.terrain === null)).toBe(true);
  });
});

describe('nothing rideable', () => {
  it('reports empty when every bearing fails', async () => {
    fetchLoopRoute.mockRejectedValue(new Error('out of coverage'));
    const outcome = await searchLoops(request);
    expect(outcome.status).toBe('empty');
  });

  it('reports empty when every ring collapses', async () => {
    // OSRM answers out-of-data requests with Ok and a near-zero route.
    fetchLoopRoute.mockImplementation(async () => ({
      route: routeOf('collapsed', 200),
      coordinates: circleFor(200),
    }));
    const outcome = await searchLoops(request);
    expect(outcome.status).toBe('empty');
  });

  it('survives one dead bearing without abandoning the search', async () => {
    let call = 0;
    fetchLoopRoute.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new Error('timeout');
      return {
        route: routeOf(`loop-${call}`, 15_000),
        coordinates: circleFor(15_000),
      };
    });

    const outcome = await searchLoops(request);
    expect(outcome.status).toBe('ok');
  });
});

describe('cancellation', () => {
  it('reports cancelled and never charges', async () => {
    const controller = new AbortController();
    fetchLoopRoute.mockImplementation(async () => {
      controller.abort();
      return {
        route: routeOf('loop', 15_000),
        coordinates: circleFor(15_000),
      };
    });

    const outcome = await searchLoops(request, { signal: controller.signal });
    expect(outcome.status).toBe('cancelled');
  });

  it('stops issuing requests once cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await searchLoops(request, { signal: controller.signal });
    expect(outcome.status).toBe('cancelled');
    expect(fetchLoopRoute).not.toHaveBeenCalled();
  });
});

describe('ranking', () => {
  it('puts the loop with less busy-road exposure first', async () => {
    let call = 0;
    fetchLoopRoute.mockImplementation(async () => {
      call += 1;
      return {
        route: routeOf(`loop-${call}`, 15_000),
        coordinates: circleFor(15_000),
      };
    });
    enrichRouteWithRisk.mockImplementation(async (route: RouteOption) => ({
      ...route,
      // Only loop-1 is busy.
      riskSegments: route.id === 'loop-1' ? [busySegment()] : [],
    }));

    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.loops[0]!.route.id).not.toBe('loop-1');
  });
});

describe('the doubling-back cap', () => {
  it('offers a loop that stays under the cap without relaxing anything', async () => {
    alwaysRetracing(0.04);
    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.relaxation).toBe('none');
    expect(
      outcome.loops.every((l) => l.ringRetracedShare <= MAX_RETRACE_SHARE),
    ).toBe(true);
  });

  it('falls all the way to the retrace rung when nothing clean exists', async () => {
    // A dead-end valley: every candidate repeats a third of itself.
    alwaysRetracing(MAX_RETRACE_SHARE * 2);
    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.relaxation).toBe('retrace');
  });

  it('still returns a rideable loop rather than nothing', async () => {
    // The whole reason the cap is a ladder rung and not a hard reject.
    alwaysRetracing(MAX_RETRACE_SHARE * 2);
    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.loops.length).toBeGreaterThan(0);
  });

  it('spends an extra sweep before bending the cap', async () => {
    // Distance and terrain re-filter loops already paid for, but the retrace
    // cap is the one limit the rider set explicitly — so it earns one more
    // batch of bearings and shapes before we give it up. Measured against live
    // OSRM, compliant loops exist but the first batch can miss them entirely.
    alwaysRetracing(MAX_RETRACE_SHARE * 2);
    await searchLoops(request);
    expect(fetchLoopRoute.mock.calls.length).toBeGreaterThan(
      LOOP_CANDIDATE_COUNT * 2,
    );
  });

  it('prefers a capped loop over a cleaner one that breaks the cap', async () => {
    let n = 0;
    fetchLoopRoute.mockImplementation(async () => {
      n += 1;
      return {
        route: routeOf(`loop-${n}`, 15_000),
        coordinates: circleFor(15_000),
        unpavedShare: 0,
        retracedShare: 0,
        ringRetracedShare: 0,
        stemMeters: 0,
        edgeKeys: [`e-${n}-a`, `e-${n}-b`],
        // Only the first candidate is under the cap.
        retracedShare: n === 1 ? 0.08 : 0.4,
        ringRetracedShare:
          n === 1 ? MAX_RETRACE_SHARE / 2 : MAX_RETRACE_SHARE * 2,
        stemMeters: 0,
      };
    });
    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.relaxation).toBe('none');
    expect(outcome.loops).toHaveLength(1);
    expect(outcome.loops[0]!.retracedShare).toBeCloseTo(0.08);
  });
});

describe('the cap-rescue sweep', () => {
  it('finds a compliant loop with extra bearings rather than bending the cap', async () => {
    // Mirrors what the live probe found: compliant loops exist but are
    // bearing- and shape-dependent, so the first batch can miss them entirely.
    let n = 0;
    fetchLoopRoute.mockImplementation(async () => {
      n += 1;
      return {
        route: routeOf(`loop-${n}`, 15_000),
        coordinates: circleFor(15_000),
        unpavedShare: 0,
        // Nothing compliant until the rescue sweep is well under way.
        retracedShare: n > 12 ? 0.05 : 0.4,
        ringRetracedShare:
          n > 12 ? MAX_RETRACE_SHARE / 2 : MAX_RETRACE_SHARE * 2,
        stemMeters: 0,
      };
    });

    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    // The cap HELD — the reported relaxation is never 'retrace'.
    expect(outcome.relaxation).not.toBe('retrace');
    expect(outcome.loops.every((l) => l.retracedShare <= 0.1)).toBe(true);
  });

  it('spends more requests than a normal search to do it', async () => {
    let n = 0;
    fetchLoopRoute.mockImplementation(async () => {
      n += 1;
      return {
        route: routeOf(`loop-${n}`, 15_000),
        coordinates: circleFor(15_000),
        unpavedShare: 0,
        retracedShare: n > 12 ? 0.05 : 0.4,
        ringRetracedShare:
          n > 12 ? MAX_RETRACE_SHARE / 2 : MAX_RETRACE_SHARE * 2,
        stemMeters: 0,
      };
    });
    await searchLoops(request);
    // Two normal rungs plus the rescue sweep.
    expect(fetchLoopRoute.mock.calls.length).toBeGreaterThan(
      LOOP_CANDIDATE_COUNT * 2,
    );
  });

  it('bends the cap only when the sweep also finds nothing', async () => {
    alwaysRetracing(MAX_RETRACE_SHARE * 2);
    const outcome = await searchLoops(request);
    if (outcome.status !== 'ok') throw new Error('expected loops');
    expect(outcome.relaxation).toBe('retrace');
    expect(outcome.loops.length).toBeGreaterThan(0);
  });

  it('does not sweep at all when the first batch already complies', async () => {
    alwaysRetracing(0.04);
    await searchLoops(request);
    expect(fetchLoopRoute).toHaveBeenCalledTimes(LOOP_CANDIDATE_COUNT);
  });
});

describe('how many loops the rider is offered', () => {
  it('offers exactly LOOP_RESULTS_SHOWN, not one per generated candidate', () => {
    // The list used to be capped at 12 while two network rungs generated five
    // rings each, so a search showed ten rows — and only the measured
    // finalists carried a climb figure, the rest reading as a dash. The cap
    // and the finalist count are now the same number by construction.
    expect(LOOPS_PER_ATTEMPT).toBe(LOOP_RESULTS_SHOWN);
    expect(LOOP_RESULTS_SHOWN).toBe(5);
  });

  it('keeps generation wider than the list on purpose', () => {
    // Breadth is what makes a loop clear the doubling-back cap at all, so the
    // search still throws two rungs of rings and offers the best of them.
    // Narrowing generation to match the list would mean worse loops.
    expect(LOOP_CANDIDATE_COUNT * 2).toBeGreaterThan(LOOP_RESULTS_SHOWN);
  });
});

describe('duplicate loops', () => {
  it('REGRESSION: collapses identical routes that carry different ids', async () => {
    // The exact field failure. `generateRouteId` mints ids from Date.now(), so
    // two byte-identical routes fetched a millisecond apart get DIFFERENT ids
    // — and the dedup filtered on id, so both were offered. A rider saw the
    // same ride twice in a list of five.
    let n = 0;
    fetchLoopRoute.mockImplementation(async () => {
      n += 1;
      return {
        route: routeOf(`custom_osrm-${1000 + n}-0`, 20_000),
        coordinates: circleFor(20_000),
        unpavedShare: 0,
        retracedShare: 0,
        ringRetracedShare: 0,
        stemMeters: 0,
        // Same roads every time — one ride, however many ids it wears.
        edgeKeys: ['a', 'b', 'c', 'd'],
      };
    });
    enrichRouteWithElevation.mockImplementation(async (r: RouteOption) => r);
    enrichRouteWithRisk.mockImplementation(async (r: RouteOption) => r);
    fetchRouteScenicScore.mockResolvedValue(0);

    const outcome = await searchLoops({
      start: START,
      targetDistanceMeters: 20_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      locale: 'en',
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.loops).toHaveLength(1);
  });

  it('keeps loops that merely share the way out of town', async () => {
    // Two rides down the one road out of a valley are still two rides. The
    // threshold is overlap, not "touched the same tarmac at all".
    let n = 0;
    fetchLoopRoute.mockImplementation(async () => {
      n += 1;
      return {
        route: routeOf(`loop-${n}`, 20_000),
        coordinates: circleFor(20_000),
        unpavedShare: 0,
        retracedShare: 0,
        ringRetracedShare: 0,
        stemMeters: 0,
        // A shared two-edge corridor, then entirely different roads.
        edgeKeys: ['stem-1', 'stem-2', `own-${n}-a`, `own-${n}-b`, `own-${n}-c`],
      };
    });
    enrichRouteWithElevation.mockImplementation(async (r: RouteOption) => r);
    enrichRouteWithRisk.mockImplementation(async (r: RouteOption) => r);
    fetchRouteScenicScore.mockResolvedValue(0);

    const outcome = await searchLoops({
      start: START,
      targetDistanceMeters: 20_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      locale: 'en',
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.loops.length).toBeGreaterThan(1);
  });
});

describe('what a batch actually samples', () => {
  it('REGRESSION: tries every combination of ring shape and lollipop', async () => {
    // Both used to come off the SAME parity bit — `ringWaypointCountFor(slot)`
    // indexes [3, 6] by slot % 2, and lollipop was `slot % 2 === 1` — so every
    // lollipop was a hexagon and every plain ring a triangle. Half the search
    // space was never tried, and measured at Bucharest 30 km the three-point
    // lollipop was offerable where the six-point one was not.
    const shapes: string[] = [];
    fetchLoopRoute.mockImplementation(
      async (_start: unknown, waypoints: { lat: number; lon: number }[]) => {
        const first = waypoints[0]!;
        const last = waypoints[waypoints.length - 1]!;
        // A lollipop repeats its anchor before and after the ring.
        const isLollipop = first.lat === last.lat && first.lon === last.lon;
        const ringPoints = isLollipop ? waypoints.length - 2 : waypoints.length;
        shapes.push(`${isLollipop ? 'lollipop' : 'ring'}-${ringPoints}`);
        return {
          route: routeOf(`loop-${shapes.length}`, 20_000),
          coordinates: circleFor(20_000),
          unpavedShare: 0,
          retracedShare: 0,
          ringRetracedShare: 0,
          stemMeters: 0,
          edgeKeys: [`e-${shapes.length}`],
        };
      },
    );
    enrichRouteWithElevation.mockImplementation(async (r: RouteOption) => r);
    enrichRouteWithRisk.mockImplementation(async (r: RouteOption) => r);
    fetchRouteScenicScore.mockResolvedValue(0);

    await searchLoops({
      start: START,
      targetDistanceMeters: 20_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      locale: 'en',
    });

    const seen = new Set(shapes);
    expect(seen.has('ring-3')).toBe(true);
    expect(seen.has('ring-6')).toBe(true);
    expect(seen.has('lollipop-3')).toBe(true);
    expect(seen.has('lollipop-6')).toBe(true);
  });
});
