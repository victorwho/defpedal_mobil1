// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const supabaseResultQueue: Array<{ data: unknown; count?: number | null; error: null | { message: string }; }> = [];
const enqueueResult = (r: { data: unknown; count?: number | null; error: null | { message: string }; }) => { supabaseResultQueue.push(r); };
const dequeueResult = () => supabaseResultQueue.shift() ?? { data: null, count: null, error: null };

vi.mock("../lib/supabaseAdmin", () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from","select","insert","upsert","update","delete","eq","in","gt","order","limit","head"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.rpc = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    (chain as unknown as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) => Promise.resolve(dequeueResult()).then(resolve, reject);
    return chain;
  };
  return { supabaseAdmin: makeChain() };
});
vi.mock("../lib/notifications", () => ({ dispatchNotification: vi.fn().mockResolvedValue(undefined) }));

import { buildApp } from "../app";
import { createMemoryRouteResponseCache } from "../lib/cache";
import type { MobileApiDependencies } from "../lib/dependencies";
import { type RateLimiter, type RateLimitPolicies } from "../lib/rateLimit";

const CRON_SECRET = "test-cron-secret-xyz";
process.env.CRON_SECRET = CRON_SECRET;
const AUTH_TOKEN = "test-bypass-token";
const ANON_USER_ID = "anon-user-001";
const FULL_USER_ID = "full-user-001";
const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };
const cronHeaders = { authorization: `Bearer ${CRON_SECRET}` };

const noopRateLimiter: RateLimiter = {
  backend: "memory",
  consume: vi.fn().mockResolvedValue({ allowed: true, limit: 100, remaining: 99, resetAt: Date.now() + 60_000, retryAfterMs: 0 }),
  clear: vi.fn(),
};
const rateLimitedLimiter: RateLimiter = {
  backend: "memory",
  consume: vi.fn().mockResolvedValue({ allowed: false, limit: 10, remaining: 0, resetAt: Date.now() + 60_000, retryAfterMs: 30_000 }),
  clear: vi.fn(),
};
const rateLimitPolicies: RateLimitPolicies = {
  routePreview: { limit: 100, windowMs: 60_000 },
  routeReroute: { limit: 100, windowMs: 60_000 },
  write: { limit: 100, windowMs: 60_000 },
};

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) => buildApp({
  dependencies: {
    authenticateUser: vi.fn().mockResolvedValue({ id: FULL_USER_ID, email: "rider@test.local" }),
    buildCoverageResponse: vi.fn().mockReturnValue({ regions: [], matched: { countryCode: "RO", status: "supported", safeRouting: true, fastRouting: true }, generatedAt: new Date().toISOString() }),
    resolveCoverage: vi.fn().mockReturnValue({ countryCode: "RO", status: "supported" as const, safeRouting: true, fastRouting: true }),
    fetchSafeRoutes: vi.fn().mockResolvedValue({ routes: [] }),
    fetchFastRoutes: vi.fn().mockResolvedValue({ routes: [] }),
    forwardGeocode: vi.fn().mockResolvedValue([]),
    reverseGeocode: vi.fn().mockResolvedValue({ coordinate: { lat: 0, lon: 0 }, label: null }),
    getElevationProfile: vi.fn().mockResolvedValue([]),
    getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 0, elevationLoss: 0 }),
    fetchRiskSegments: vi.fn().mockResolvedValue([]),
    normalizeRoutePreviewResponse: vi.fn().mockReturnValue({ routes: [], selectedMode: "safe" as const, coverage: { countryCode: "RO", status: "supported", safeRouting: true, fastRouting: true }, generatedAt: new Date().toISOString() }),
    submitHazardReport: vi.fn().mockResolvedValue({ reportId: "h1", acceptedAt: "" }),
    startTripRecord: vi.fn().mockResolvedValue({ clientTripId: "c1", tripId: "t1", acceptedAt: "" }),
    finishTripRecord: vi.fn().mockResolvedValue({ clientTripId: "c1", tripId: "t1", acceptedAt: "" }),
    saveTripTrack: vi.fn().mockResolvedValue({ acceptedAt: "" }),
    getTripHistory: vi.fn().mockResolvedValue([]),
    submitNavigationFeedback: vi.fn().mockResolvedValue({ acceptedAt: "" }),
    routeResponseCache: createMemoryRouteResponseCache(),
    rateLimiter: noopRateLimiter,
    rateLimitPolicies,
    routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
    sharedStoreBackend: "memory",
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  },
});

const makeRow = (rank: number, userId: string, extra: Record<string, unknown> = {}) => ({
  rank, user_id: userId, display_name: "Rider " + rank, avatar_url: null, rider_tier: "kickstand",
  metric_value: 10.5 * rank, rank_delta: null, is_champion: false, is_requesting_user: false, ...extra,
});
// GET /v1/leaderboard tests
describe("GET /v1/leaderboard", () => {
  beforeEach(() => { supabaseResultQueue.length = 0; vi.clearAllMocks(); process.env.CRON_SECRET = CRON_SECRET; });
  afterEach(() => { supabaseResultQueue.length = 0; });

  it("returns 401 when no authorization header is provided", async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1" });
    expect(res.statusCode).toBe(401); await app.close();
  });

  it("returns 403 when user is anonymous (no email)", async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue({ id: ANON_USER_ID, email: null }) });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(403); await app.close();
  });

  it("returns 400 when lat and lon are missing", async () => {
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard", headers: authHeaders });
    expect(res.statusCode).toBe(400); await app.close();
  });

  it("returns 400 when metric enum is invalid", async () => {
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1&metric=calories", headers: authHeaders });
    expect(res.statusCode).toBe(400); await app.close();
  });

  it("returns 400 when period enum is invalid", async () => {
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1&period=yesterday", headers: authHeaders });
    expect(res.statusCode).toBe(400); await app.close();
  });
  it("returns 200 with correct response shape", async () => {
    enqueueResult({ data: [makeRow(1, "u1", { is_requesting_user: true }), makeRow(2, "u2")], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1&metric=co2&period=week", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.periodStart).toBe("string");
    expect(typeof body.periodEnd).toBe("string");
    expect(Object.prototype.hasOwnProperty.call(body, "userRank")).toBe(true);
    await app.close();
  });

  it("maps snake_case RPC row to camelCase entry fields", async () => {
    enqueueResult({ data: [makeRow(1, "u1", { display_name: "Alice B", rider_tier: "trailblazer", metric_value: 42.5, rank_delta: 3, is_champion: true, is_requesting_user: true })], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const e = res.json().entries[0];
    expect(e.rank).toBe(1); expect(e.userId).toBe("u1"); expect(e.displayName).toBe("Alice B");
    expect(e.riderTier).toBe("trailblazer"); expect(e.metricValue).toBe(42.5); expect(e.rankDelta).toBe(3);
    expect(e.isChampion).toBe(true); expect(e.isRequestingUser).toBe(true);
    await app.close();
  });
  it("places user at rank > 50 into userRank field", async () => {
    enqueueResult({ data: [makeRow(1, "u1"), makeRow(2, "u2"), makeRow(55, "u-me", { is_requesting_user: true })], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userRank).not.toBeNull(); expect(body.userRank.rank).toBe(55);
    await app.close();
  });

  it("returns empty entries and null userRank for empty leaderboard", async () => {
    enqueueResult({ data: [], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toHaveLength(0); expect(body.userRank).toBeNull();
    await app.close();
  });

  it("returns 502 when Supabase RPC returns an error", async () => {
    enqueueResult({ data: null, count: null, error: { message: "connection refused" } });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(502); await app.close();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const app = buildTestApp({ rateLimiter: rateLimitedLimiter }); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.statusCode).toBe(429); await app.close();
  });
  it("returns ISO date strings for periodStart and periodEnd", async () => {
    enqueueResult({ data: [], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1&period=month", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(new Date(body.periodStart).toISOString()).toBe(body.periodStart);
    expect(new Date(body.periodEnd).toISOString()).toBe(body.periodEnd);
    await app.close();
  });

  it("sets x-ratelimit headers on successful response", async () => {
    enqueueResult({ data: [], count: null, error: null });
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/leaderboard?lat=44.4&lon=26.1", headers: authHeaders });
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    await app.close();
  });
});
// POST /v1/leaderboard/settle tests
describe("POST /v1/leaderboard/settle", () => {
  beforeEach(() => { supabaseResultQueue.length = 0; vi.clearAllMocks(); process.env.CRON_SECRET = CRON_SECRET; });
  afterEach(() => { supabaseResultQueue.length = 0; });

  it("returns 401 when no authorization header is provided", async () => {
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/leaderboard/settle" });
    expect(res.statusCode).toBe(401); await app.close();
  });

  it("returns 401 when the cron secret is wrong", async () => {
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/leaderboard/settle", headers: { authorization: "Bearer wrong-secret" } });
    expect(res.statusCode).toBe(401); await app.close();
  });
  it("returns 200 with correct shape and counts snapshots created", async () => {
    // Combo 1 (weekly co2): new period, 2 rows (rank 1 and rank 2)
    enqueueResult({ data: null, count: 0, error: null });    // idempotency check: no existing
    enqueueResult({ data: [makeRow(1, "u1"), makeRow(2, "u2")], count: null, error: null }); // lb rpc
    // rank 1 row: snap + xp + badge + repeat-champion check
    enqueueResult({ data: null, count: null, error: null }); // snap insert
    enqueueResult({ data: null, count: null, error: null }); // award_xp
    enqueueResult({ data: null, count: null, error: null }); // badge insert
    enqueueResult({ data: null, count: null, error: null }); // check_champion_repeat_badges
    // rank 2 row: snap + xp only
    enqueueResult({ data: null, count: null, error: null }); // snap insert
    enqueueResult({ data: null, count: null, error: null }); // award_xp
    // Combos 2-4: idempotency=0, empty leaderboard
    for (let i = 0; i < 3; i++) {
      enqueueResult({ data: null, count: 0, error: null });
      enqueueResult({ data: [], count: null, error: null });
    }
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/leaderboard/settle", headers: cronHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshotsCreated).toBe(2);
    expect(typeof body.xpAwarded).toBe("number");
    await app.close();
  });
  it("skips all combos when snapshots already exist (idempotency fix verified)", async () => {
    // All 4 combos return count > 0 meaning snapshots exist: handler must skip
    // This test verifies the CRITICAL fix: using count not data.length
    for (let i = 0; i < 4; i++) {
      enqueueResult({ data: null, count: 5, error: null });
    }
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/leaderboard/settle", headers: cronHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshotsCreated).toBe(0);
    expect(body.xpAwarded).toBe(0);
    await app.close();
  });

  it("returns snapshotsCreated=0 when all leaderboards return empty rows", async () => {
    for (let i = 0; i < 4; i++) {
      enqueueResult({ data: null, count: 0, error: null });
      enqueueResult({ data: [], count: null, error: null });
    }
    const app = buildTestApp(); await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/leaderboard/settle", headers: cronHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshotsCreated).toBe(0);
    await app.close();
  });
});