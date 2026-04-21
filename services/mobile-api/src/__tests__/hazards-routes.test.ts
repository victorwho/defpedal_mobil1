// @vitest-environment node
/**
 * Integration tests for the Improved Hazard System routes:
 *   POST /v1/hazards/:hazardId/vote   (requireFullUser, up/down → confirm/deny)
 *   POST /v1/hazards/expire           (cron Bearer auth, purge + delete)
 *   GET  /v1/hazards/nearby           (shared schema, score/userVote fields)
 *
 * Covers plan §7.2. Trigger-level behavior (halving, flip deltas, resurrection
 * guard) lives in the DB migration and is not reached here because supabase
 * is mocked — those are exercised by the migration review + future pgTAP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const supabaseResultQueue: Array<{ data: unknown; error: null | { message: string } }> = [];
const enqueueResult = (r: { data: unknown; error: null | { message: string } }) => {
  supabaseResultQueue.push(r);
};
const dequeueResult = () =>
  supabaseResultQueue.shift() ?? { data: null, error: null };

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of [
      'from', 'select', 'insert', 'upsert', 'update', 'delete',
      'eq', 'in', 'gt', 'gte', 'lt', 'lte', 'or', 'is', 'order', 'limit', 'head',
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.rpc = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    // thenable — the non-.single terminal awaits land here
    (chain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (v: unknown) => unknown,
    ) => Promise.resolve(dequeueResult()).then(resolve, reject);
    return chain;
  };
  return { supabaseAdmin: makeChain() };
});

vi.mock('../lib/streaks', () => ({
  qualifyStreakAsync: vi.fn(),
  getTimezone: vi.fn().mockReturnValue('Europe/Bucharest'),
}));

import { buildApp } from '../app';
import { createMemoryRouteResponseCache } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import { createMemoryRateLimiter, type RateLimiter, type RateLimitPolicies } from '../lib/rateLimit';
import { qualifyStreakAsync } from '../lib/streaks';

const CRON_SECRET = 'test-cron-secret-xyz';
process.env.CRON_SECRET = CRON_SECRET;

const AUTH_TOKEN = 'test-bypass-token';
const FULL_USER_ID = 'full-user-001';
const ANON_USER_ID = 'anon-user-001';
const HAZARD_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_HAZARD_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };
const cronHeaders = { authorization: `Bearer ${CRON_SECRET}` };

const noopRateLimiter: RateLimiter = {
  backend: 'memory',
  consume: vi.fn().mockResolvedValue({
    allowed: true, limit: 100, remaining: 99, resetAt: Date.now() + 60_000, retryAfterMs: 0,
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
      authenticateUser: vi.fn().mockResolvedValue({ id: FULL_USER_ID, email: 'rider@test.local' }),
      buildCoverageResponse: vi.fn().mockReturnValue({
        regions: [], matched: { countryCode: 'RO', status: 'supported', safeRouting: true, fastRouting: true },
        generatedAt: new Date().toISOString(),
      }),
      resolveCoverage: vi.fn().mockReturnValue({
        countryCode: 'RO', status: 'supported' as const, safeRouting: true, fastRouting: true,
      }),
      fetchSafeRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      fetchFastRoutes: vi.fn().mockResolvedValue({ routes: [] }),
      forwardGeocode: vi.fn().mockResolvedValue([]),
      reverseGeocode: vi.fn().mockResolvedValue({ coordinate: { lat: 0, lon: 0 }, label: null }),
      getElevationProfile: vi.fn().mockResolvedValue([]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 0, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      normalizeRoutePreviewResponse: vi.fn().mockReturnValue({
        routes: [], selectedMode: 'safe' as const,
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
      rateLimitPolicies,
      routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
      sharedStoreBackend: 'memory',
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });

// ─── POST /v1/hazards/:id/vote ──────────────────────────────────────────────

describe('POST /v1/hazards/:hazardId/vote', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });
  afterEach(() => {
    supabaseResultQueue.length = 0;
  });

  it('returns 401 when no authorization header is provided', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when the authenticated user is anonymous (no email)', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue({ id: ANON_USER_ID, email: null }),
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 when direction is not "up" or "down"', async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'sideways' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when hazardId is not a UUID', async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/not-a-uuid/vote',
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 200 with the full HazardVoteResponse shape on upvote', async () => {
    // Upsert (thenable terminal) — no error.
    enqueueResult({ data: null, error: null });
    // Post-upsert SELECT .single() — returns the mutated hazard row.
    enqueueResult({
      data: {
        id: HAZARD_ID,
        confirm_count: 3,
        deny_count: 1,
        score: 2,
        expires_at: '2026-05-01T00:00:00.000Z',
        last_confirmed_at: '2026-04-21T10:00:00.000Z',
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      hazardId: HAZARD_ID,
      score: 2,
      confirmCount: 3,
      denyCount: 1,
      userVote: 'up',
      expiresAt: '2026-05-01T00:00:00.000Z',
      lastConfirmedAt: '2026-04-21T10:00:00.000Z',
    });
    await app.close();
  });

  it('maps downvote wire value back to userVote="down" in the response', async () => {
    enqueueResult({ data: null, error: null });
    enqueueResult({
      data: {
        id: HAZARD_ID,
        confirm_count: 0,
        deny_count: 1,
        score: -1,
        expires_at: '2026-04-22T00:00:00.000Z',
        last_confirmed_at: null,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'down' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userVote).toBe('down');
    expect(body.lastConfirmedAt).toBeNull();
    await app.close();
  });

  it('returns 404 when the post-upsert select returns no row', async () => {
    enqueueResult({ data: null, error: null });
    enqueueResult({ data: null, error: { message: 'Row not found' } });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('fires the hazard_validate streak qualifier on success', async () => {
    enqueueResult({ data: null, error: null });
    enqueueResult({
      data: {
        id: HAZARD_ID, confirm_count: 1, deny_count: 0, score: 1,
        expires_at: '2026-05-01T00:00:00.000Z', last_confirmed_at: null,
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(200);
    expect(qualifyStreakAsync).toHaveBeenCalledWith(
      FULL_USER_ID, 'hazard_validate', expect.any(String), expect.anything(),
    );
    await app.close();
  });

  it('response schema strips undeclared handler fields (error-log #22)', async () => {
    // Sanity: even if supabase returned extras, the schema would cut them.
    enqueueResult({ data: null, error: null });
    enqueueResult({
      data: {
        id: HAZARD_ID, confirm_count: 0, deny_count: 0, score: 0,
        expires_at: '2026-05-01T00:00:00.000Z', last_confirmed_at: null,
        hazard_type: 'pothole', // NOT in response schema — must be stripped
        location: { latitude: 44.4, longitude: 26.1 },
      },
      error: null,
    });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).not.toHaveProperty('hazard_type');
    expect(body).not.toHaveProperty('hazardType');
    expect(body).not.toHaveProperty('location');
    await app.close();
  });

  it('enforces the hazardVote rate limit (5 per 10 minutes per user)', async () => {
    // Default fixture uses a no-op limiter. Swap in a real memory-backed one
    // and a tight policy so we can exercise the limit without firing 101 reqs.
    const tightPolicies: RateLimitPolicies = {
      ...rateLimitPolicies,
      hazardVote: { limit: 5, windowMs: 600_000 },
    };
    const app = buildTestApp({
      rateLimitPolicies: tightPolicies,
      rateLimiter: createMemoryRateLimiter(),
    });
    await app.ready();

    // Each vote dequeues 3 entries: upsert, select, fire-and-forget award_xp.
    // Enqueue one vote's results at a time so the pending award_xp from the
    // previous iteration doesn't race ahead and consume the next upsert slot.
    for (let i = 0; i < 5; i += 1) {
      enqueueResult({ data: null, error: null }); // upsert
      enqueueResult({
        data: {
          id: HAZARD_ID, confirm_count: i + 1, deny_count: 0, score: i + 1,
          expires_at: '2026-05-01T00:00:00.000Z', last_confirmed_at: null,
        },
        error: null,
      }); // select
      enqueueResult({ data: null, error: null }); // award_xp rpc

      const ok = await app.inject({
        method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
        headers: authHeaders, payload: { direction: 'up' },
      });
      expect(ok.statusCode).toBe(200);
      // Let any pending fire-and-forget promises drain before next iteration.
      await new Promise((resolve) => setImmediate(resolve));
    }

    const blocked = await app.inject({
      method: 'POST', url: `/v1/hazards/${HAZARD_ID}/vote`,
      headers: authHeaders, payload: { direction: 'up' },
    });
    expect(blocked.statusCode).toBe(429);
    const body = blocked.json();
    expect(body.code).toBe('RATE_LIMITED');

    await app.close();
  });
});

// ─── POST /v1/hazards/expire ────────────────────────────────────────────────

describe('POST /v1/hazards/expire', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });
  afterEach(() => {
    supabaseResultQueue.length = 0;
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/v1/hazards/expire' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when the Bearer token does not match CRON_SECRET', async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/expire',
      headers: { authorization: 'Bearer definitely-wrong' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 500 when CRON_SECRET is unset on the server', async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/expire', headers: cronHeaders,
    });
    expect(res.statusCode).toBe(500);
    await app.close();

    process.env.CRON_SECRET = previous;
  });

  it('returns 200 with deletedCount + purgedCount + runAt on success', async () => {
    // Purge branch A (score<=-3, last_confirmed_at IS NULL).
    enqueueResult({ data: [{ id: 'p1' }], error: null });
    // Purge branch B (score<=-3, last_confirmed_at < dwellCutoff).
    enqueueResult({ data: [{ id: 'p2' }], error: null });
    // Grace DELETE (expires_at < now-7d).
    enqueueResult({ data: [{ id: 'd1' }], error: null });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/expire', headers: cronHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.purgedCount).toBe(2);
    expect(body.deletedCount).toBe(1);
    expect(typeof body.runAt).toBe('string');
    expect(new Date(body.runAt).toISOString()).toBe(body.runAt);
    await app.close();
  });

  it('returns zero counts when there is nothing to delete', async () => {
    enqueueResult({ data: [], error: null });
    enqueueResult({ data: [], error: null });
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/expire', headers: cronHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.purgedCount).toBe(0);
    expect(body.deletedCount).toBe(0);
    await app.close();
  });

  it('returns 502 when the purge DELETE fails', async () => {
    enqueueResult({ data: null, error: { message: 'connection refused' } });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/v1/hazards/expire', headers: cronHeaders,
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });
});

// ─── GET /v1/hazards/nearby ─────────────────────────────────────────────────

describe('GET /v1/hazards/nearby', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });
  afterEach(() => {
    supabaseResultQueue.length = 0;
  });

  const hazardRow = (overrides: Record<string, unknown> = {}) => ({
    id: HAZARD_ID,
    location: { latitude: 44.4, longitude: 26.1 },
    hazard_type: 'pothole',
    created_at: '2026-04-20T10:00:00.000Z',
    confirm_count: 2,
    deny_count: 0,
    score: 2,
    expires_at: '2026-05-01T00:00:00.000Z',
    last_confirmed_at: '2026-04-20T12:00:00.000Z',
    ...overrides,
  });

  it('returns 400 when lat/lon are not numeric', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=abc&lon=xyz',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 200 with full hazard shape including score/expiresAt/lastConfirmedAt', async () => {
    // Unauthenticated caller → only one supabase read (the main select).
    enqueueResult({ data: [hazardRow()], error: null });

    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1&radiusMeters=2000',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hazards).toHaveLength(1);
    const h = body.hazards[0];
    expect(h).toEqual({
      id: HAZARD_ID,
      lat: 44.4,
      lon: 26.1,
      hazardType: 'pothole',
      createdAt: '2026-04-20T10:00:00.000Z',
      confirmCount: 2,
      denyCount: 0,
      score: 2,
      userVote: null,
      expiresAt: '2026-05-01T00:00:00.000Z',
      lastConfirmedAt: '2026-04-20T12:00:00.000Z',
    });
    await app.close();
  });

  it('sets userVote=null when the caller has no validation row', async () => {
    // Main hazards SELECT.
    enqueueResult({ data: [hazardRow()], error: null });
    // hazard_validations SELECT — no rows for this user.
    enqueueResult({ data: [], error: null });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hazards).toHaveLength(1);
    expect(body.hazards[0].userVote).toBeNull();
    await app.close();
  });

  it('maps the caller\'s "confirm" response to userVote="up"', async () => {
    enqueueResult({ data: [hazardRow()], error: null });
    enqueueResult({ data: [{ hazard_id: HAZARD_ID, response: 'confirm' }], error: null });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hazards[0].userVote).toBe('up');
    await app.close();
  });

  it('maps the caller\'s "deny" response to userVote="down"', async () => {
    enqueueResult({ data: [hazardRow()], error: null });
    enqueueResult({ data: [{ hazard_id: HAZARD_ID, response: 'deny' }], error: null });

    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hazards[0].userVote).toBe('down');
    await app.close();
  });

  it('filters hazards outside the bbox radius client-side', async () => {
    // Two hazards — one at centre, one ~5000m north (outside default 1000m radius).
    enqueueResult({
      data: [
        hazardRow({ id: HAZARD_ID, location: { latitude: 44.4, longitude: 26.1 } }),
        hazardRow({
          id: OTHER_HAZARD_ID,
          location: { latitude: 44.45, longitude: 26.1 },
        }),
      ],
      error: null,
    });
    // No user → no second query, but for safety enqueue an empty vote list.
    // (The handler short-circuits if caller=null so this stays unread.)

    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1&radiusMeters=1000',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hazards).toHaveLength(1);
    expect(body.hazards[0].id).toBe(HAZARD_ID);
    await app.close();
  });

  it('response schema strips undeclared handler fields (error-log #22)', async () => {
    // Extra fields simulated via a non-existent handler field would be stripped;
    // here we prove the fixed schema only surfaces the whitelisted keys.
    enqueueResult({ data: [hazardRow()], error: null });

    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'GET', url: '/v1/hazards/nearby?lat=44.4&lon=26.1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const allowed = new Set([
      'id', 'lat', 'lon', 'hazardType', 'createdAt', 'confirmCount', 'denyCount',
      'score', 'userVote', 'expiresAt', 'lastConfirmedAt',
    ]);
    for (const key of Object.keys(body.hazards[0])) {
      expect(allowed.has(key)).toBe(true);
    }
    await app.close();
  });
});
