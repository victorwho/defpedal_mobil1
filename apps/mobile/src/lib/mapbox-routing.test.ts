import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  mobileEnv: {
    mapboxPublicToken: 'pk.test_token_12345',
    mobileApiUrl: 'https://test-api.example.com',
  },
}));

vi.mock('./supabase', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
}));

import { directPreviewRoute, directReroute } from './mapbox-routing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createOsrmRoute = (overrides?: Partial<{
  distance: number;
  duration: number;
  coords: [number, number][];
}>) => ({
  geometry: {
    type: 'LineString',
    coordinates: overrides?.coords ?? [[26.1, 44.43], [26.12, 44.44]],
  },
  distance: overrides?.distance ?? 5000,
  duration: overrides?.duration ?? 900,
  legs: [{
    steps: [{
      maneuver: { type: 'depart', modifier: 'right' },
      name: 'Main Street',
      distance: 2500,
      duration: 450,
      geometry: { type: 'LineString', coordinates: [[26.1, 44.43], [26.11, 44.435]] },
      mode: 'cycling',
    }, {
      maneuver: { type: 'turn', modifier: 'left' },
      name: 'Oak Avenue',
      distance: 2500,
      duration: 450,
      geometry: { type: 'LineString', coordinates: [[26.11, 44.435], [26.12, 44.44]] },
      mode: 'cycling',
    }],
  }],
});

const createRouteResponse = (routes?: any[]) => ({
  code: 'Ok',
  routes: routes ?? [createOsrmRoute()],
});

const createElevationResponse = () => ({
  elevationProfile: [100, 105, 110, 108, 112],
  elevationGain: 15,
  elevationLoss: 5,
});

const createRiskResponse = () => ({
  riskSegments: [
    { start: 0, end: 0.5, riskScore: 3, riskLevel: 'medium' },
    { start: 0.5, end: 1.0, riskScore: 1, riskLevel: 'low' },
  ],
});

let fetchCallIndex = 0;

const setupFetchMock = (responses: Array<{ data: unknown; ok?: boolean; status?: number }>) => {
  fetchCallIndex = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const idx = fetchCallIndex++;
    const resp = responses[idx] ?? { data: {}, ok: true };

    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      json: async () => resp.data,
      text: async () => JSON.stringify(resp.data),
    } as Response;
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  fetchCallIndex = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('directPreviewRoute', () => {
  it('fetches safe route from OSRM server', async () => {
    setupFetchMock([
      { data: createRouteResponse() },  // OSRM route
      { data: createElevationResponse() },  // elevation
      { data: createRiskResponse() },  // risk
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].source).toBe('custom_osrm');
    expect(result.selectedMode).toBe('safe');
    expect(result.generatedAt).toBeDefined();
  });

  it('fetches fast route from Mapbox Directions', async () => {
    setupFetchMock([
      { data: createRouteResponse() },  // Mapbox route
      { data: createElevationResponse() },  // elevation
      { data: createRiskResponse() },  // risk
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].source).toBe('mapbox');
    expect(result.selectedMode).toBe('fast');
  });

  it('throws when OSRM returns no routes', async () => {
    setupFetchMock([
      { data: { code: 'Ok', routes: [] } },
    ]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow('OSRM returned no routes');
  });

  it('throws when Mapbox returns non-Ok code', async () => {
    setupFetchMock([
      { data: { code: 'NoRoute', routes: [] } },
    ]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'fast',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow('Mapbox returned no routes');
  });

  it('throws when routing HTTP fails', async () => {
    setupFetchMock([
      { data: 'Server Error', ok: false, status: 500 },
    ]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow('OSRM routing failed (500)');
  });

  it('enriches routes with elevation data', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes[0].totalClimbMeters).toBe(15);
    expect(result.routes[0].elevationProfile).toEqual([100, 105, 110, 108, 112]);
  });

  it('enriches routes with risk segments', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes[0].riskSegments).toHaveLength(2);
  });

  it('gracefully handles elevation enrichment failure', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: null, ok: false, status: 500 },  // elevation fails
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    // Should still return a route, just without elevation
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].totalClimbMeters).toBeNull();
  });

  it('gracefully handles risk enrichment failure', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: null, ok: false },  // risk fails
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].riskSegments).toEqual([]);
  });

  it('adds avoidUnpaved to OSRM URL when enabled', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('exclude=unpaved');
  });

  it('uses flat OSRM endpoint when avoidHills is enabled', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-flat.defensivepedal.com');
    expect(firstCallUrl).toContain('/route/v1/bicycle/');
  });

  it('uses standard OSRM endpoint when avoidHills is false', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-flat.defensivepedal.com');
    expect(firstCallUrl).toContain('/route/v1/bicycle/');
  });

  it('composes avoidHills and avoidUnpaved correctly', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-flat.defensivepedal.com');
    expect(firstCallUrl).toContain('exclude=unpaved');
  });

  it('ignores avoidHills in fast mode', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: false,
      avoidHills: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('api.mapbox.com');
    expect(firstCallUrl).not.toContain('bicycle-flat');
  });

  it('includes coverage region in response', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      countryHint: 'ro',
    });

    expect(result.coverage).toEqual({
      countryCode: 'RO',
      status: 'supported',
      safeRouting: true,
      fastRouting: true,
    });
  });

  it('maps navigation steps correctly', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const steps = result.routes[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].instruction).toContain('Head');
    expect(steps[0].instruction).toContain('Main Street');
    expect(steps[0].streetName).toBe('Main Street');
    // Safe-mode (OSRM) fallback now builds a localized phrase via i18n
    // (defaults to EN here since no locale is passed) — "Turn left onto …"
    // rather than the old bare-capitalized "Left onto …".
    expect(steps[1].instruction).toBe('Turn left onto Oak Avenue');
  });

  it('handles route with arrive maneuver', async () => {
    const route = createOsrmRoute();
    route.legs[0].steps.push({
      maneuver: { type: 'arrive', modifier: undefined as any },
      name: '',
      distance: 0,
      duration: 0,
      geometry: { type: 'LineString', coordinates: [[26.12, 44.44]] },
      mode: 'cycling',
    });

    setupFetchMock([
      { data: { code: 'Ok', routes: [route] } },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const lastStep = result.routes[0].steps[result.routes[0].steps.length - 1];
    expect(lastStep.instruction).toBe('Arrive at your destination');
  });

  it('handles waypoints in route request', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      waypoints: [{ lat: 44.435, lon: 26.11 }],
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    // With waypoints, alternatives should be false
    expect(firstCallUrl).toContain('alternatives=false');
    // Should include three coordinate pairs (origin, waypoint, destination)
    expect(firstCallUrl).toContain('26.1,44.43');
    expect(firstCallUrl).toContain('26.11,44.435');
    expect(firstCallUrl).toContain('26.12,44.44');
  });
});

describe('EU-wide OSRM dispatch (single graph, 2026-07-12)', () => {
  it('routes Spanish safe requests to the EU OSRM server', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    // Madrid → Barcelona
    await directPreviewRoute({
      origin: { lat: 40.4168, lon: -3.7038 },
      destination: { lat: 41.3851, lon: 2.1734 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-es');
  });

  it('routes Spanish flat requests to the EU flat server', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 40.4168, lon: -3.7038 },
      destination: { lat: 41.3851, lon: 2.1734 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm-flat.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-es');
  });

  it('routes safe requests in a newly covered country (Berlin) to the EU server', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 52.52, lon: 13.405 },
      destination: { lat: 52.53, lon: 13.42 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm.defensivepedal.com');
    expect(result.selectedMode).toBe('safe');
    expect(result.coverage.safeRouting).toBe(true);
  });

  it('routes cross-border rides within coverage via OSRM (RO -> BG)', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.4268, lon: 26.1025 },   // Bucharest
      destination: { lat: 42.6977, lon: 23.3219 }, // Sofia — same EU graph now
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm.defensivepedal.com');
    expect(result.selectedMode).toBe('safe');
    expect(result.coverage.safeRouting).toBe(true);
  });

  it('falls back to Mapbox when safe is requested in an unsupported country', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    // London → London (UK outside coverage)
    const result = await directPreviewRoute({
      origin: { lat: 51.5074, lon: -0.1278 },
      destination: { lat: 51.51, lon: -0.1 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('api.mapbox.com');
    expect(firstCallUrl).not.toContain('osrm');
    expect(result.selectedMode).toBe('fast');
    expect(result.routes[0].source).toBe('mapbox');
    expect(result.coverage.safeRouting).toBe(false);
    expect(result.coverage.status).toBe('unsupported');
  });

  it('degrades to Mapbox when OSRM answers a bbox mis-hit with zero-distance routes', async () => {
    // Chișinău sits inside the loose RO bbox but outside the graph — OSRM
    // answers Ok + distance-0 (probed 2026-07-12). The guard must flip the
    // ride to Mapbox fast routing and report coverage as unsupported.
    const zeroDistanceRoute = { ...createOsrmRoute(), distance: 0 };
    setupFetchMock([
      { data: { code: 'Ok', routes: [zeroDistanceRoute] } }, // OSRM garbage
      { data: createRouteResponse() },                       // Mapbox fallback
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 47.0105, lon: 28.8638 },
      destination: { lat: 47.02, lon: 28.88 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const calls = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toContain('://osrm.defensivepedal.com');
    expect(calls[1]).toContain('api.mapbox.com');
    expect(result.selectedMode).toBe('fast');
    expect(result.routes[0].source).toBe('mapbox');
    expect(result.coverage.safeRouting).toBe(false);
    expect(result.coverage.status).toBe('unsupported');
  });

  it('downsamples oversized route geometry before POSTing to /v1/risk-segments', async () => {
    // EU-wide routes can carry huge geometries; the raw body used to blow
    // past the server's limit (Sentry FST_ERR_CTP_BODY_TOO_LARGE 2026-07-12).
    const bigCoords: [number, number][] = Array.from({ length: 20_000 }, (_, i) => [
      26.1 + i * 0.0001,
      44.43 + i * 0.0001,
    ]);
    setupFetchMock([
      { data: createRouteResponse([createOsrmRoute({ coords: bigCoords })]) },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const riskCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/v1/risk-segments'));
    expect(riskCall).toBeDefined();
    const body = JSON.parse((riskCall![1] as RequestInit).body as string) as {
      geometry: { coordinates: [number, number][] };
    };
    expect(body.geometry.coordinates.length).toBeLessThanOrEqual(12_000);
    expect(body.geometry.coordinates[0]).toEqual(bigCoords[0]);
    expect(body.geometry.coordinates[body.geometry.coordinates.length - 1]).toEqual(
      bigCoords[bigCoords.length - 1],
    );

    // The elevation POST carries the same cap — it hit the identical
    // body-too-large error on EU-length routes (Sentry MOBILE-R).
    const elevationCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes('/v1/elevation-profile'));
    expect(elevationCall).toBeDefined();
    const elevationBody = JSON.parse(
      (elevationCall![1] as RequestInit).body as string,
    ) as { coordinates: [number, number][] };
    expect(elevationBody.coordinates.length).toBeLessThanOrEqual(12_000);
  });

  it('fails fast with a clear message when a Mapbox-bound route exceeds the 400km guard', async () => {
    setupFetchMock([]);

    await expect(
      directPreviewRoute({
        origin: { lat: 51.5074, lon: -0.1278 },  // London (unsupported → Mapbox)
        destination: { lat: 55.9533, lon: -3.1883 }, // Edinburgh (~530km)
        mode: 'safe',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow('Route is too long for fast routing');

    // Fails BEFORE any network call — that's the point of the guard.
    expect(vi.mocked(fetch).mock.calls).toHaveLength(0);
  });

  it('attempts safe-vs-fast comparison for ES once the country gate allows it', async () => {
    // 5 calls expected for an ES safe ride with comparison enabled:
    //   1. OSRM-ES safe route
    //   2. elevation profile
    //   3. risk segments
    //   4. Mapbox fast route (comparison)
    //   5. risk segments for comparison route
    // ES has no road_risk_data yet so the inner length>0 guard suppresses
    // the label — but the OSRM-ES → Mapbox path is now exercised, so the
    // label will turn on automatically the moment Spain data ships.
    setupFetchMock([
      { data: createRouteResponse() },          // OSRM-ES
      { data: createElevationResponse() },      // elevation
      { data: { riskSegments: [] } },           // risk (empty for ES)
      { data: createRouteResponse() },          // Mapbox comparison
      { data: { riskSegments: [] } },           // risk for comparison (empty)
    ]);

    const result = await directPreviewRoute({
      // Madrid → Zaragoza (~273km): stays under the 400km Mapbox guard from
      // commit 055e89a so the comparison fetch still fires (the old Madrid →
      // Barcelona pair was ~505km and the comparison is now skipped there).
      origin: { lat: 40.4168, lon: -3.7038 },
      destination: { lat: 41.6488, lon: -0.8891 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      showRouteComparison: true,
    });

    expect(vi.mocked(fetch).mock.calls).toHaveLength(5);
    // Empty risk arrays → no label produced (graceful)
    expect(result.comparisonLabel).toBeUndefined();
  });
});

describe('directReroute', () => {
  it('delegates to directPreviewRoute', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directReroute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes).toHaveLength(1);
    expect(result.selectedMode).toBe('safe');
  });
});
