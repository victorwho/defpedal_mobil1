// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before any imports that use it because
// vi.mock() is hoisted to the top of the file.
// We control results via a shared queue in the mocked module factory.
// ---------------------------------------------------------------------------

// A module-level queue that tests can push results onto.
const supabaseResultQueue: Array<{ data: unknown; error: null | { message: string } }> = [];

const enqueueResult = (result: { data: unknown; error: null | { message: string } }) => {
  supabaseResultQueue.push(result);
};

const dequeueResult = () =>
  supabaseResultQueue.shift() ?? { data: null, error: null };

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const methods = ['from', 'select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'gt', 'order', 'limit'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // single() and rpc() terminate the chain and return the next queued result
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.rpc = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    // Make the chain itself awaitable so `await db.from(...).insert(...)` works
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

vi.mock('../lib/notifications', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Real imports after mock declarations
// ---------------------------------------------------------------------------

import { buildApp } from '../app';
import { createMemoryRouteResponseCache } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import {
  createMemoryRateLimiter,
  type RateLimiter,
  type RateLimitPolicies,
} from '../lib/rateLimit';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-bypass-token';
const DEV_USER_ID = 'test-user-feed-001';

const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };

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
};

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) =>
  buildApp({
    dependencies: {
      authenticateUser: vi.fn().mockResolvedValue({ id: DEV_USER_ID, email: 'dev@test.local' }),
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
      routeResponseCache: createMemoryRouteResponseCache(),
      rateLimiter: noopRateLimiter,
      rateLimitPolicies: rateLimitPolicies,
      routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
      sharedStoreBackend: 'memory',
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });

// ---------------------------------------------------------------------------
// GET /v1/feed
// ---------------------------------------------------------------------------

describe('GET /v1/feed', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when no authorization header is provided', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed?lat=44.4&lon=26.1',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when lat/lon query params are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 200 with items array on RPC success', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().items)).toBe(true);

    await app.close();
  });

  it('widens through the radius ladder and labels the scope when nearby is sparse', async () => {
    const makeRow = (id: string) => ({
      id,
      user_id: 'user-a',
      title: 'Ride',
      start_location_text: 'A',
      destination_text: 'B',
      distance_meters: 1000,
      duration_seconds: 300,
      elevation_gain_meters: null,
      average_speed_mps: null,
      safety_rating: null,
      safety_tags: [],
      geometry_polyline6: 'abc',
      note: null,
      shared_at: '2026-07-01T08:00:00Z',
      like_count: 0,
      love_count: 0,
      comment_count: 0,
      liked_by_me: false,
      loved_by_me: false,
      profiles: { display_name: 'Alice', avatar_url: null, rider_tier: 'kickstand' },
    });

    // nearby → 1 item (< 3), region → 1 item (< 3), community → 3 items
    enqueueResult({ data: [makeRow('s1')], error: null });
    enqueueResult({ data: [makeRow('s1')], error: null });
    enqueueResult({ data: [makeRow('s1'), makeRow('s2'), makeRow('s3')], error: null });
    // champion lookup (leaderboard_snapshots): empty
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.scopeUsed).toBe('community');
    expect(body.items).toHaveLength(3);

    await app.close();
  });

  it('respects an explicit scope from cursored pages (no re-laddering)', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed?lat=44.4&lon=26.1&scope=region',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().scopeUsed).toBe('region');

    await app.close();
  });

  it('returns 502 when Supabase RPC returns an error', async () => {
    enqueueResult({ data: null, error: { message: 'RPC failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/community/heartbeat — pulse ladder
// ---------------------------------------------------------------------------

describe('GET /v1/community/heartbeat', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  const pulseStats = { rides: 5, distanceMeters: 12000, co2SavedKg: 1.44, communitySeconds: 54, activeRiders: 2 };
  const zeroStats = { rides: 0, distanceMeters: 0, co2SavedKg: 0, communitySeconds: 0, activeRiders: 0 };
  const lifetimeTotals = { rides: 325, distanceMeters: 900000, durationSeconds: 200000, co2SavedKg: 108, communitySeconds: 4050, uniqueRiders: 50 };

  const heartbeatRpcResult = {
    today: zeroStats,
    pulse: pulseStats,
    daily: [],
    chartDaily: [],
    chartWeekly: [
      { weekStart: '2026-06-22', rides: 0, distanceMeters: 0, co2SavedKg: 0, communitySeconds: 0 },
      { weekStart: '2026-06-29', rides: 2, distanceMeters: 5000, co2SavedKg: 0.6, communitySeconds: 23 },
      { weekStart: '2026-07-06', rides: 1, distanceMeters: 3000, co2SavedKg: 0.36, communitySeconds: 14 },
      { weekStart: '2026-07-13', rides: 2, distanceMeters: 4000, co2SavedKg: 0.48, communitySeconds: 18 },
    ],
    totals: { rides: 0, distanceMeters: 0, durationSeconds: 0, co2SavedKg: 0, communitySeconds: 0, uniqueRiders: 0 },
    communityTotals: lifetimeTotals,
    hazardHotspots: [],
    topContributors: [],
  };

  it('resolves the ladder rung, labels it, and forwards pulse + lifetime totals', async () => {
    // Counts: nothing nearby/region in any window; month-community has 5.
    enqueueResult({
      data: {
        today: { nearby: 0, region: 0, community: 0 },
        week: { nearby: 0, region: 0, community: 2 },
        month: { nearby: 0, region: 0, community: 5 },
      },
      error: null,
    });
    enqueueResult({ data: heartbeatRpcResult, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/heartbeat?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.windowUsed).toBe('month');
    expect(body.scopeUsed).toBe('community');
    // 2 rides in the resolved scope's week < 7 → 4-week chart
    expect(body.chartMode).toBe('weekly');
    expect(body.pulse).toEqual(pulseStats);
    expect(body.communityTotals).toEqual(lifetimeTotals);
    expect(body.chartWeekly).toHaveLength(4);
    // Legacy keys keep their literal today/nearby semantics
    expect(body.today.rides).toBe(0);

    await app.close();
  });

  it('degrades to the legacy today/nearby view when the counts RPC fails', async () => {
    enqueueResult({ data: null, error: { message: 'counts unavailable' } });
    enqueueResult({ data: heartbeatRpcResult, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/heartbeat?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.windowUsed).toBe('today');
    expect(body.scopeUsed).toBe('nearby');
    expect(body.chartMode).toBe('daily');

    await app.close();
  });

  it('keeps (today, nearby) when today already has enough local rides', async () => {
    enqueueResult({
      data: {
        today: { nearby: 4, region: 6, community: 8 },
        week: { nearby: 9, region: 12, community: 15 },
        month: { nearby: 20, region: 30, community: 40 },
      },
      error: null,
    });
    enqueueResult({ data: heartbeatRpcResult, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/heartbeat?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.windowUsed).toBe('today');
    expect(body.scopeUsed).toBe('nearby');
    // 9 rides this week ≥ 7 → daily chart
    expect(body.chartMode).toBe('daily');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/feed/share
// ---------------------------------------------------------------------------

describe('POST /v1/feed/share', () => {
  const validShareBody = {
    startLocationText: 'Home',
    destinationText: 'Office',
    distanceMeters: 5000,
    durationSeconds: 1200,
    geometryPolyline6: '_encoded_polyline_',
    startCoordinate: { lat: 44.4, lon: 26.1 },
  };

  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/share',
      payload: validShareBody,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with id and sharedAt on success', async () => {
    enqueueResult({
      data: { id: 'share-abc-123', shared_at: new Date().toISOString() },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/share',
      headers: authHeaders,
      payload: validShareBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe('share-abc-123');

    await app.close();
  });

  it('returns 400 when required fields are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/share',
      headers: authHeaders,
      payload: { startLocationText: 'Home' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when Supabase insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'unique constraint violated' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/share',
      headers: authHeaders,
      payload: validShareBody,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });

  it('auto-generates title from destinationText when title is absent', async () => {
    enqueueResult({
      data: { id: 'share-xyz', shared_at: new Date().toISOString() },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/share',
      headers: authHeaders,
      payload: { ...validShareBody, destinationText: 'City Centre' },
    });
    expect(response.statusCode).toBe(200);
    // title not sent — handler generates "Commute to City Centre"
    expect(response.json().id).toBe('share-xyz');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/feed/:id/like  and  DELETE /v1/feed/:id/like
// ---------------------------------------------------------------------------

describe('POST /v1/feed/:id/like', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/like',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt on success', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/like',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 502 when upsert fails', async () => {
    enqueueResult({ data: null, error: { message: 'DB error' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/like',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

describe('DELETE /v1/feed/:id/like', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/like',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt on success', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/like',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/feed/:id/love  and  DELETE /v1/feed/:id/love
// ---------------------------------------------------------------------------

describe('POST /v1/feed/:id/love', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/love',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt when authenticated', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/love',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 502 when upsert fails', async () => {
    enqueueResult({ data: null, error: { message: 'constraint violation' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/love',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

describe('DELETE /v1/feed/:id/love', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/love',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 on success', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/love',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/feed/:id/comments
// ---------------------------------------------------------------------------

describe('GET /v1/feed/:id/comments', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with comments array on success', async () => {
    // Query 1: fetch comments from feed_comments
    enqueueResult({
      data: [
        {
          id: 'comment-1',
          user_id: 'user-abc',
          body: 'Nice ride!',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    // Query 2: batch-fetch profiles for commenter user IDs
    enqueueResult({
      data: [
        { id: 'user-abc', display_name: 'Alice', username: null, avatar_url: null },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.comments[0].body).toBe('Nice ride!');
    expect(body.comments[0].user.displayName).toBe('Alice');

    await app.close();
  });

  it('returns 200 with empty comments array when there are none', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().comments).toEqual([]);

    await app.close();
  });

  it('returns 502 when Supabase query fails', async () => {
    enqueueResult({ data: null, error: { message: 'query failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });

  it('falls back displayName to "Rider" when profile not found', async () => {
    // Query 1: fetch comments
    enqueueResult({
      data: [
        {
          id: 'comment-2',
          user_id: 'user-xyz',
          body: 'Cheers!',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    // Query 2: profiles query returns empty (no profile for this user)
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
    });
    expect(response.json().comments[0].user.displayName).toBe('Rider');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/feed/:id/comments
// ---------------------------------------------------------------------------

describe('POST /v1/feed/:id/comments', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      payload: { body: 'Hello' },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 when authenticated and body is valid', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
      payload: { body: 'Great route!' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 400 when body is empty string', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
      payload: { body: '' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 400 when body field is missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
      payload: {},
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when Supabase insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'FK violation' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/feed/00000000-0000-4000-8000-000000000001/comments',
      headers: authHeaders,
      payload: { body: 'Nice ride' },
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/profile
// ---------------------------------------------------------------------------

describe('PATCH /v1/profile', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      payload: { displayName: 'Alice' },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with updated profile on success', async () => {
    // upsert result (awaitable chain)
    enqueueResult({ data: null, error: null });
    // select .single() result
    enqueueResult({
      data: {
        id: DEV_USER_ID,
        display_name: 'Alice',
        avatar_url: null,
        auto_share_rides: false,
        trim_route_endpoints: false,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: authHeaders,
      payload: { displayName: 'Alice' },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.displayName).toBe('Alice');
    expect(body.autoShareRides).toBe(false);

    await app.close();
  });

  it('returns 502 when profile read fails after update', async () => {
    // upsert succeeds
    enqueueResult({ data: null, error: null });
    // select fails
    enqueueResult({ data: null, error: { message: 'read error' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: authHeaders,
      payload: { displayName: 'Bob' },
    });
    expect(response.statusCode).toBe(502);

    await app.close();
  });

  it('accepts notification preference fields', async () => {
    // upsert result
    enqueueResult({ data: null, error: null });
    // select .single() result
    enqueueResult({
      data: {
        id: DEV_USER_ID,
        display_name: 'Alice',
        username: 'alice',
        avatar_url: null,
        auto_share_rides: false,
        trim_route_endpoints: false,
        cycling_goal: null,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: authHeaders,
      payload: {
        notifyWeather: false,
        notifyHazard: true,
        notifyCommunity: false,
        quietHoursStart: '23:00',
        quietHoursEnd: '08:00',
        quietHoursTimezone: 'Europe/Bucharest',
      },
    });
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it('rejects invalid quiet hours format', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: authHeaders,
      payload: {
        quietHoursStart: '9pm',
      },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/profile
// ---------------------------------------------------------------------------

describe('GET /v1/profile', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with profile when found', async () => {
    enqueueResult({
      data: {
        id: DEV_USER_ID,
        display_name: 'Test Rider',
        avatar_url: 'https://example.com/avatar.jpg',
        auto_share_rides: true,
        trim_route_endpoints: false,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.displayName).toBe('Test Rider');
    expect(body.autoShareRides).toBe(true);
    expect(body.avatarUrl).toBe('https://example.com/avatar.jpg');

    await app.close();
  });

  it('auto-creates profile and returns 200 when profile is not found', async () => {
    // First select returns not found
    enqueueResult({ data: null, error: { message: 'no rows' } });
    // Upsert + select returns new profile
    enqueueResult({
      data: {
        id: DEV_USER_ID,
        display_name: 'dev',
        avatar_url: null,
        auto_share_rides: false,
        trim_route_endpoints: false,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().displayName).toBeDefined();

    await app.close();
  });
});
