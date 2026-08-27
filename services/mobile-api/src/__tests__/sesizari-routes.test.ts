// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { buildApp } from '../app';
import { createMemoryRouteResponseCache } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import type { RateLimiter, RateLimitPolicies } from '../lib/rateLimit';
import { isSesizariEnabled } from '../lib/sesizariKillSwitch';
import { SesizareDuplicateError } from '../lib/submissions';

const AUTH_TOKEN = 'test-bypass-token';
const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };

/** Anonymous Supabase session: an id, but no email. */
const ANON_USER = { id: 'anon-rider-001', email: null };
const FULL_USER = { id: 'full-rider-001', email: 'rider@example.com' };

const allowRateLimiter: RateLimiter = {
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

const denyRateLimiter: RateLimiter = {
  backend: 'memory',
  consume: vi.fn().mockResolvedValue({
    allowed: false,
    limit: 20,
    remaining: 0,
    resetAt: Date.now() + 60_000,
    retryAfterMs: 60_000,
  }),
  clear: vi.fn(),
};

const rateLimitPolicies: RateLimitPolicies = {
  routePreview: { limit: 100, windowMs: 60_000 },
  routeReroute: { limit: 100, windowMs: 60_000 },
  write: { limit: 100, windowMs: 60_000 },
  hazardVote: { limit: 100, windowMs: 600_000 },
  leaderboard: { limit: 100, windowMs: 60_000 },
  report: { limit: 100, windowMs: 60_000 },
  block: { limit: 100, windowMs: 60_000 },
  comment: { limit: 100, windowMs: 60_000 },
  citySuggestion: { limit: 100, windowMs: 3_600_000 },
  follow: { limit: 100, windowMs: 600_000 },
  countryWaitlist: { limit: 100, windowMs: 3_600_000 },
};

const okSesizare = {
  id: 'sesizare-1',
  createdAt: '2026-08-27T09:14:00.000Z',
  hazardSesizareCount: 2,
  awardedBadges: [
    { badge_key: 'sesizare_1', name: 'Vocea Străzii', tier: 1, tier_family: 'civic_sesizari' },
  ],
};

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) =>
  buildApp({
    dependencies: {
      authenticateUser: vi.fn().mockResolvedValue(ANON_USER),
      buildCoverageResponse: vi.fn().mockReturnValue({
        regions: [],
        matched: { countryCode: 'RO', status: 'supported', safeRouting: true, fastRouting: true },
        generatedAt: new Date().toISOString(),
      }),
      resolveCoverage: vi.fn().mockReturnValue({
        countryCode: 'RO',
        status: 'supported' as const,
        safeRouting: true,
        fastRouting: true,
      }),
      fetchSafeRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      fetchFastRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      forwardGeocode: vi.fn().mockResolvedValue([]),
      reverseGeocode: vi.fn().mockResolvedValue({ coordinate: { lat: 0, lon: 0 }, label: null }),
      getElevationProfile: vi.fn().mockResolvedValue([]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 0, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      normalizeRoutePreviewResponse: vi.fn().mockReturnValue({
        routes: [],
        selectedMode: 'safe' as const,
        coverage: { countryCode: 'RO', status: 'supported', safeRouting: true, fastRouting: true },
        generatedAt: new Date().toISOString(),
      }),
      submitHazardReport: vi.fn().mockResolvedValue({ reportId: 'h1', acceptedAt: '' }),
      startTripRecord: vi.fn().mockResolvedValue({ clientTripId: 'c1', tripId: 't1', acceptedAt: '' }),
      finishTripRecord: vi.fn().mockResolvedValue({ clientTripId: 'c1', tripId: 't1', acceptedAt: '' }),
      saveTripTrack: vi.fn().mockResolvedValue({ acceptedAt: '' }),
      getTripHistory: vi.fn().mockResolvedValue([]),
      submitNavigationFeedback: vi.fn().mockResolvedValue({ acceptedAt: '' }),
      submitSesizare: vi.fn().mockResolvedValue(okSesizare),
      routeResponseCache: createMemoryRouteResponseCache(),
      rateLimiter: allowRateLimiter,
      rateLimitPolicies,
      routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
      sharedStoreBackend: 'memory',
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });

const validPayload = {
  hazardId: '11111111-2222-3333-4444-555555555555',
  hazardType: 'pothole',
  coordinate: { lat: 44.4612, lon: 26.1109 },
  address: 'strada Fabrica de Glucoză nr. 5, Sector 2, București',
};

describe('sesizari kill switch', () => {
  const original = process.env.SESIZARI_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SESIZARI_ENABLED;
    else process.env.SESIZARI_ENABLED = original;
  });

  it('defaults to enabled when the env var is unset', () => {
    delete process.env.SESIZARI_ENABLED;
    expect(isSesizariEnabled()).toBe(true);
  });

  it('treats only explicit false/0/off as disabled', () => {
    for (const raw of ['false', 'FALSE', ' 0 ', 'off']) {
      process.env.SESIZARI_ENABLED = raw;
      expect(isSesizariEnabled()).toBe(false);
    }
    for (const raw of ['true', '1', 'yes', 'typo']) {
      process.env.SESIZARI_ENABLED = raw;
      expect(isSesizariEnabled()).toBe(true);
    }
  });
});

describe('POST /v1/sesizari', () => {
  const original = process.env.SESIZARI_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SESIZARI_ENABLED;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SESIZARI_ENABLED;
    else process.env.SESIZARI_ENABLED = original;
  });

  it('rejects an unauthenticated caller', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('ACCEPTS an anonymous session — Civia collects the legal identity itself', async () => {
    const submitSesizare = vi.fn().mockResolvedValue(okSesizare);
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(ANON_USER),
      submitSesizare,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(200);
    expect(submitSesizare).toHaveBeenCalledWith(expect.anything(), ANON_USER.id);
    await app.close();
  });

  it('accepts a full account too', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(FULL_USER) });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  // Fastify silently strips undeclared response fields (gotcha #9). If this
  // breaks, the client sees no badge celebration and no escalation count and
  // there is nothing in the logs to explain it.
  it('round-trips every response field through the JSON Schema', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    const body = response.json();
    expect(body.id).toBe('sesizare-1');
    expect(body.createdAt).toBe('2026-08-27T09:14:00.000Z');
    expect(body.hazardSesizareCount).toBe(2);
    expect(body.awardedBadges).toHaveLength(1);
    expect(body.awardedBadges[0].badge_key).toBe('sesizare_1');
    await app.close();
  });

  it('works without a hazardId — the hazard may still be in the offline queue', async () => {
    const submitSesizare = vi.fn().mockResolvedValue({ ...okSesizare, hazardSesizareCount: 1 });
    const app = buildTestApp({ submitSesizare });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: {
        hazardType: 'blocked_bike_lane',
        coordinate: { lat: 44.4612, lon: 26.1109 },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().hazardSesizareCount).toBe(1);
    await app.close();
  });

  it('rejects hazard types no Romanian authority can act on', async () => {
    const app = buildTestApp();
    for (const hazardType of ['aggressive_traffic', 'narrow_street', 'other']) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sesizari',
        headers: authHeaders,
        payload: { ...validPayload, hazardType },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it('answers 409, not 502, when the rider already escalated this hazard', async () => {
    const app = buildTestApp({
      submitSesizare: vi.fn().mockRejectedValue(new SesizareDuplicateError()),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('CONFLICT');
    await app.close();
  });

  it('answers 403 FEATURE_DISABLED when the kill switch is off', async () => {
    process.env.SESIZARI_ENABLED = 'false';
    const submitSesizare = vi.fn().mockResolvedValue(okSesizare);
    const app = buildTestApp({ submitSesizare });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FEATURE_DISABLED');
    expect(submitSesizare).not.toHaveBeenCalled();
    await app.close();
  });

  it('honours the generic write rate limit', async () => {
    const app = buildTestApp({ rateLimiter: denyRateLimiter });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });

  it('surfaces an upstream failure as 502', async () => {
    const app = buildTestApp({
      submitSesizare: vi.fn().mockRejectedValue(new Error('insert exploded')),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sesizari',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(502);
    await app.close();
  });
});
