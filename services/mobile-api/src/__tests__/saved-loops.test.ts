// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const supabaseResultQueue: Array<{ data: unknown; count?: number | null; error: null | { message: string }; }> = [];
const enqueueResult = (r: { data: unknown; count?: number | null; error: null | { message: string }; }) => { supabaseResultQueue.push(r); };
const dequeueResult = () => supabaseResultQueue.shift() ?? { data: null, count: null, error: null };
const insertCalls: Array<Record<string, unknown>> = [];

vi.mock("../lib/supabaseAdmin", () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from","select","upsert","update","delete","eq","in","gt","order","limit","head"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      insertCalls.push(row);
      return chain;
    });
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

const AUTH_TOKEN = "test-bypass-token";
const FULL_USER_ID = "full-user-001";
const authHeaders = { authorization: `Bearer ${AUTH_TOKEN}` };

const noopRateLimiter: RateLimiter = {
  backend: "memory",
  consume: vi.fn().mockResolvedValue({ allowed: true, limit: 100, remaining: 99, resetAt: Date.now() + 60_000, retryAfterMs: 0 }),
  clear: vi.fn(),
};
const rateLimitPolicies: RateLimitPolicies = {
  routePreview: { limit: 100, windowMs: 60_000 },
  routeReroute: { limit: 100, windowMs: 60_000 },
  write: { limit: 100, windowMs: 60_000 },
  hazardVote: { limit: 100, windowMs: 600_000 },
  leaderboard: { limit: 100, windowMs: 60_000 },
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

const route = {
  id: "loop-1",
  source: "generated_loop",
  routingEngineVersion: "v1",
  routingProfileVersion: "safety-profile-v1",
  mapDataVersion: "v1",
  riskModelVersion: "v1",
  geometryPolyline6: "abc123",
  distanceMeters: 24000,
  durationSeconds: 5400,
  adjustedDurationSeconds: 5400,
  totalClimbMeters: 320,
  steps: [{ id: "s1" }],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
};

const body = {
  name: "24 km loop",
  start: { lat: 45.59, lon: 25.46 },
  route,
  distanceMeters: 24000,
  climbMeters: 320,
  unpavedShare: 0.1,
};

const dbRow = {
  id: "row-1",
  name: "24 km loop",
  start_point: { lat: 45.59, lon: 25.46 },
  route,
  distance_meters: 24000,
  climb_meters: 320,
  unpaved_share: 0.1,
  created_at: "2026-09-08T10:00:00Z",
  last_used_at: "2026-09-08T10:00:00Z",
};

beforeEach(() => { supabaseResultQueue.length = 0; insertCalls.length = 0; vi.clearAllMocks(); });
afterEach(() => { supabaseResultQueue.length = 0; insertCalls.length = 0; });

describe("GET /v1/saved-loops", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/saved-loops" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the rider's loops", async () => {
    enqueueResult({ data: [dbRow], error: null });
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/saved-loops", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const parsed = res.json() as { loops: Array<Record<string, unknown>> };
    expect(parsed.loops).toHaveLength(1);
    expect(parsed.loops[0]!.id).toBe("row-1");
    expect(parsed.loops[0]!.distanceMeters).toBe(24000);
    await app.close();
  });

  it("keeps the geometry and steps in the response", async () => {
    // Fastify strips unknown response fields (gotcha #9). If the route object
    // were schema'd field-by-field, a loop would come back rideable-looking
    // and missing its line.
    enqueueResult({ data: [dbRow], error: null });
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/v1/saved-loops", headers: authHeaders });
    const loop = (res.json() as { loops: Array<{ route: Record<string, unknown> }> }).loops[0]!;
    expect(loop.route.geometryPolyline6).toBe("abc123");
    expect(loop.route.steps).toHaveLength(1);
    expect(loop.route.source).toBe("generated_loop");
    await app.close();
  });
});

describe("POST /v1/saved-loops", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/saved-loops", payload: body });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("stores the loop and returns it", async () => {
    enqueueResult({ data: dbRow, error: null });
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/saved-loops", headers: authHeaders, payload: body });
    expect(res.statusCode).toBe(200);
    expect(insertCalls[0]!.user_id).toBe(FULL_USER_ID);
    expect(insertCalls[0]!.distance_meters).toBe(24000);
    await app.close();
  });

  it("drops risk segments and elevation before storing", async () => {
    // Both are re-derived from the geometry on open. Dropping them here rather
    // than trusting the client keeps a row small however generous the caller.
    enqueueResult({ data: dbRow, error: null });
    const app = buildTestApp();
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/v1/saved-loops",
      headers: authHeaders,
      payload: {
        ...body,
        route: {
          ...route,
          riskSegments: [{ startIndex: 0, endIndex: 5, riskCategory: "High risk" }],
          elevationProfile: [100, 110, 120],
        },
      },
    });
    const stored = insertCalls[0]!.route as Record<string, unknown>;
    expect(stored.riskSegments).toEqual([]);
    expect(stored.elevationProfile).toBeUndefined();
    expect(stored.geometryPolyline6).toBe("abc123");
    await app.close();
  });

  it("refuses a route that is not a generated loop", async () => {
    // `generated_loop` is what suppresses auto-reroute. Storing anything else
    // would let a saved loop be re-routed home mid-ride.
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/v1/saved-loops",
      headers: authHeaders,
      payload: { ...body, route: { ...route, source: "custom_osrm" } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("refuses a route with no geometry", async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/v1/saved-loops",
      headers: authHeaders,
      payload: { ...body, route: { ...route, geometryPolyline6: "" } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("DELETE /v1/saved-loops/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({ method: "DELETE", url: "/v1/saved-loops/row-1" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("deletes and acknowledges", async () => {
    enqueueResult({ data: null, error: null });
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({ method: "DELETE", url: "/v1/saved-loops/row-1", headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("acceptedAt");
    await app.close();
  });
});
