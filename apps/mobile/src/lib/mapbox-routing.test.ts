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

import { directPreviewRoute, directReroute, enrichRouteWithElevation } from './mapbox-routing';

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
    ).rejects.toThrow(/OSRM routing failed.*500/);
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

  // The fixture route is 900 s with 15 m of ascent, so the app's climb
  // penalty would be 15 * 0.75 + one climb * 10 = 21 s. Both routers already
  // price climbs into their duration (measured against the live services —
  // see `enrichRouteWithElevation`), so a routed ETA must stay at 900.
  it('does not add the climb penalty to a standard safe route, whose OSRM duration already includes climbs', async () => {
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

    expect(result.routes[0].durationSeconds).toBe(900);
    expect(result.routes[0].adjustedDurationSeconds).toBe(900);
    expect(result.routes[0].totalClimbMeters).toBe(15);
  });

  it('does not add the climb penalty to a flat-profile route', async () => {
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
      avoidHills: true,
    });

    expect(result.routes[0].adjustedDurationSeconds).toBe(900);
  });

  it('does not add the climb penalty to a fast (Mapbox) route, whose duration also includes climbs', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: false,
      avoidHills: false,
    });

    expect(result.routes[0].source).toBe('mapbox');
    expect(result.routes[0].adjustedDurationSeconds).toBe(900);
  });

  it('does not add the climb penalty to an e-bike route, whose OSRM duration already prices assisted climbs', async () => {
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
      isEbike: true,
    });

    expect(result.routes[0].adjustedDurationSeconds).toBe(900);
    // Still elevation-enriched — only the time penalty is skipped.
    expect(result.routes[0].totalClimbMeters).toBe(15);
    expect(result.routes[0].elevationProfile).toEqual([100, 105, 110, 108, 112]);
  });

  it('does not add the climb penalty when an e-bike request degrades to Mapbox on a coverage miss', async () => {
    const zeroDistanceRoute = { ...createOsrmRoute(), distance: 0 };
    setupFetchMock([
      { data: { code: 'Ok', routes: [zeroDistanceRoute] } }, // e-bike OSRM mis-hit
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
      isEbike: true,
    });

    expect(result.routes[0].source).toBe('mapbox');
    expect(result.routes[0].adjustedDurationSeconds).toBe(900);
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

  it('uses shade OSRM endpoint when avoidHeat is enabled inside heat coverage (RO)', async () => {
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
      avoidHeat: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-shade.defensivepedal.com');
    expect(firstCallUrl).toContain('/route/v1/bicycle/');
  });

  it('avoidHeat wins over avoidHills when both are set', async () => {
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
      avoidHeat: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-shade.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-flat.defensivepedal.com');
  });

  it('composes avoidHeat with avoidUnpaved (exclude param on shade endpoint)', async () => {
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
      avoidHeat: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-shade.defensivepedal.com');
    expect(firstCallUrl).toContain('exclude=unpaved');
  });

  it('uses the shade OSRM endpoint outside Romania too (Berlin)', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 52.52, lon: 13.4 },
      destination: { lat: 52.53, lon: 13.42 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      avoidHeat: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm-shade.defensivepedal.com/route/v1/bicycle/');
  });

  it('ignores avoidHeat in fast mode', async () => {
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
      avoidHills: false,
      avoidHeat: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('api.mapbox.com');
    expect(firstCallUrl).not.toContain('osrm-shade');
  });

  it('uses the e-bike OSRM endpoint when isEbike is enabled', async () => {
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
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm-ebike.defensivepedal.com/route/v1/bicycle/');
    expect(firstCallUrl).not.toContain('exclude=unpaved');
  });

  it('isEbike wins over avoidHills — there is no e-bike flat graph', async () => {
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
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-ebike.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-flat.defensivepedal.com');
  });

  it('composes isEbike with avoidUnpaved (exclude param on the e-bike endpoint)', async () => {
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
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-ebike.defensivepedal.com');
    expect(firstCallUrl).toContain('exclude=unpaved');
  });

  it('uses the same e-bike hostname in Spain — never a country-split host', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 40.4168, lon: -3.7038 },
      destination: { lat: 40.4531, lon: -3.6883 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm-ebike.defensivepedal.com/route/v1/bicycle/');
    expect(firstCallUrl).not.toContain('osrm-es');
  });

  it('ignores isEbike in fast mode', async () => {
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
      avoidHills: false,
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('api.mapbox.com');
    expect(firstCallUrl).not.toContain('osrm-ebike');
  });

  it('cool outranks e-bike when both flags are set, now in every covered country (Berlin)', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    await directPreviewRoute({
      origin: { lat: 52.52, lon: 13.4 },
      destination: { lat: 52.53, lon: 13.42 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      avoidHeat: true,
      isEbike: true,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('osrm-shade.defensivepedal.com');
    expect(firstCallUrl).not.toContain('osrm-ebike.defensivepedal.com');
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

  it('routes a UK ride via OSRM with risk segments (b47v1, 2026-09-21)', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 51.5074, lon: -0.1278 },   // London
      destination: { lat: 51.5155, lon: -0.0877 }, // the City
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
    });

    const firstCallUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(firstCallUrl).toContain('://osrm.defensivepedal.com');
    expect(result.selectedMode).toBe('safe');
    expect(result.coverage.safeRouting).toBe(true);
    expect(result.coverage.countryCode).toBe('GB');
  });

  it('falls back to Mapbox when safe is requested in an unsupported country', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    // Kyiv → Kyiv (Ukraine outside coverage; London was the example until
    // the UK joined the graph on 2026-09-21)
    const result = await directPreviewRoute({
      origin: { lat: 50.4501, lon: 30.5234 },
      destination: { lat: 50.46, lon: 30.54 },
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
        origin: { lat: 50.4501, lon: 30.5234 },  // Kyiv (unsupported → Mapbox)
        destination: { lat: 46.4825, lon: 30.7233 }, // Odesa (~440km)
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
    // Empty risk arrays → no comparison produced (graceful)
    expect(result.comparison).toBeUndefined();
    expect(result.comparisonLabel).toBeUndefined();
  });

  it('produces a structured comparison with extraMinutes for a slower safe route', async () => {
    setupFetchMock([
      { data: createRouteResponse([createOsrmRoute({ duration: 1200 })]) }, // OSRM safe (20 min)
      { data: createElevationResponse() },                                  // elevation
      { data: { riskSegments: [{ start: 0, end: 1, riskScore: 10, riskLevel: 'low' }] } },
      { data: createRouteResponse([createOsrmRoute({ duration: 900 })] ) }, // Mapbox fast (15 min)
      { data: { riskSegments: [{ start: 0, end: 1, riskScore: 50, riskLevel: 'high' }] } },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      showRouteComparison: true,
    });

    expect(result.comparison).toEqual({
      against: 'fast',
      verdict: 'safer',
      diffPercent: 80, // |1 - 10/50| = 80%
      extraMinutes: 5, // 1200s vs 900s
      // These stub segments carry neither `riskCategory` nor `geometry`, so
      // nothing counts as busy. Real segments are exercised in the
      // busy-road-exposure suite below.
      busyRoadMeters: { current: 0, comparison: 0 },
    });
    // The legacy free-text label is no longer produced.
    expect(result.comparisonLabel).toBeUndefined();
  });

  it('reports less_safe without extraMinutes when riding the fast route', async () => {
    setupFetchMock([
      { data: createRouteResponse([createOsrmRoute({ duration: 900 })]) },  // Mapbox fast
      { data: createElevationResponse() },                                  // elevation
      { data: { riskSegments: [{ start: 0, end: 1, riskScore: 50, riskLevel: 'high' }] } },
      { data: createRouteResponse([createOsrmRoute({ duration: 1200 })]) }, // OSRM safe (comparison)
      { data: { riskSegments: [{ start: 0, end: 1, riskScore: 10, riskLevel: 'low' }] } },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: false,
      avoidHills: false,
      showRouteComparison: true,
    });

    expect(result.comparison).toEqual({
      against: 'safe',
      verdict: 'less_safe',
      diffPercent: 400, // |1 - 50/10| = 400%
    });
  });
});

describe('enrichRouteWithElevation — who owns climb time', () => {
  // 900 s, 15 m of ascent: the app penalty is 15 * 0.75 + one climb * 10 = 21 s.
  const route = {
    id: 'r',
    durationSeconds: 900,
    adjustedDurationSeconds: 900,
    distanceMeters: 5000,
    totalClimbMeters: null,
  } as unknown as Parameters<typeof enrichRouteWithElevation>[0];
  const coordinates: [number, number][] = [[26.1, 44.43], [26.12, 44.44]];

  it('leaves the ETA at the router duration when that duration already includes climbs', async () => {
    setupFetchMock([{ data: createElevationResponse() }]);

    const enriched = await enrichRouteWithElevation(route, coordinates, {
      durationIncludesClimbs: true,
    });

    expect(enriched.adjustedDurationSeconds).toBe(900);
    expect(enriched.totalClimbMeters).toBe(15);
  });

  it('adds climb time when the duration is an elevation-blind estimate (GPX courses)', async () => {
    setupFetchMock([{ data: createElevationResponse() }]);

    const enriched = await enrichRouteWithElevation(route, coordinates, {
      durationIncludesClimbs: false,
    });

    expect(enriched.adjustedDurationSeconds).toBe(921);
    expect(enriched.totalClimbMeters).toBe(15);
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

describe('no paved route exists', () => {
  /**
   * OSRM_Server commit 090c226 widens the `unpaved` class to cover
   * `highway=path` and `bridleway` without a paved surface tag. Measured on
   * their side, 30.2% of route metres around Rasnov sit on exactly those ways,
   * so `exclude=unpaved` becomes far stronger and NoRoute stops being exotic.
   *
   * The behaviour before this: the throw fell through to Mapbox fast routing,
   * so a rider asking for a SAFE, PAVED route silently got one that was
   * neither — no safety profile and no surface filter, with nothing said.
   */
  it('retries without the constraint rather than failing', async () => {
    setupFetchMock([
      { data: { code: 'NoRoute', message: 'Impossible route' } }, // paved attempt
      { data: createRouteResponse() }, // relaxed retry
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    });

    // Still the safety profile — the point of retrying rather than throwing.
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].source).toBe('custom_osrm');
  });

  it('says so on the route rather than handing back a silent downgrade', async () => {
    setupFetchMock([
      { data: { code: 'NoRoute', message: 'Impossible route' } },
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    });

    expect(result.routes[0].warnings).toContain('no_paved_route');
  });

  it('keeps the e-bike graph on the relaxed retry', async () => {
    setupFetchMock([
      { data: { code: 'NoRoute', message: 'Impossible route' } },
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
      isEbike: true,
    });

    const [pavedUrl, relaxedUrl] = vi
      .mocked(fetch)
      .mock.calls.slice(0, 2)
      .map((call) => call[0] as string);
    expect(pavedUrl).toContain('osrm-ebike.defensivepedal.com');
    expect(pavedUrl).toContain('exclude=unpaved');
    // Dropping the surface constraint must not also drop the pedelec.
    expect(relaxedUrl).toContain('osrm-ebike.defensivepedal.com');
    expect(relaxedUrl).not.toContain('exclude=unpaved');
  });

  it('does not warn when the paved route was found normally', async () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    });

    expect(result.routes[0].warnings).not.toContain('no_paved_route');
  });

  it('does not retry when the rider never asked for paved', async () => {
    // A NoRoute without the constraint is a real failure, not a constraint
    // that can be relaxed — retrying would hide it.
    setupFetchMock([{ data: { code: 'NoRoute', message: 'Impossible route' } }]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow();
  });
});

describe('avoid unpaved that cannot be honoured', () => {
  /**
   * Reported from the road: "avoid unpaved selected, route uses trails".
   * Measured, the router was fine — Rasnov -> Poiana Brasov with
   * `exclude=unpaved` returns a fully paved 10.8 km line, 0 of 41
   * intersections classed. Three app-side paths ignored the preference in
   * silence, and this covers the two that cannot honour it at all.
   */
  it('says so when Fast mode cannot avoid unpaved', () => {
    // Mapbox Directions has no unpaved exclusion on the cycling profile, so
    // the preference is unachievable rather than broken — but the rider had a
    // toggle on, a route on screen, and no way to connect the two.
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    return directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: true,
      avoidHills: false,
    }).then((result) => {
      expect(result.routes[0].warnings).toContain('unpaved_not_supported');
    });
  });

  it('stays quiet in Fast mode when the rider never asked', () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    return directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'fast',
      avoidUnpaved: false,
      avoidHills: false,
    }).then((result) => {
      expect(result.routes[0].warnings).not.toContain('unpaved_not_supported');
    });
  });

  it('stays quiet when Safe routing honoured it', () => {
    setupFetchMock([
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    return directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    }).then((result) => {
      expect(result.routes[0].warnings).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// The paved fallback, which was unreachable for the whole life of this file
// ---------------------------------------------------------------------------

describe('avoid unpaved, when nothing paved connects the points', () => {
  /** Exactly what the live router sends. Captured 2026-09-10. */
  const noRoute400 = {
    data: { message: 'No route found between points', code: 'NoRoute' },
    ok: false,
    status: 400,
  };

  it('drops the constraint and says so, instead of failing the whole preview', async () => {
    // THE regression test. OSRM reports "no paved way through here" as HTTP
    // 400 with `code: NoRoute`, and this file used to test the status before
    // reading the body — so it threw past the retry underneath, the throw
    // propagated out of `directPreviewRoute`, and the rider got a failed route
    // preview. It reproduces every time for a start that snaps to an unpaved
    // edge: measured on the live router, every Bucharest pair touching one
    // particular coordinate failed while every pair without it succeeded.
    setupFetchMock([
      noRoute400,
      { data: createRouteResponse() },
      { data: createElevationResponse() },
      { data: createRiskResponse() },
    ]);

    const result = await directPreviewRoute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
    });

    expect(result.routes).toHaveLength(1);
    // Still the SAFE profile. The alternative the old code fell into was
    // Mapbox, which is neither safe-scored nor able to exclude unpaved at all.
    expect(result.routes[0].source).toBe('custom_osrm');
    // And the rider is told, rather than quietly handed something else.
    expect(result.routes[0].warnings).toContain('no_paved_route');
  });

  it('asks with the constraint first and without it second', async () => {
    setupFetchMock([
      noRoute400,
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

    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String(calls[0][0])).toContain('exclude=unpaved');
    expect(String(calls[1][0])).not.toContain('exclude=unpaved');
  });

  it('does NOT drop the constraint when the rider never asked for it', async () => {
    // A NoRoute with no constraint to relax is a real failure, not a fallback.
    setupFetchMock([noRoute400]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: false,
        avoidHills: false,
      }),
    ).rejects.toThrow(/NoRoute/);
  });

  it('still fails a malformed request that answers the SAME status', async () => {
    // The fix must not become "stop throwing on 400". The live router returns
    // InvalidValue, InvalidQuery and InvalidOptions at 400 too, and swallowing
    // those would turn a real bug into a silent wrong answer.
    setupFetchMock([
      {
        data: { code: 'InvalidValue', message: 'Exclude flag combination is not supported.' },
        ok: false,
        status: 400,
      },
    ]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: true,
        avoidHills: false,
      }),
    ).rejects.toThrow(/InvalidValue/);
  });

  it('retries only once, so a second NoRoute is a real failure', async () => {
    setupFetchMock([noRoute400, noRoute400]);

    await expect(
      directPreviewRoute({
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe',
        avoidUnpaved: true,
        avoidHills: false,
      }),
    ).rejects.toThrow(/NoRoute/);
  });
});

// ---------------------------------------------------------------------------
// Shade-route canopy comparison
// ---------------------------------------------------------------------------

describe('directPreviewRoute — canopy comparison', () => {
  /**
   * URL-routed mock rather than the index-based `setupFetchMock`.
   *
   * The canopy call is fired between the route fetch and the enrichment
   * fetches, so an ordinal mock would silently hand the elevation payload to
   * whichever call happened to land in that slot. Routing by URL also makes
   * "was /compare called at all?" an assertion instead of an inference.
   */
  const setupRoutedFetchMock = (
    canopy?: { data: unknown; ok?: boolean; status?: number } | 'network-error',
  ) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('/compare')) {
        if (canopy === 'network-error') throw new Error('socket hang up');
        const resp = canopy ?? { data: {} };
        return {
          ok: resp.ok ?? true,
          status: resp.status ?? 200,
          json: async () => resp.data,
          text: async () => JSON.stringify(resp.data),
        } as Response;
      }

      let data: unknown = {};
      if (urlStr.includes('/route/v1/bicycle') || urlStr.includes('api.mapbox.com')) {
        data = createRouteResponse();
      } else if (urlStr.includes('elevation-profile')) {
        data = createElevationResponse();
      } else if (urlStr.includes('risk-segments')) {
        data = createRiskResponse();
      }

      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
      } as Response;
    });
  };

  const okCanopy = (overrides?: Record<string, unknown>) => ({
    data: {
      code: 'Ok',
      shade: { tree_pct: 29.0, coverage_pct: 83.6, distance_m: 9804 },
      safe: { tree_pct: 28.6, coverage_pct: 84.9, distance_m: 9836 },
      display: true,
      gen: 'b46v2-armEp2',
      ...overrides,
    },
  });

  const compareCalls = () =>
    vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .filter((url) => url.includes('/compare'));

  const coolRequest = (overrides?: Record<string, unknown>) => ({
    origin: { lat: 44.43, lon: 26.1 },
    destination: { lat: 44.44, lon: 26.12 },
    mode: 'safe' as const,
    avoidUnpaved: false,
    avoidHills: false,
    avoidHeat: true,
    ...overrides,
  });

  it('asks the shade server once, with lon,lat coordinates', async () => {
    setupRoutedFetchMock(okCanopy());

    await directPreviewRoute(coolRequest());

    const calls = compareCalls();
    expect(calls).toHaveLength(1);
    // lon first — the opposite order to our own Coordinate type, and the
    // easiest thing in this integration to get backwards.
    expect(calls[0]).toBe(
      'https://osrm-shade.defensivepedal.com/compare?from=26.1,44.43&to=26.12,44.44',
    );
  });

  it('returns both absolute percentages on the preview', async () => {
    setupRoutedFetchMock(okCanopy());

    const result = await directPreviewRoute(coolRequest());

    expect(result.canopy).toEqual({ shadeTreePct: 29.0, standardTreePct: 28.6 });
  });

  it('reports a shade route that scores below the standard one as-is', async () => {
    setupRoutedFetchMock(
      okCanopy({ shade: { tree_pct: 11.2 }, safe: { tree_pct: 30.4 } }),
    );

    const result = await directPreviewRoute(coolRequest());

    // Both values survive. Nothing in the response can express a delta, which
    // is what stops this case from rendering as negative shade.
    expect(result.canopy).toEqual({ shadeTreePct: 11.2, standardTreePct: 30.4 });
  });

  describe('is not requested at all when', () => {
    it('the route is a plain safe route', async () => {
      setupRoutedFetchMock();
      await directPreviewRoute(coolRequest({ avoidHeat: false }));
      expect(compareCalls()).toHaveLength(0);
    });

    it('the route is a fast route', async () => {
      setupRoutedFetchMock();
      await directPreviewRoute(coolRequest({ mode: 'fast' as const }));
      expect(compareCalls()).toHaveLength(0);
    });

    it('the route is an e-bike or flat route', async () => {
      setupRoutedFetchMock();
      await directPreviewRoute(coolRequest({ avoidHeat: false, isEbike: true }));
      await directPreviewRoute(coolRequest({ avoidHeat: false, avoidHills: true }));
      expect(compareCalls()).toHaveLength(0);
    });

    // /compare takes one origin and one destination. On a multi-stop route
    // its numbers would describe a different path than the one on screen.
    it('the route has waypoints', async () => {
      setupRoutedFetchMock(okCanopy());

      const result = await directPreviewRoute(
        coolRequest({ waypoints: [{ lat: 44.435, lon: 26.11 }] }),
      );

      expect(compareCalls()).toHaveLength(0);
      expect(result.canopy).toBeUndefined();
    });

    // Outside the routing bboxes the shade graph never served the route —
    // Mapbox did — so there is no shade route to describe.
    it('the country is outside OSRM coverage', async () => {
      setupRoutedFetchMock(okCanopy());

      const result = await directPreviewRoute(
        coolRequest({
          // Kyiv: outside the covered set.
          origin: { lat: 50.4501, lon: 30.5234 },
          destination: { lat: 50.46, lon: 30.54 },
        }),
      );

      expect(compareCalls()).toHaveLength(0);
      expect(result.canopy).toBeUndefined();
    });
  });

  describe('fails open — no comparison, route unaffected —', () => {
    const expectRouteStillFine = (
      result: Awaited<ReturnType<typeof directPreviewRoute>>,
    ) => {
      expect(result.canopy).toBeUndefined();
      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0].distanceMeters).toBe(5000);
      expect(result.selectedMode).toBe('safe');
    };

    it('on 429 rate limiting', async () => {
      setupRoutedFetchMock({ data: {}, ok: false, status: 429 });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('on HTTP 400', async () => {
      setupRoutedFetchMock({ data: {}, ok: false, status: 400 });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('on HTTP 502', async () => {
      setupRoutedFetchMock({ data: {}, ok: false, status: 502 });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    // Both arrive at HTTP 200, which is exactly why the code is checked.
    it('on a NoRoute code', async () => {
      setupRoutedFetchMock({ data: { code: 'NoRoute' } });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('on a TooLong code', async () => {
      setupRoutedFetchMock({ data: { code: 'TooLong' } });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('when the server withholds display consent', async () => {
      setupRoutedFetchMock(okCanopy({ display: false }));
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('on a network failure', async () => {
      setupRoutedFetchMock('network-error');
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });

    it('on a body it cannot read', async () => {
      setupRoutedFetchMock({ data: 'not json at all' });
      expectRouteStillFine(await directPreviewRoute(coolRequest()));
    });
  });
});

// ---------------------------------------------------------------------------
// Shade-route canopy comparison — composition with the rest of the preview
// ---------------------------------------------------------------------------

describe('directPreviewRoute — canopy composition', () => {
  /**
   * Per-URL-kind mock with independent call sequences, so the cool route and
   * the fast comparison route can differ (same URL shape, different call).
   */
  const setupCompositionMock = (opts: {
    osrm?: unknown[];
    mapbox?: unknown[];
    risk?: unknown[];
    compare?: unknown;
    compareHangs?: boolean;
  }) => {
    const seq = { osrm: 0, mapbox: 0, risk: 0 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const wrap = (data: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => data,
          text: async () => JSON.stringify(data),
        }) as Response;

      if (urlStr.includes('/compare')) {
        if (opts.compareHangs) return new Promise<Response>(() => {});
        return wrap(opts.compare ?? {});
      }
      if (urlStr.includes('/route/v1/bicycle')) {
        const i = seq.osrm++;
        return wrap(opts.osrm?.[i] ?? opts.osrm?.[0] ?? createRouteResponse());
      }
      if (urlStr.includes('api.mapbox.com')) {
        const i = seq.mapbox++;
        return wrap(opts.mapbox?.[i] ?? opts.mapbox?.[0] ?? createRouteResponse());
      }
      if (urlStr.includes('elevation-profile')) return wrap(createElevationResponse());
      if (urlStr.includes('risk-segments')) {
        const i = seq.risk++;
        return wrap(opts.risk?.[i] ?? opts.risk?.[0] ?? createRiskResponse());
      }
      return wrap({});
    });
  };

  const riskResponse = (score: number) => ({
    riskSegments: [
      { start: 0, end: 0.5, riskScore: score, riskLevel: 'low' },
      { start: 0.5, end: 1.0, riskScore: score, riskLevel: 'low' },
    ],
  });

  const slowRoute = createRouteResponse([
    { ...createOsrmRoute(), duration: 2400, distance: 8000 },
  ]);
  const quickRoute = createRouteResponse([
    { ...createOsrmRoute(), duration: 900, distance: 5000 },
  ]);

  const compareBody = {
    code: 'Ok',
    shade: { tree_pct: 29.0 },
    safe: { tree_pct: 28.6 },
    display: true,
  };

  const comparisonRequest = (overrides?: Record<string, unknown>) => ({
    origin: { lat: 44.43, lon: 26.1 },
    destination: { lat: 44.44, lon: 26.12 },
    mode: 'safe' as const,
    avoidUnpaved: false,
    avoidHills: false,
    showRouteComparison: true,
    ...overrides,
  });

  /*
   * Requirement: shade is never priced in minutes.
   *
   * The "+X min for a calmer ride" line renders directly above the canopy row,
   * so on a Cool preview the two read as one statement — "+25 min ... / Shade
   * route: 29% tree-lined". The shade profile changes which roads are chosen,
   * not how fast they are ridden, so that delta is not a cost of shade.
   *
   * The non-cool control below is what makes this test able to fail: it proves
   * the fixture really does produce an extraMinutes when the profile allows it.
   */
  describe('never prices shade in minutes', () => {
    const slowVsQuick = {
      osrm: [slowRoute],
      mapbox: [quickRoute],
      risk: [riskResponse(1), riskResponse(9)],
      compare: compareBody,
    };

    it('control: a plain safe route DOES report the extra minutes', async () => {
      setupCompositionMock(slowVsQuick);

      const result = await directPreviewRoute(comparisonRequest());

      expect(result.comparison?.verdict).toBe('safer');
      expect(result.comparison?.extraMinutes).toBeGreaterThanOrEqual(1);
    });

    it('a shade route reports the same verdict with NO minute figure', async () => {
      setupCompositionMock(slowVsQuick);

      const result = await directPreviewRoute(
        comparisonRequest({ avoidHeat: true }),
      );

      expect(result.comparison?.verdict).toBe('safer');
      expect(result.comparison?.extraMinutes).toBeUndefined();
      // ...and the canopy row is present, i.e. this is the exact composed
      // screen where the two lines would have sat together.
      expect(result.canopy).toEqual({ shadeTreePct: 29.0, standardTreePct: 28.6 });
    });
  });

  /*
   * Fail open must mean open in TIME as well as in content. The fetch starts
   * early and overlaps the enrichment, but a slow shade host must never hold
   * up a route the rider already has.
   */
  it('does not wait on a shade server that never answers', async () => {
    setupCompositionMock({ compareHangs: true });

    const started = Date.now();
    const result = await directPreviewRoute(
      comparisonRequest({ avoidHeat: true, showRouteComparison: false }),
    );
    const elapsed = Date.now() - started;

    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.canopy).toBeUndefined();
    // Well inside the 8s request timeout: the preview abandons the wait.
    expect(elapsed).toBeLessThan(4000);
  }, 15_000);

  /*
   * `exclude=unpaved` is accepted and silently ignored by /compare (measured
   * against the live server, 2026-09-17: byte-identical response). So our
   * displayed shade route and the one /compare measures are different paths,
   * and there is no parameter that would align them.
   */
  it('skips the comparison when the rider is avoiding unpaved', async () => {
    setupCompositionMock({ compare: compareBody });

    const result = await directPreviewRoute(
      comparisonRequest({ avoidHeat: true, avoidUnpaved: true, showRouteComparison: false }),
    );

    const calls = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.includes('/compare'));
    expect(calls).toHaveLength(0);
    expect(result.canopy).toBeUndefined();
  });

  /*
   * A reroute shares directPreviewRoute wholesale. Nothing renders the canopy
   * mid-ride, and a reroute is the worst moment to spend latency or the
   * 60/min per-IP budget on a garnish.
   */
  it('never fetches a comparison on a reroute, even on a cool ride', async () => {
    setupCompositionMock({ compare: compareBody });

    const result = await directReroute({
      origin: { lat: 44.43, lon: 26.1 },
      destination: { lat: 44.44, lon: 26.12 },
      mode: 'safe',
      avoidUnpaved: false,
      avoidHills: false,
      avoidHeat: true,
    } as any);

    const calls = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.includes('/compare'));
    expect(calls).toHaveLength(0);
    expect(result.canopy).toBeUndefined();
    // The reroute itself still worked.
    expect(result.routes.length).toBeGreaterThan(0);
  });

  /*
   * A coverage MISS inside a supported bbox: OSRM answers Ok with a
   * zero-distance route, the request degrades to Mapbox, and the rider is
   * looking at a Mapbox route — so there is no shade route to describe.
   *
   * Distinct from the Kyiv case, which never reaches the shade graph at all
   * because `effectiveMode` becomes 'fast' first. This one exercises the
   * `!osrmCoverageMiss` clause specifically.
   */
  it('skips the comparison when OSRM answers a covered bbox with no usable route', async () => {
    setupCompositionMock({
      osrm: [createRouteResponse([{ ...createOsrmRoute(), distance: 0, duration: 0 }])],
      compare: compareBody,
    });

    const result = await directPreviewRoute(
      comparisonRequest({ avoidHeat: true, showRouteComparison: false }),
    );

    expect(result.selectedMode).toBe('fast');
    expect(result.coverage.status).toBe('unsupported');
    const calls = vi
      .mocked(fetch)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.includes('/compare'));
    expect(calls).toHaveLength(0);
    expect(result.canopy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Busy-road exposure on the safe-vs-fast comparison
// ---------------------------------------------------------------------------

describe('directPreviewRoute — busy-road exposure', () => {
  /**
   * Risk segments in the shape the API actually returns — with `riskCategory`
   * and `geometry`, which the simplified `createRiskResponse` fixture above
   * omits. `busyRoadMeters` needs both, so a test built on that stub would
   * measure 0 metres and pass against a broken implementation.
   */
  const riskSegment = (category: string, lengthDeg: number, index: number) => ({
    id: `seg-${index}`,
    riskScore: category === 'High risk' ? 90 : 20,
    riskCategory: category,
    color: '#000000',
    geometry: {
      type: 'LineString',
      coordinates: [
        [26.1, 44.43 + index * 0.02],
        [26.1, 44.43 + index * 0.02 + lengthDeg],
      ],
    },
  });

  const riskBody = (segments: unknown[]) => ({ riskSegments: segments });

  const setupRiskMock = (safeSegments: unknown[], fastSegments: unknown[]) => {
    let riskCall = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const wrap = (data: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => data,
          text: async () => JSON.stringify(data),
        }) as Response;

      if (urlStr.includes('/compare')) return wrap({});
      if (urlStr.includes('/route/v1/bicycle') || urlStr.includes('api.mapbox.com')) {
        return wrap(createRouteResponse());
      }
      if (urlStr.includes('elevation-profile')) return wrap(createElevationResponse());
      if (urlStr.includes('risk-segments')) {
        // First risk call enriches the safe route, second the fast comparison.
        const body = riskCall === 0 ? safeSegments : fastSegments;
        riskCall += 1;
        return wrap(riskBody(body));
      }
      return wrap({});
    });
  };

  const request = {
    origin: { lat: 44.43, lon: 26.1 },
    destination: { lat: 44.44, lon: 26.12 },
    mode: 'safe' as const,
    avoidUnpaved: false,
    avoidHills: false,
    showRouteComparison: true,
  };

  it('reports both routes’ busy-road exposure on the comparison', async () => {
    setupRiskMock(
      // Safe route: mostly calm, one short busy run.
      [riskSegment('Typical', 0.01, 0), riskSegment('High risk', 0.002, 1)],
      // Fast route: a long busy run.
      [riskSegment('Typical', 0.002, 0), riskSegment('High risk', 0.02, 1)],
    );

    const result = await directPreviewRoute(request);

    expect(result.comparison?.busyRoadMeters).toBeDefined();
    const { current, comparison } = result.comparison!.busyRoadMeters!;
    // ~222 m vs ~2220 m.
    expect(current).toBeGreaterThan(150);
    expect(current).toBeLessThan(350);
    expect(comparison).toBeGreaterThan(2000);
    // The whole point: the fast route spends far more on busy roads.
    expect(comparison).toBeGreaterThan(current);
  });

  it('counts metres, not segments — so the safe route is not penalised for being chopped finer', async () => {
    setupRiskMock(
      // Safe route: ten SHORT busy segments (many segments, little distance).
      Array.from({ length: 10 }, (_, i) => riskSegment('High risk', 0.0002, i)),
      // Fast route: one LONG busy segment (few segments, lots of distance).
      [riskSegment('High risk', 0.02, 0)],
    );

    const result = await directPreviewRoute(request);
    const { current, comparison } = result.comparison!.busyRoadMeters!;

    // By segment COUNT the safe route looks ten times worse. By metres — the
    // thing that matters to a rider — it is an order of magnitude better.
    expect(current).toBeLessThan(comparison / 5);
  });

  it('still reports exposure when neither route touches a busy road', async () => {
    setupRiskMock([riskSegment('Typical', 0.01, 0)], [riskSegment('Safer', 0.01, 0)]);

    const result = await directPreviewRoute(request);

    expect(result.comparison?.busyRoadMeters).toEqual({ current: 0, comparison: 0 });
  });

  it('omits the field entirely when there is no comparison to make', async () => {
    setupRiskMock([], []);

    const result = await directPreviewRoute({ ...request, showRouteComparison: false });

    expect(result.comparison).toBeUndefined();
  });
});
