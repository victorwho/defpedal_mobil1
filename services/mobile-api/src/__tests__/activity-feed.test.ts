// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before any imports that use it because
// vi.mock() is hoisted to the top of the file.
// ---------------------------------------------------------------------------

const supabaseResultQueue: Array<{ data: unknown; error: null | { message: string } }> = [];

const enqueueResult = (result: { data: unknown; error: null | { message: string } }) => {
  supabaseResultQueue.push(result);
};

const dequeueResult = () =>
  supabaseResultQueue.shift() ?? { data: null, error: null };

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'from', 'select', 'insert', 'upsert', 'update', 'delete',
      'eq', 'in', 'gt', 'order', 'limit', 'head',
    ];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
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
  type RateLimiter,
  type RateLimitPolicies,
} from '../lib/rateLimit';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-bypass-token';
const DEV_USER_ID = 'test-user-feed-v2-001';
const ACTIVITY_ID = '00000000-0000-4000-8000-000000000010';

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
// GET /v1/v2/feed — ranked activity feed
// ---------------------------------------------------------------------------

describe('GET /v1/v2/feed', () => {
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
      url: '/v1/v2/feed?lat=44.4&lon=26.1',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when lat/lon query params are missing', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/v2/feed',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 200 with items array and null cursor on success', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/v2/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.cursor).toBeNull();

    await app.close();
  });

  it('returns items mapped from RPC data', async () => {
    enqueueResult({
      data: [
        {
          id: 'activity-1',
          user_id: 'user-a',
          display_name: 'Alice',
          username: 'alice',
          avatar_url: null,
          rider_tier: 'Trailblazer',
          type: 'ride',
          payload: { title: 'Morning Commute', distanceMeters: 5000 },
          created_at: '2026-04-17T08:00:00Z',
          like_count: 3,
          love_count: 1,
          comment_count: 0,
          liked_by_me: false,
          loved_by_me: false,
          score: 42.5,
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/v2/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('activity-1');
    expect(body.items[0].user.displayName).toBe('@alice');
    expect(body.items[0].type).toBe('ride');
    expect(body.items[0].likeCount).toBe(3);
    expect(body.items[0].likedByMe).toBe(false);

    await app.close();
  });

  it('returns cursor when result count matches limit', async () => {
    // Create exactly 1 item and pass limit=1 so cursor is populated
    enqueueResult({
      data: [
        {
          id: 'activity-2',
          user_id: 'user-b',
          display_name: 'Bob',
          username: null,
          avatar_url: null,
          rider_tier: null,
          type: 'badge_unlock',
          payload: { badgeKey: 'first_ride' },
          created_at: '2026-04-17T09:00:00Z',
          like_count: 0,
          love_count: 0,
          comment_count: 0,
          liked_by_me: false,
          loved_by_me: false,
          score: 10,
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/v2/feed?lat=44.4&lon=26.1&limit=1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.cursor).not.toBeNull();
    expect(body.cursor).toContain('activity-2');

    await app.close();
  });

  it('returns 502 when RPC fails', async () => {
    enqueueResult({ data: null, error: { message: 'RPC failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/v2/feed?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/v2/feed/:id/react — add reaction
// ---------------------------------------------------------------------------

describe('POST /v1/v2/feed/:id/react', () => {
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/react`,
      payload: { type: 'like' },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt for a like reaction', async () => {
    // upsert succeeds
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react`,
      headers: authHeaders,
      payload: { type: 'like' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 200 with acceptedAt for a love reaction', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react`,
      headers: authHeaders,
      payload: { type: 'love' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 400 for an invalid reaction type', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react`,
      headers: authHeaders,
      payload: { type: 'angry' },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('returns 502 when upsert fails', async () => {
    enqueueResult({ data: null, error: { message: 'DB error' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react`,
      headers: authHeaders,
      payload: { type: 'like' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/v2/feed/:id/react/:type — remove reaction
// ---------------------------------------------------------------------------

describe('DELETE /v1/v2/feed/:id/react/:type', () => {
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/react/like`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt when removing a like', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react/like`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 200 with acceptedAt when removing a love', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react/love`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().acceptedAt).toBeDefined();

    await app.close();
  });

  it('returns 502 when delete fails', async () => {
    enqueueResult({ data: null, error: { message: 'delete failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/v2/feed/${ACTIVITY_ID}/react/like`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/v2/feed/:id/comments — comments on an activity
// ---------------------------------------------------------------------------

describe('GET /v1/v2/feed/:id/comments', () => {
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/comments`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with comments array on success', async () => {
    enqueueResult({
      data: [
        {
          id: 'comment-1',
          body: 'Great ride!',
          created_at: '2026-04-17T10:00:00Z',
          user_id: 'user-c',
          profiles: {
            id: 'user-c',
            display_name: 'Charlie',
            username: 'charlie',
            avatar_url: 'https://example.com/charlie.jpg',
            rider_tier: 'Explorer',
          },
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/v2/feed/${ACTIVITY_ID}/comments`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe('Great ride!');
    expect(body.comments[0].user.displayName).toBe('@charlie');

    await app.close();
  });

  it('returns 200 with empty comments array when there are none', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/v2/feed/${ACTIVITY_ID}/comments`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().comments).toEqual([]);

    await app.close();
  });

  it('falls back displayName to "Rider" when profile is missing', async () => {
    enqueueResult({
      data: [
        {
          id: 'comment-2',
          body: 'Nice!',
          created_at: '2026-04-17T11:00:00Z',
          user_id: 'user-d',
          profiles: null,
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/v2/feed/${ACTIVITY_ID}/comments`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().comments[0].user.displayName).toBe('Rider');

    await app.close();
  });

  it('returns 502 when Supabase query fails', async () => {
    enqueueResult({ data: null, error: { message: 'query failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/v2/feed/${ACTIVITY_ID}/comments`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/v2/feed/:id/comment — add comment
// ---------------------------------------------------------------------------

describe('POST /v1/v2/feed/:id/comment', () => {
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/comment`,
      payload: { body: 'Hello' },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with acceptedAt when comment is valid', async () => {
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/v2/feed/${ACTIVITY_ID}/comment`,
      headers: authHeaders,
      payload: { body: 'Awesome ride!' },
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/comment`,
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/comment`,
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
      url: `/v1/v2/feed/${ACTIVITY_ID}/comment`,
      headers: authHeaders,
      payload: { body: 'Test comment' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});
