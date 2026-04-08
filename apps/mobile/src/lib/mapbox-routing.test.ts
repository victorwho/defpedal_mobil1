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
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('exclude=unpaved');
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
    });

    const steps = result.routes[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].instruction).toContain('Head');
    expect(steps[0].instruction).toContain('Main Street');
    expect(steps[0].streetName).toBe('Main Street');
    expect(steps[1].instruction).toContain('Left');
    expect(steps[1].instruction).toContain('Oak Avenue');
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
    });

    expect(result.routes).toHaveLength(1);
    expect(result.selectedMode).toBe('safe');
  });
});
