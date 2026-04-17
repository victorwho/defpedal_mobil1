// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before any imports that use it because
// vi.mock() is hoisted to the top of the file.
// ---------------------------------------------------------------------------

const supabaseResultQueue: Array<{ data: unknown; error: null | { message: string; code?: string } }> = [];

const enqueueResult = (result: { data: unknown; error: null | { message: string; code?: string } }) => {
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
  createMemoryRateLimiter,
  type RateLimiter,
  type RateLimitPolicies,
} from '../lib/rateLimit';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_TOKEN = 'test-bypass-token';
const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000002';

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
// POST /v1/users/:id/follow — follow a user
// ---------------------------------------------------------------------------

describe('POST /v1/users/:id/follow', () => {
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
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 400 when trying to follow yourself', async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${DEV_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('BAD_REQUEST');

    await app.close();
  });

  it('returns 200 with status=accepted for a public user', async () => {
    // Query 1: profile lookup (public user)
    enqueueResult({
      data: { id: TARGET_USER_ID, is_private: false, display_name: 'Public User' },
      error: null,
    });
    // Query 2: check existing follow (none)
    enqueueResult({ data: null, error: { message: 'no rows' } });
    // Query 3: insert follow row
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe('accepted');
    expect(body.actionAt).toBeDefined();

    await app.close();
  });

  it('returns 200 with status=pending for a private user', async () => {
    // Query 1: profile lookup (private user)
    enqueueResult({
      data: { id: TARGET_USER_ID, is_private: true, display_name: 'Private User' },
      error: null,
    });
    // Query 2: check existing follow (none)
    enqueueResult({ data: null, error: { message: 'no rows' } });
    // Query 3: insert follow row
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe('pending');
    expect(body.actionAt).toBeDefined();

    await app.close();
  });

  it('returns current status when already following', async () => {
    // Query 1: profile lookup
    enqueueResult({
      data: { id: TARGET_USER_ID, is_private: false, display_name: 'User' },
      error: null,
    });
    // Query 2: existing follow found
    enqueueResult({ data: { status: 'accepted' }, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('accepted');

    await app.close();
  });

  it('returns 404 when target user does not exist', async () => {
    // Query 1: profile lookup fails
    enqueueResult({ data: null, error: { message: 'no rows' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');

    await app.close();
  });

  it('returns 502 when insert fails with non-duplicate error', async () => {
    // Query 1: profile lookup
    enqueueResult({
      data: { id: TARGET_USER_ID, is_private: false, display_name: 'User' },
      error: null,
    });
    // Query 2: no existing follow
    enqueueResult({ data: null, error: { message: 'no rows' } });
    // Query 3: insert fails
    enqueueResult({ data: null, error: { message: 'DB write error' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/users/:id/follow — unfollow
// ---------------------------------------------------------------------------

describe('DELETE /v1/users/:id/follow', () => {
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
      url: `/v1/users/${TARGET_USER_ID}/follow`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with unfollowedAt on success', async () => {
    // delete chain is awaitable
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${TARGET_USER_ID}/follow`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().unfollowedAt).toBeDefined();

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/users/:id/follow/approve — approve pending request
// ---------------------------------------------------------------------------

describe('POST /v1/users/:id/follow/approve', () => {
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
      url: `/v1/users/${TARGET_USER_ID}/follow/approve`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with actionAt when request is approved', async () => {
    // update + select chain returns the approved row
    enqueueResult({ data: { follower_id: TARGET_USER_ID }, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow/approve`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().actionAt).toBeDefined();

    await app.close();
  });

  it('returns 404 when no pending request exists', async () => {
    // update + select returns no row
    enqueueResult({ data: null, error: { message: 'no rows' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow/approve`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/users/:id/follow/decline — decline pending request
// ---------------------------------------------------------------------------

describe('POST /v1/users/:id/follow/decline', () => {
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
      url: `/v1/users/${TARGET_USER_ID}/follow/decline`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with actionAt when request is declined', async () => {
    // delete chain succeeds
    enqueueResult({ data: null, error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow/decline`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().actionAt).toBeDefined();

    await app.close();
  });

  it('returns 502 when decline delete fails', async () => {
    enqueueResult({ data: null, error: { message: 'DB error during decline' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/users/${TARGET_USER_ID}/follow/decline`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/profile/follow-requests — pending incoming requests
// ---------------------------------------------------------------------------

describe('GET /v1/profile/follow-requests', () => {
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
      url: '/v1/profile/follow-requests',
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('returns 200 with requests array on success', async () => {
    enqueueResult({
      data: [
        {
          follower_id: TARGET_USER_ID,
          created_at: new Date().toISOString(),
          profiles: {
            id: TARGET_USER_ID,
            display_name: 'Requester',
            username: 'requester1',
            avatar_url: 'https://example.com/avatar.jpg',
            rider_tier: 'Trailblazer',
          },
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile/follow-requests',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(Array.isArray(body.requests)).toBe(true);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].user.displayName).toBe('@requester1');
    expect(body.requests[0].user.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(body.requests[0].requestedAt).toBeDefined();

    await app.close();
  });

  it('returns 200 with empty requests array when there are none', async () => {
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile/follow-requests',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toEqual([]);

    await app.close();
  });

  it('falls back displayName to "Rider" when profile has no name', async () => {
    enqueueResult({
      data: [
        {
          follower_id: TARGET_USER_ID,
          created_at: new Date().toISOString(),
          profiles: {
            id: TARGET_USER_ID,
            display_name: null,
            username: null,
            avatar_url: null,
            rider_tier: null,
          },
        },
      ],
      error: null,
    });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile/follow-requests',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().requests[0].user.displayName).toBe('Rider');

    await app.close();
  });

  it('returns 502 when Supabase query fails', async () => {
    enqueueResult({ data: null, error: { message: 'query failed' } });

    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/profile/follow-requests',
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('UPSTREAM_ERROR');

    await app.close();
  });
});
