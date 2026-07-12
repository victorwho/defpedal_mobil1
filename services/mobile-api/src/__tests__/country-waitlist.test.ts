// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase chain mock (same queue pattern as routes-feed.test.ts) — used by
// the submitCountryWaitlist unit tests at the bottom of this file.
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted above module init, so anything the factory
// dereferences at factory-eval time must be created via vi.hoisted.
const { supabaseResultQueue, upsertSpy } = vi.hoisted(() => ({
  supabaseResultQueue: [] as Array<{ data: unknown; error: null | { message: string } }>,
  upsertSpy: vi.fn(),
}));

const enqueueResult = (result: { data: unknown; error: null | { message: string } }) => {
  supabaseResultQueue.push(result);
};

const dequeueResult = () => supabaseResultQueue.shift() ?? { data: null, error: null };

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'gt', 'order', 'limit'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.upsert = upsertSpy.mockReturnValue(chain);
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.rpc = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    (chain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (v: unknown) => unknown,
    ) => Promise.resolve(dequeueResult()).then(resolve, reject);
    return chain;
  };

  return {
    supabaseAdmin: makeChain(),
  };
});

import { buildApp } from '../app';
import { createMemoryRouteResponseCache } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import type { RateLimiter, RateLimitPolicies } from '../lib/rateLimit';
import { submitCountryWaitlist } from '../lib/submissions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-bypass-token';
const ANON_USER_ID = 'anon-user-gate-001';

const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };

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
    limit: 3,
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

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) =>
  buildApp({
    dependencies: {
      // Anonymous Supabase session: id but no email. The waitlist audience is
      // pre-signup, so the endpoint must accept these.
      authenticateUser: vi.fn().mockResolvedValue({ id: ANON_USER_ID, email: null }),
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
      submitCountryWaitlist: vi.fn().mockResolvedValue({ status: 'joined' }),
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
  email: 'Rider@Example.COM',
  countryCode: 'us',
  detectedCountryCode: 'US',
  locale: 'en',
  source: 'onboarding' as const,
};

// ---------------------------------------------------------------------------
// POST /v1/country-waitlist
// ---------------------------------------------------------------------------

describe('POST /v1/country-waitlist', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when the caller is not authenticated', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('accepts an anonymous session and normalizes email + country code', async () => {
    const submit = vi.fn().mockResolvedValue({ status: 'joined' });
    const app = buildTestApp({ submitCountryWaitlist: submit });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'joined' });
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'rider@example.com',
        countryCode: 'US',
        detectedCountryCode: 'US',
        locale: 'en',
        source: 'onboarding',
      }),
      ANON_USER_ID,
    );
    await app.close();
  });

  it('accepts a null detectedCountryCode (GPS detection failed, picker-only path)', async () => {
    const submit = vi.fn().mockResolvedValue({ status: 'joined' });
    const app = buildTestApp({ submitCountryWaitlist: submit });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: { ...validPayload, detectedCountryCode: null },
    });

    expect(response.statusCode).toBe(200);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ detectedCountryCode: null }),
      ANON_USER_ID,
    );
    await app.close();
  });

  it('rejects a malformed email with 400', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: { ...validPayload, email: 'not-an-email' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rejects a non-alpha-2 country code with 400', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: { ...validPayload, countryCode: 'USA' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 429 when the countryWaitlist rate-limit bucket denies', async () => {
    const app = buildTestApp({ rateLimiter: denyRateLimiter });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/country-waitlist',
      headers: authHeaders,
      payload: validPayload,
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// submitCountryWaitlist (Supabase write)
// ---------------------------------------------------------------------------

describe('submitCountryWaitlist', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('upserts with ignoreDuplicates so a repeat signup still reports joined', async () => {
    enqueueResult({ data: null, error: null });

    const result = await submitCountryWaitlist(
      {
        email: 'rider@example.com',
        countryCode: 'US',
        detectedCountryCode: null,
        locale: 'en',
        source: 'onboarding',
      },
      ANON_USER_ID,
    );

    expect(result).toEqual({ status: 'joined' });
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'rider@example.com',
        country_code: 'US',
        user_id: ANON_USER_ID,
      }),
      expect.objectContaining({
        onConflict: 'email,country_code',
        ignoreDuplicates: true,
      }),
    );
  });

  it('throws when the insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'permission denied' } });

    await expect(
      submitCountryWaitlist(
        {
          email: 'rider@example.com',
          countryCode: 'US',
          detectedCountryCode: null,
          locale: null,
          source: 'onboarding',
        },
        ANON_USER_ID,
      ),
    ).rejects.toThrow('permission denied');
  });
});
