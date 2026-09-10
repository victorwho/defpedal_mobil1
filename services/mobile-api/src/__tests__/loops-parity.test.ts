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

/**
 * The app's terrain-adjusted duration, copied from `mapbox-routing.ts`.
 *
 * Written out here rather than imported from the server's port on purpose: the
 * server has its own copy of this formula, and calling one function from both
 * sides would prove they agree with themselves. Copying the app's is what makes
 * a divergence in the ported formula fail this test.
 */
const mobileAdjustedDuration = (
  flatDuration: number,
  elevationGain: number,
): number => {
  const estimatedClimbs =
    elevationGain > 2 ? Math.max(1, Math.round(elevationGain / 30)) : 0;
  return flatDuration + elevationGain * 0.75 + estimatedClimbs * 10;
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
    adjustedDurationSeconds: Math.round(
      mobileAdjustedDuration(route.durationSeconds, gain),
    ),
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
 * its own adjusted-duration formula — and not merely that one happened.
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
});
