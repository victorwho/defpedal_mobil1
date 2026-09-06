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
  type Coordinate,
  type RiskSegment,
  type RouteOption,
} from '@defensivepedal/core';

const fetchLoopRoute = vi.fn();
const enrichRouteWithElevation = vi.fn();
const enrichRouteWithRisk = vi.fn();

vi.mock('./mapbox-routing', () => ({
  fetchLoopRoute: (...args: unknown[]) => fetchLoopRoute(...args),
  enrichRouteWithElevation: (...args: unknown[]) => enrichRouteWithElevation(...args),
  enrichRouteWithRisk: (...args: unknown[]) => enrichRouteWithRisk(...args),
}));

const { searchLoops } = await import('./loop-generator');

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
});

describe('a straightforward search', () => {
  it('returns three loops with nothing given up', async () => {
    alwaysOnTarget(15_000);
    const outcome = await searchLoops(request);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.loops).toHaveLength(3);
    expect(outcome.relaxation).toBe('none');
  });

  it('throws only one rung of rings when the first rung succeeds', async () => {
    alwaysOnTarget(15_000);
    await searchLoops(request);
    // One bearing per candidate, each converging on its first attempt.
    expect(fetchLoopRoute).toHaveBeenCalledTimes(LOOP_CANDIDATE_COUNT);
  });

  it('measures three finalists, not every candidate', async () => {
    // The rate-limit budget is the point: /elevation-profile and
    // /risk-segments share a 30-per-60s bucket with the risk overlay.
    alwaysOnTarget(15_000);
    await searchLoops(request);
    expect(enrichRouteWithElevation).toHaveBeenCalledTimes(3);
    expect(enrichRouteWithRisk).toHaveBeenCalledTimes(3);
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
