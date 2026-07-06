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

describe('country-aware OSRM dispatch', () => {
  it('routes Spanish safe requests to osrm-es', async () => {
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
    expect(firstCallUrl).toContain('://osrm-es.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-es-flat');
  });

  it('routes Spanish flat requests to osrm-es-flat', async () => {
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
    expect(firstCallUrl).toContain('://osrm-es-flat.defensivepedal.com');
  });

  it('keeps RO requests on osrm.defensivepedal.com (not osrm-es)', async () => {
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
    expect(firstCallUrl).not.toContain('osrm-es');
  });

  it('falls back to Mapbox when safe is requested in an unsupported country', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    // Paris → Paris (both unsupported)
    const result = await directPreviewRoute({
      origin: { lat: 48.8566, lon: 2.3522 },
      destination: { lat: 48.86, lon: 2.36 },
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

  // Commit 055e89a added a 400km straight-line guard on every Mapbox
  // Directions call (the API 422s beyond that), so the cross-border fallback
  // is only reachable for pairs under 400km. Bucharest → Sofia (~294km,
  // destination outside both bboxes) exercises the fallback; the old
  // Bucharest → Madrid (~2,470km) pair now correctly fails fast instead —
  // covered by the rejection test below.
  it('falls back to Mapbox on a cross-border ride to an unsupported neighbor (RO -> BG)', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.4268, lon: 26.1025 },   // Bucharest
      destination: { lat: 42.6977, lon: 23.3219 }, // Sofia (~294km, unsupported)
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('api.mapbox.com');
    expect(result.coverage.safeRouting).toBe(false);
  });

  it('fails fast with a clear message when a Mapbox-bound route exceeds the 400km guard (RO -> ES)', async () => {
    setupFetchMock([]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.4268, lon: 26.1025 },   // Bucharest
        destination: { lat: 40.4168, lon: -3.7038 }, // Madrid (~2,470km)
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
