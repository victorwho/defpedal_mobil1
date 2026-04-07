// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildApp } from '../app';
import {
  createMemoryRouteResponseCache,
  type RouteResponseCache,
} from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import { createMemoryRateLimiter, type RateLimiter, type RateLimitPolicies } from '../lib/rateLimit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEV_TOKEN = 'test-bypass-token';
const DEV_USER_ID = 'test-user-001';

const authHeaders = { authorization: `Bearer ${DEV_TOKEN}` };

const noopRateLimiter: RateLimiter = {
  backend: 'memory',
  consume: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 100,
    remaining: 99,
    resetAt: Date.now() + 60_000,
    retryAfterMs: 0,
  }),
  clear: vi.fn(),
};

const generousRateLimitPolicies: RateLimitPolicies = {
  routePreview: { limit: 100, windowMs: 60_000 },
  routeReroute: { limit: 100, windowMs: 60_000 },
  write: { limit: 100, windowMs: 60_000 },
};

const mockCoverage = {
  countryCode: 'RO',
  status: 'supported' as const,
  safeRouting: true,
  fastRouting: true,
};

const mockRouteOption = {
  id: 'route-1',
  source: 'custom_osrm' as const,
  routingEngineVersion: 'safe-osrm-v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'osm-europe-current',
  riskModelVersion: 'risk-model-v1',
  geometryPolyline6: '_abc~def',
  distanceMeters: 1234,
  durationSeconds: 300,
  adjustedDurationSeconds: 320,
  totalClimbMeters: 20,
  steps: [],
  riskSegments: [],
  warnings: [],
};

const mockRoutePreviewResponse = {
  routes: [mockRouteOption],
  selectedMode: 'safe' as const,
  coverage: mockCoverage,
  generatedAt: new Date().toISOString(),
};

/**
 * Creates a fully-wired Fastify app instance with injectable dependency
 * overrides and a dev-auth bypass so tests never touch a real Supabase.
 */
const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) => {
  const authenticateUser = vi.fn().mockResolvedValue({ id: DEV_USER_ID, email: 'dev@test.local' });

  return buildApp({
    dependencies: {
      authenticateUser,
      buildCoverageResponse: vi.fn().mockReturnValue({
        regions: [mockCoverage],
        matched: mockCoverage,
        generatedAt: new Date().toISOString(),
      }),
      resolveCoverage: vi.fn().mockReturnValue(mockCoverage),
      fetchSafeRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      fetchFastRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      forwardGeocode: vi.fn().mockResolvedValue([]),
      reverseGeocode: vi.fn().mockResolvedValue({
        coordinate: { lat: 44.4, lon: 26.1 },
        label: 'Bucharest, Romania',
      }),
      getElevationProfile: vi.fn().mockResolvedValue([10, 12, 15]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 5, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      normalizeRoutePreviewResponse: vi.fn().mockReturnValue(mockRoutePreviewResponse),
      submitHazardReport: vi.fn().mockResolvedValue({
        reportId: 'hazard-test-1',
        acceptedAt: new Date().toISOString(),
      }),
      startTripRecord: vi.fn().mockResolvedValue({
        clientTripId: 'client-trip-1',
        tripId: 'server-trip-1',
        acceptedAt: new Date().toISOString(),
      }),
      finishTripRecord: vi.fn().mockResolvedValue({
        clientTripId: 'client-trip-1',
        tripId: 'server-trip-1',
        acceptedAt: new Date().toISOString(),
      }),
      saveTripTrack: vi.fn().mockResolvedValue({ acceptedAt: new Date().toISOString() }),
      getTripHistory: vi.fn().mockResolvedValue([]),
      submitNavigationFeedback: vi.fn().mockResolvedValue({ acceptedAt: new Date().toISOString() }),
      routeResponseCache: createMemoryRouteResponseCache(),
      rateLimiter: noopRateLimiter,
      rateLimitPolicies: generousRateLimitPolicies,
      routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
      sharedStoreBackend: 'memory',
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });
};

// ---------------------------------------------------------------------------
// Health endpoint (anonymous)
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('mobile-api');
    expect(body.generatedAt).toBeDefined();

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/coverage
// ---------------------------------------------------------------------------

describe('GET /v1/coverage', () => {
  it('returns 200 with coverage regions for valid lat/lon', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/coverage?lat=44.4&lon=26.1',
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.regions)).toBe(true);
    expect(body.generatedAt).toBeDefined();

    await app.close();
  });

  it('returns 400 when lat/lon are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/v1/coverage' });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when lat is out of range', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/coverage?lat=200&lon=26.1',
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/search/autocomplete
// ---------------------------------------------------------------------------

describe('POST /v1/search/autocomplete', () => {
  it('returns 200 with suggestions array', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/autocomplete',
      payload: { query: 'Bucharest' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().suggestions).toEqual([]);

    await app.close();
  });

  it('returns 400 when query is too short', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/autocomplete',
      payload: { query: 'B' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when body is missing query field', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/autocomplete',
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when forwardGeocode throws', async () => {
    const app = buildTestApp({
      forwardGeocode: vi.fn().mockRejectedValue(new Error('Mapbox unavailable')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/autocomplete',
      payload: { query: 'Bucharest' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/search/reverse-geocode
// ---------------------------------------------------------------------------

describe('POST /v1/search/reverse-geocode', () => {
  it('returns 200 with coordinate and label', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/reverse-geocode',
      payload: { coordinate: { lat: 44.4, lon: 26.1 } },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.coordinate).toBeDefined();
    expect(body.label).toBe('Bucharest, Romania');

    await app.close();
  });

  it('returns 400 when coordinate is missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/reverse-geocode',
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when reverseGeocode throws', async () => {
    const app = buildTestApp({
      reverseGeocode: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/search/reverse-geocode',
      payload: { coordinate: { lat: 44.4, lon: 26.1 } },
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/routes/preview
// ---------------------------------------------------------------------------

describe('POST /v1/routes/preview', () => {
  const validPreviewBody = {
    origin: { lat: 44.4, lon: 26.1 },
    destination: { lat: 44.5, lon: 26.2 },
    mode: 'safe',
  };

  it('returns 200 with route response for valid body', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.routes).toBeDefined();
    expect(body.selectedMode).toBe('safe');
    expect(body.generatedAt).toBeDefined();

    await app.close();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: { mode: 'safe' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when mode is invalid', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: { ...validPreviewBody, mode: 'turbo' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 429 when rate limit is exhausted', async () => {
    const exhaustedLimiter: RateLimiter = {
      backend: 'memory',
      consume: vi.fn().mockResolvedValue({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetAt: Date.now() + 30_000,
        retryAfterMs: 30_000,
      }),
      clear: vi.fn(),
    };

    const app = buildTestApp({ rateLimiter: exhaustedLimiter });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().code).toBe('RATE_LIMITED');

    await app.close();
  });

  it('returns empty routes when coverage does not support selected mode', async () => {
    const unsupportedCoverage = {
      countryCode: 'US',
      status: 'unsupported' as const,
      safeRouting: false,
      fastRouting: false,
    };
    const app = buildTestApp({
      resolveCoverage: vi.fn().mockReturnValue(unsupportedCoverage),
      normalizeRoutePreviewResponse: vi.fn().mockReturnValue({
        routes: [],
        selectedMode: 'safe' as const,
        coverage: unsupportedCoverage,
        generatedAt: new Date().toISOString(),
      }),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().routes).toEqual([]);

    await app.close();
  });

  it('sets x-route-cache MISS header on fresh fetch', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });
    expect(response.headers['x-route-cache']).toBe('MISS');

    await app.close();
  });

  it('serves cached response on repeat request', async () => {
    const cache = createMemoryRouteResponseCache();
    const app = buildTestApp({
      routeResponseCache: cache,
      routeResponseCacheTtlMs: { preview: 60_000, reroute: 15_000 },
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });

    const second = await app.inject({
      method: 'POST',
      url: '/v1/routes/preview',
      payload: validPreviewBody,
    });
    expect(second.headers['x-route-cache']).toBe('HIT');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/trips/start  (requires auth)
// ---------------------------------------------------------------------------

const validTripStartBody = {
  clientTripId: 'client-trip-001',
  sessionId: 'session-001',
  startLocationText: 'Home',
  startCoordinate: { lat: 44.4, lon: 26.1 },
  destinationText: 'Office',
  destinationCoordinate: { lat: 44.5, lon: 26.2 },
  distanceMeters: 5000,
  startedAt: new Date().toISOString(),
};

describe('POST /v1/trips/start', () => {
  it('returns 200 with tripId when authenticated', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/start',
      headers: authHeaders,
      payload: validTripStartBody,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.tripId).toBe('server-trip-1');
    expect(body.clientTripId).toBe('client-trip-1');

    await app.close();
  });

  it('returns 401 when no authorization header is provided', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/start',
      payload: validTripStartBody,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');

    await app.close();
  });

  it('returns 401 when token is invalid', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/start',
      headers: { authorization: 'Bearer bad-token' },
      payload: validTripStartBody,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/start',
      headers: authHeaders,
      payload: { clientTripId: 'x' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when startTripRecord throws', async () => {
    const app = buildTestApp({
      startTripRecord: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/start',
      headers: authHeaders,
      payload: validTripStartBody,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/trips/end
// ---------------------------------------------------------------------------

describe('POST /v1/trips/end', () => {
  const validTripEndBody = {
    clientTripId: 'client-trip-001',
    tripId: 'server-trip-1',
    endedAt: new Date().toISOString(),
    reason: 'completed',
  };

  it('returns 200 with tripId when authenticated', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/end',
      headers: authHeaders,
      payload: validTripEndBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tripId).toBe('server-trip-1');

    await app.close();
  });

  it('returns 401 without token', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/end',
      payload: validTripEndBody,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when reason is invalid enum value', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/end',
      headers: authHeaders,
      payload: { ...validTripEndBody, reason: 'abandoned' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/trips/track
// ---------------------------------------------------------------------------

describe('POST /v1/trips/track', () => {
  const validTrackBody = {
    tripId: 'server-trip-1',
    clientTripId: 'client-trip-001',
    routingMode: 'safe',
    gpsBreadcrumbs: [{ lat: 44.4, lon: 26.1, ts: Date.now(), acc: 5, spd: null, hdg: null }],
    endReason: 'completed',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
  };

  it('returns 200 when authenticated', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/track',
      headers: authHeaders,
      payload: validTrackBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 401 without token', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/track',
      payload: validTrackBody,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 502 when saveTripTrack throws', async () => {
    const app = buildTestApp({
      saveTripTrack: vi.fn().mockRejectedValue(new Error('write error')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/trips/track',
      headers: authHeaders,
      payload: validTrackBody,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/trips/history
// ---------------------------------------------------------------------------

describe('GET /v1/trips/history', () => {
  it('returns 200 with empty array when authenticated', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/trips/history',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);

    await app.close();
  });

  it('returns 401 without token', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/v1/trips/history' });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 502 when getTripHistory throws', async () => {
    const app = buildTestApp({
      getTripHistory: vi.fn().mockRejectedValue(new Error('db error')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/trips/history',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/hazards  (anonymous OK, but auth is optional)
// ---------------------------------------------------------------------------

describe('POST /v1/hazards', () => {
  const validHazardBody = {
    coordinate: { lat: 44.4, lon: 26.1 },
    reportedAt: new Date().toISOString(),
    hazardType: 'pothole',
  };

  it('returns 200 when authenticated', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/hazards',
      headers: authHeaders,
      payload: validHazardBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().reportId).toBeDefined();

    await app.close();
  });

  it('returns 200 when unauthenticated (hazards are anonymous-safe)', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/hazards',
      payload: validHazardBody,
    });
    // The hazard endpoint uses getAuthenticatedUserFromRequest (optional auth)
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('returns 400 when coordinate is missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/hazards',
      headers: authHeaders,
      payload: { reportedAt: new Date().toISOString() },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when hazardType is invalid enum value', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/hazards',
      headers: authHeaders,
      payload: { ...validHazardBody, hazardType: 'giant_spider' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when submitHazardReport throws', async () => {
    const app = buildTestApp({
      submitHazardReport: vi.fn().mockRejectedValue(new Error('supabase error')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/hazards',
      headers: authHeaders,
      payload: validHazardBody,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/feedback
// ---------------------------------------------------------------------------

describe('POST /v1/feedback', () => {
  const validFeedbackBody = {
    sessionId: 'session-001',
    startLocationText: 'Home',
    destinationText: 'Office',
    distanceMeters: 5000,
    durationSeconds: 1200,
    rating: 4,
    feedbackText: 'Great safe route!',
    submittedAt: new Date().toISOString(),
  };

  it('returns 200 when authenticated and body is valid', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders,
      payload: validFeedbackBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 401 without token', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      payload: validFeedbackBody,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when rating is out of range', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders,
      payload: { ...validFeedbackBody, rating: 6 },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when submitNavigationFeedback throws', async () => {
    const app = buildTestApp({
      submitNavigationFeedback: vi.fn().mockRejectedValue(new Error('write failed')),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feedback',
      headers: authHeaders,
      payload: validFeedbackBody,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/elevation-profile
// ---------------------------------------------------------------------------

describe('POST /v1/elevation-profile', () => {
  it('returns 200 with elevation profile, gain, and loss', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/elevation-profile',
      payload: { coordinates: [[26.1, 44.4], [26.2, 44.5]] },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.elevationProfile)).toBe(true);
    expect(typeof body.elevationGain).toBe('number');
    expect(typeof body.elevationLoss).toBe('number');

    await app.close();
  });

  it('returns 400 when coordinates has fewer than 2 points', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/elevation-profile',
      payload: { coordinates: [[26.1, 44.4]] },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when coordinates array is missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/elevation-profile',
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/risk-segments
// ---------------------------------------------------------------------------

describe('POST /v1/risk-segments', () => {
  const validLineString = {
    geometry: {
      type: 'LineString',
      coordinates: [[26.1, 44.4], [26.2, 44.5]],
    },
  };

  it('returns 200 with riskSegments array', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/risk-segments',
      payload: validLineString,
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().riskSegments)).toBe(true);

    await app.close();
  });

  it('returns 400 when geometry type is not LineString', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/risk-segments',
      payload: { geometry: { type: 'Point', coordinates: [[26.1, 44.4]] } },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when geometry is missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/risk-segments',
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Error handler — unhandled server error
// ---------------------------------------------------------------------------

describe('Global error handler', () => {
  it('returns 500 INTERNAL_ERROR for unexpected throws', async () => {
    const app = buildTestApp({
      buildCoverageResponse: vi.fn().mockImplementation(() => {
        throw new Error('Boom!');
      }),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/coverage?lat=44.4&lon=26.1',
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBe('INTERNAL_ERROR');

    await app.close();
  });
});
