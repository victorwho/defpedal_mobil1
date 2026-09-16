// @vitest-environment node
/**
 * PARITY: the server generator must produce exactly what the app's does.
 *
 * While `LOOP_GENERATION_SERVER` can point either way, the same rider can be
 * served by either implementation. A difference between them is not a nicer
 * loop, it is a bug report about loops changing for no reason — so this test
 * runs BOTH orchestrators over one deterministic fake router and compares the
 * ranked output field by field.
 *
 * It is deliberately not a test of loop quality. Quality lives in
 * `packages/core/loopPlan`, which both implementations import, and is tested
 * there. What can drift is the sequencing around it: how many rings are thrown,
 * in what order the ladder climbs, when the cap-rescue sweep fires, how many
 * candidates get measured. Those are duplicated between the two files for as
 * long as the flag exists, and duplication is what this holds together.
 *
 * The duplication is temporary and intentional. When the flag is removed, the
 * app's copy goes with it — and so does this test.
 */
import type {
  Coordinate,
  GeneratedLoop,
  LoopSearchOutcome,
  LoopSearchRequest,
  RouteOption,
} from '@defensivepedal/core';
import { destinationPoint, haversineDistance } from '@defensivepedal/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The app's routing module reaches for expo-constants, Supabase and the i18n
// catalogue at import time. Replacing it wholesale means none of that loads,
// which is what lets the app's orchestrator run in a plain node test.
vi.mock('../../../../apps/mobile/src/lib/mapbox-routing', () => ({
  fetchLoopRoute: (...args: unknown[]) =>
    fakeRouter.fetchRing(
      ...(args as [Coordinate, readonly Coordinate[], Record<string, unknown>]),
    ),
  enrichRouteWithElevation: (route: RouteOption, coordinates: [number, number][]) =>
    fakeElevation(route, coordinates),
  enrichRouteWithRisk: (route: RouteOption) => fakeRisk(route),
  fetchRouteScenicScore: () => fakeScenic(),
}));

import { searchLoops as searchLoopsOnDevice } from '../../../../apps/mobile/src/lib/loop-generator';
import { createMeasurementPort } from '../lib/loops/measure';
import { searchLoops as searchLoopsOnServer } from '../lib/loops/search';

// ---------------------------------------------------------------------------
// A router that answers the same way whoever asks, and in whatever order
// ---------------------------------------------------------------------------

/** djb2 over the request geometry, so ids depend on the ring and nothing else. */
const hash = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

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

interface RouterConfig {
  readonly detour: number;
  readonly ringRetracedShare: number;
  readonly spurShare: number;
  /**
   * Answer this distance whatever ring was asked for.
   *
   * Makes the convergence controller unable to converge, which is the only way
   * to reach the later rungs of the ladder: with a well-behaved router the
   * first damped correction lands inside the strict tolerance and the search
   * stops at `none`. Set just outside the strict band and inside the relaxed
   * one, it forces the ladder to climb and so pins the ORDER it climbs in.
   */
  readonly fixedDistanceMeters?: number;
}

/**
 * Deterministic by construction.
 *
 * A sequence counter would make the answers depend on the order the two
 * implementations happen to ask in, which would turn any concurrency
 * difference into a false parity failure — and, worse, could hide a real one
 * behind noise. Everything here is a pure function of the ring handed in.
 */
const createDeterministicRouter = (config: RouterConfig) => {
  const calls: { key: string; stemLegs: number }[] = [];

  const fetchRing = async (
    start: Coordinate,
    waypoints: readonly Coordinate[],
    options: Record<string, unknown>,
  ) => {
    const points = [start, ...waypoints, start];
    const key = hash(points.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|'));

    let perimeter = 0;
    for (let i = 1; i < points.length; i += 1) {
      perimeter += haversineDistance(
        [points[i - 1]!.lat, points[i - 1]!.lon],
        [points[i]!.lat, points[i]!.lon],
      );
    }
    const distance = config.fixedDistanceMeters ?? perimeter * config.detour;
    const stemLegs = Number(options.stemLegs ?? 0);
    calls.push({ key, stemLegs });

    // A per-ring delay, so completion order depends on how many requests are
    // in flight. Without one, every fake answer resolves in the same tick and
    // the two implementations look identical however differently they pool
    // their work — and concurrency is exactly what decides the order loops
    // appear on the rider's map.
    //
    // Counted in microtasks, NOT milliseconds. A `setTimeout` version of this
    // was flaky: at 1-5 ms the timer resolution is coarser than the gaps, so a
    // loaded machine reordered two rings and failed a parity check that had
    // found nothing wrong. Microtask ordering is deterministic and immune to
    // machine load, which is what a comparison test needs.
    for (let tick = 0; tick < 1 + (parseInt(key.slice(-1), 36) % 7); tick += 1) {
      await Promise.resolve();
    }

    const route: RouteOption = {
      id: `loop-${Math.round(distance)}-${key}`,
      source: 'generated_loop',
      routingEngineVersion: 'safe-osrm-v1',
      routingProfileVersion: 'safety-profile-v1',
      mapDataVersion: 'osm-current',
      riskModelVersion: 'risk-model-v1',
      geometryPolyline6: '',
      distanceMeters: distance,
      durationSeconds: distance / 4,
      adjustedDurationSeconds: distance / 4,
      totalClimbMeters: null,
      steps: [],
      riskSegments: [],
      routeFeatures: [],
      warnings: [],
    };

    return {
      route,
      coordinates: circleCoordinates(start, distance),
      // Deterministic but varied, so ranking has something to sort on.
      unpavedShare: (parseInt(key.slice(-2), 36) % 100) / 100,
      retracedShare: config.ringRetracedShare,
      ringRetracedShare: config.ringRetracedShare,
      spurShare: config.spurShare,
      stemMeters: stemLegs > 0 ? distance * 0.3 : 0,
      edgeKeys: [`${key}-a`, `${key}-b`, `${key}-c`],
      pavedFallback: false,
    };
  };

  return { fetchRing, calls };
};

let fakeRouter: ReturnType<typeof createDeterministicRouter>;

const FAKE_ELEVATION_PROFILE = [100, 120, 110];

/**
 * Climb derived from the COORDINATES, which is the only input both sides
 * share.
 *
 * The app hands `enrichRouteWithElevation` a route and its geometry; the
 * server hands `getElevationGain` the geometry alone, after downsampling.
 * Deriving from geometry is what makes the two receive the same number without
 * a fudge factor — an earlier version of this test reconstructed the figure
 * from the route distance on one side and the polyline on the other, and the
 * 0.57% gap between a 24-gon and its circle showed up as a 2-metre parity
 * failure that was entirely the test's fault.
 */
const fakeElevationGain = (coordinates: readonly [number, number][]): number => {
  let length = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    length += haversineDistance(
      [coordinates[i - 1]![1], coordinates[i - 1]![0]],
      [coordinates[i]![1], coordinates[i]![0]],
    );
  }
  return (length / 1000) * 12;
};

/** Stands in for `enrichRouteWithElevation`, matching what the real one does. */
const fakeElevation = async (
  route: RouteOption,
  coordinates: [number, number][],
): Promise<RouteOption> => {
  const gain = fakeElevationGain(coordinates);
  return {
    ...route,
    totalClimbMeters: Math.round(gain),
    elevationProfile: FAKE_ELEVATION_PROFILE,
    // A routed loop's duration already includes climbing, so enrichment leaves
    // the ETA at the router's duration (`durationIncludesClimbs: true`).
    adjustedDurationSeconds: route.durationSeconds,
  };
};

const fakeRisk = async (route: RouteOption): Promise<RouteOption> => ({
  ...route,
  riskSegments: [],
});

const fakeScenic = async (): Promise<number> => 0;

/**
 * The server's measurement, wired to the same fakes the app path uses.
 *
 * Built through the real `createMeasurementPort` rather than hand-rolled, so
 * the parity check covers how the server assembles a measurement — including
 * how it sets the adjusted duration — and not merely that one happened.
 */
const serverMeasurementPort = () =>
  createMeasurementPort({
    getElevationProfile: async () => FAKE_ELEVATION_PROFILE,
    getElevationGain: async (coordinates: [number, number][]) => ({
      elevationGain: fakeElevationGain(coordinates),
      elevationLoss: 0,
    }),
    fetchRiskSegments: async () => [],
    fetchScenicSegments: async () => [],
  } as never);

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** The fields a rider can see or the ranking can read. Ids are included
 *  because the fake router derives them from geometry, so a mismatch means the
 *  two implementations picked different rings, not different clocks. */
const comparable = (loop: GeneratedLoop) => ({
  id: loop.id,
  bearingDegrees: Math.round(loop.bearingDegrees * 1e6) / 1e6,
  distanceMeters: Math.round(loop.distanceMeters * 1e3) / 1e3,
  climbMeters: loop.climbMeters,
  highRiskMeters: loop.highRiskMeters,
  unpavedShare: loop.unpavedShare,
  retracedShare: loop.retracedShare,
  ringRetracedShare: loop.ringRetracedShare,
  spurShare: loop.spurShare,
  stemMeters: Math.round(loop.stemMeters * 1e3) / 1e3,
  scenicScore: loop.scenicScore,
  pavedFallback: loop.pavedFallback,
  relaxation: loop.relaxation,
  terrain: loop.terrain,
  measured: loop.measured,
  // The route is the thing the rider actually rides, so it is compared too —
  // in particular the reroute-suppression marker and the terrain-adjusted ETA,
  // which each side computes with its own copy of the same formula.
  route: {
    source: loop.route.source,
    distanceMeters: Math.round(loop.route.distanceMeters * 1e3) / 1e3,
    durationSeconds: Math.round(loop.route.durationSeconds * 1e3) / 1e3,
    adjustedDurationSeconds: loop.route.adjustedDurationSeconds,
    totalClimbMeters: loop.route.totalClimbMeters,
    elevationProfile: loop.route.elevationProfile,
    riskSegments: loop.route.riskSegments,
  },
});

const summarise = (outcome: LoopSearchOutcome) => {
  if (outcome.status !== 'ok') return { status: outcome.status };
  return {
    status: outcome.status,
    relaxation: outcome.relaxation,
    checked: outcome.checked,
    loops: outcome.loops.map(comparable),
  };
};

const SCENARIOS: {
  name: string;
  router: RouterConfig;
  request: Omit<LoopSearchRequest, 'start' | 'locale'>;
}[] = [
  {
    name: 'a clean search that lands on the first rung',
    router: { detour: 2.11, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 15_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    // The placement axis. Every candidate here is a lollipop, which changes
    // both the waypoint geometry and the stem exemption the caps read, so the
    // two implementations have the most to disagree about.
    name: 'an out-of-town search with a known city edge',
    router: { detour: 2.11, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 60_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      placement: 'out_of_town',
      urbanEdgeMeters: 7_200,
    },
  },
  {
    // The blind path: no geocode, so clearance falls back to the affordable
    // maximum. It is a different number on both sides or it is a bug.
    name: 'an out-of-town search with no city edge',
    router: { detour: 2.6, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 40_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'E',
      placement: 'out_of_town',
      urbanEdgeMeters: null,
    },
  },
  {
    name: 'a named heading that has to widen',
    router: { detour: 2.6, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 20_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'E',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    name: 'a terrain ask nothing satisfies',
    router: { detour: 2.11, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 15_000,
      terrain: 'flat',
      surface: 'any',
      heading: 'N',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    name: 'every candidate over the doubling-back cap',
    router: { detour: 2.11, ringRetracedShare: 0.6, spurShare: 0 },
    request: {
      targetDistanceMeters: 30_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    name: 'every candidate over the spur cap',
    router: { detour: 2.11, ringRetracedShare: 0.05, spurShare: 0.4 },
    request: {
      targetDistanceMeters: 10_000,
      terrain: 'hilly',
      surface: 'offroad',
      heading: 'SW',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    // Pins the ORDER of the ladder, which nothing else here can. Every ring
    // comes back 20% long however the radius is corrected: outside the strict
    // 12% band, inside the relaxed 25% one. Widening the heading first throws
    // five more rings and offers loops from both arcs; widening the distance
    // first offers five loops from the narrow arc and never makes those
    // requests. The rider sees different loops either way.
    name: 'a ladder that has to climb, with a router that will not converge',
    router: {
      detour: 2.11,
      ringRetracedShare: 0.05,
      spurShare: 0,
      fixedDistanceMeters: 18_000,
    },
    request: {
      targetDistanceMeters: 15_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'NE',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
  {
    name: 'a paved-only search at the shortest offered distance',
    router: { detour: 2.11, ringRetracedShare: 0.05, spurShare: 0 },
    request: {
      targetDistanceMeters: 5_000,
      terrain: 'rolling',
      surface: 'paved',
      heading: 'NW',
      placement: 'around_here',
      urbanEdgeMeters: null,
    },
  },
];

const START: Coordinate = { lat: 44.4268, lon: 26.1025 };

describe('server and on-device loop generation agree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(SCENARIOS)('$name', async ({ router, request }) => {
    const fullRequest: LoopSearchRequest = {
      ...request,
      start: START,
      locale: 'en',
    };

    fakeRouter = createDeterministicRouter(router);
    const onDevice = await searchLoopsOnDevice(fullRequest as never);
    const deviceCalls = fakeRouter.calls.length;

    fakeRouter = createDeterministicRouter(router);
    const onServer = await searchLoopsOnServer(
      {
        fetchRing: fakeRouter.fetchRing as never,
        measure: serverMeasurementPort().measure,
      },
      fullRequest,
    );
    const serverCalls = fakeRouter.calls.length;

    expect(summarise(onServer)).toEqual(summarise(onDevice));

    // The request budget has to match too. A server that quietly throws twice
    // as many rings would produce identical loops here and a different bill,
    // a different wait, and a different load on the routing box.
    expect(serverCalls).toBe(deviceCalls);
  });

  it('measures the same number of loops as the app does', async () => {
    const config: RouterConfig = {
      detour: 2.11,
      ringRetracedShare: 0.05,
      spurShare: 0,
    };
    const request: LoopSearchRequest = {
      start: START,
      targetDistanceMeters: 15_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      placement: 'around_here',
      urbanEdgeMeters: null,
      locale: 'en',
    };

    fakeRouter = createDeterministicRouter(config);
    const onDevice = await searchLoopsOnDevice(request as never);

    fakeRouter = createDeterministicRouter(config);
    const onServer = await searchLoopsOnServer(
      {
        fetchRing: fakeRouter.fetchRing as never,
        measure: serverMeasurementPort().measure,
      },
      request,
    );

    if (onDevice.status !== 'ok' || onServer.status !== 'ok') {
      throw new Error('both implementations should have found loops');
    }
    // `checked` is quoted to the rider in the honest-miss copy, so the two
    // paths disagreeing here would put a different number on the same screen.
    expect(onServer.checked).toBe(onDevice.checked);
  });

  it('reports the same candidates to the map, in the same order', async () => {
    const config: RouterConfig = {
      detour: 2.11,
      ringRetracedShare: 0.05,
      spurShare: 0,
    };
    const request: LoopSearchRequest = {
      start: START,
      targetDistanceMeters: 15_000,
      terrain: 'rolling',
      surface: 'any',
      heading: 'any',
      placement: 'around_here',
      urbanEdgeMeters: null,
      locale: 'en',
    };

    fakeRouter = createDeterministicRouter(config);
    const deviceDrawn: string[] = [];
    await searchLoopsOnDevice(request as never, {
      onCandidate: (loop: GeneratedLoop) => deviceDrawn.push(loop.id),
    } as never);

    fakeRouter = createDeterministicRouter(config);
    const serverDrawn: string[] = [];
    await searchLoopsOnServer(
      {
        fetchRing: fakeRouter.fetchRing as never,
        measure: serverMeasurementPort().measure,
      },
      request,
      { onCandidate: (loop) => serverDrawn.push(loop.id) },
    );

    // Not just the same set: the same sequence. This is what the rider watches
    // draw onto the map, so an order difference is visible even when the final
    // five are identical.
    expect(serverDrawn).toEqual(deviceDrawn);
  });

  /**
   * Guards against the quietest possible failure of this feature: both sides
   * accepting `placement` and neither acting on it.
   *
   * Every existing scenario passed on the day placement was added, because
   * they all leave it at `around_here` and that reproduces the old behaviour
   * exactly. That is the right default and a useless test — a field carried
   * from the screen to the router and then ignored looks identical to a
   * working one from the outside.
   *
   * Both halves of the fix are asserted separately, because an earlier version
   * of this test checked only the reach of the finished loops and a deliberate
   * break of the clearance half slipped straight through it: the fake router
   * returns a circle sized from the total distance, so reach measured off its
   * geometry is a function of distance and tells you nothing about where the
   * loop was actually placed. These read the REQUESTS instead.
   */
  const runPlacement = async (
    placement: 'out_of_town' | 'around_here',
    overrides: { targetDistanceMeters: number; urbanEdgeMeters: number | null },
  ) => {
    fakeRouter = createDeterministicRouter({
      detour: 2.11,
      ringRetracedShare: 0.05,
      spurShare: 0,
    });

    /** Straight-line distance from the start to each ring's first waypoint. */
    const anchorMeters: number[] = [];
    const fetchRing = async (
      start: Coordinate,
      waypoints: readonly Coordinate[],
      options: Record<string, unknown>,
    ) => {
      const first = waypoints[0]!;
      anchorMeters.push(
        haversineDistance([start.lat, start.lon], [first.lat, first.lon]),
      );
      return fakeRouter.fetchRing(start, waypoints, options);
    };

    const outcome = await searchLoopsOnServer(
      { fetchRing: fetchRing as never, measure: serverMeasurementPort().measure },
      {
        start: START,
        terrain: 'rolling',
        surface: 'any',
        heading: 'any',
        locale: 'en',
        placement,
        ...overrides,
      },
    );

    return { outcome, anchorMeters, calls: fakeRouter.calls };
  };

  it('makes every out-of-town candidate ride out first', async () => {
    const out = await runPlacement('out_of_town', {
      targetDistanceMeters: 60_000,
      urbanEdgeMeters: 7_200,
    });
    const around = await runPlacement('around_here', {
      targetDistanceMeters: 60_000,
      urbanEdgeMeters: 7_200,
    });

    // A ring centred on the rider cannot leave a city at any offered distance,
    // so out-of-town spends none of its budget on one.
    expect(out.calls.every((call) => call.stemLegs > 0)).toBe(true);
    expect(around.calls.some((call) => call.stemLegs === 0)).toBe(true);
  });

  it('puts the loop much further out when town is unknown', async () => {
    // The blind path, and the one where the two clearances differ most: the
    // old fraction capped out at 8 km however long the ride, where the
    // affordable maximum on a 100 km ride is over 17 km.
    const out = await runPlacement('out_of_town', {
      targetDistanceMeters: 100_000,
      urbanEdgeMeters: null,
    });
    const around = await runPlacement('around_here', {
      targetDistanceMeters: 100_000,
      urbanEdgeMeters: null,
    });

    expect(Math.max(...out.anchorMeters)).toBeGreaterThan(
      Math.max(...around.anchorMeters) * 1.3,
    );
  });

  it('holds the clearance steady while the ring is resized', async () => {
    // Convergence used to scale the whole stem-plus-ring budget and re-derive
    // clearance from it, so a lollipop that came back long had its loop walked
    // back towards the rider's house. Every attempt on one bearing should now
    // agree about how far out the loop sits, to within the ring radius.
    const out = await runPlacement('out_of_town', {
      targetDistanceMeters: 60_000,
      urbanEdgeMeters: 7_200,
    });

    const spread =
      Math.max(...out.anchorMeters) - Math.min(...out.anchorMeters);
    expect(spread).toBeLessThan(4_000);
  });
});
