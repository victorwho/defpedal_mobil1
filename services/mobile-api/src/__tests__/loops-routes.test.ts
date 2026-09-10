// @vitest-environment node
/**
 * POST /v1/loops — the endpoint contract.
 *
 * Two halves, and the split is the design:
 *
 *   Everything checkable up front — auth, body validation, the rate limit,
 *   coverage — answers with a real HTTP status, because headers have not gone
 *   out yet.
 *
 *   Everything after that arrives as a frame in the stream, because they have.
 *   A search that fails at ring nine cannot become a 502; it becomes an
 *   `error` frame, and the client has to be able to tell that apart from a
 *   stream that simply stopped.
 *
 * The search itself is mocked here on purpose. What it finds is settled in
 * `lib/loops/search.test.ts` and `loops-parity.test.ts`; this file is about
 * what reaches the wire.
 */
import type { LoopStreamFrame } from '@defensivepedal/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchLoopsMock = vi.fn();

vi.mock('../lib/loops/search', () => ({
  searchLoops: (...args: unknown[]) => searchLoopsMock(...args),
  LOOPS_PER_ATTEMPT: 5,
}));
vi.mock('../lib/supabaseAdmin', () => ({ supabaseAdmin: null }));

import { buildApp } from '../app';
import { createMemoryRouteResponseCache } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import type { RateLimiter, RateLimitPolicies } from '../lib/rateLimit';

const USER_ID = 'rider-loop-001';
const authHeaders = { authorization: 'Bearer test-token' };

/** Bucharest — inside the routing graph. */
const BUCHAREST = { lat: 44.4268, lon: 26.1025 };
/** Manhattan — outside every supported country. */
const NEW_YORK = { lat: 40.7128, lon: -74.006 };

const validBody = (overrides: Record<string, unknown> = {}) => ({
  start: BUCHAREST,
  targetDistanceMeters: 15000,
  terrain: 'rolling',
  surface: 'any',
  heading: 'any',
  locale: 'en',
  ...overrides,
});

const allowingRateLimiter = (): RateLimiter => ({
  backend: 'memory',
  consume: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 6,
    remaining: 5,
    resetAt: Date.now() + 60_000,
    retryAfterMs: 0,
  }),
  clear: vi.fn(),
});

const rateLimitPolicies = {
  routePreview: { limit: 100, windowMs: 60_000 },
  routeReroute: { limit: 100, windowMs: 60_000 },
  write: { limit: 100, windowMs: 60_000 },
  hazardVote: { limit: 100, windowMs: 600_000 },
  leaderboard: { limit: 100, windowMs: 60_000 },
  loopSearch: { limit: 6, windowMs: 60_000 },
} as unknown as RateLimitPolicies;

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) =>
  buildApp({
    dependencies: {
      authenticateUser: vi
        .fn()
        .mockResolvedValue({ id: USER_ID, email: 'rider@test.local' }),
      buildCoverageResponse: vi.fn().mockReturnValue({
        regions: [],
        matched: {
          countryCode: 'RO',
          status: 'supported',
          safeRouting: true,
          fastRouting: true,
        },
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
      reverseGeocode: vi
        .fn()
        .mockResolvedValue({ coordinate: { lat: 0, lon: 0 }, label: null }),
      getElevationProfile: vi.fn().mockResolvedValue([]),
      getElevationGain: vi
        .fn()
        .mockResolvedValue({ elevationGain: 0, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      fetchScenicSegments: vi.fn().mockResolvedValue([]),
      normalizeRoutePreviewResponse: vi.fn(),
      submitHazardReport: vi.fn(),
      startTripRecord: vi.fn(),
      finishTripRecord: vi.fn(),
      saveTripTrack: vi.fn(),
      getTripHistory: vi.fn().mockResolvedValue([]),
      submitNavigationFeedback: vi.fn(),
      routeResponseCache: createMemoryRouteResponseCache(),
      rateLimiter: allowingRateLimiter(),
      rateLimitPolicies,
      routeResponseCacheTtlMs: { preview: 0, reroute: 0 },
      sharedStoreBackend: 'memory',
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as MobileApiDependencies,
  });

const loop = (id: string) => ({
  id,
  route: {
    id,
    source: 'generated_loop',
    routingEngineVersion: 'safe-osrm-v1',
    routingProfileVersion: 'safety-profile-v1',
    mapDataVersion: 'osm-current',
    riskModelVersion: 'risk-model-v1',
    geometryPolyline6: 'abc',
    distanceMeters: 15100,
    durationSeconds: 3600,
    adjustedDurationSeconds: 3700,
    totalClimbMeters: 120,
    steps: [],
    riskSegments: [],
    routeFeatures: [],
    warnings: [],
  },
  coordinates: [
    [26.1, 44.42],
    [26.11, 44.43],
  ],
  bearingDegrees: 90,
  distanceMeters: 15100,
  climbMeters: 120,
  highRiskMeters: 0,
  unpavedShare: 0.1,
  retracedShare: 0.05,
  ringRetracedShare: 0.05,
  spurShare: 0,
  pavedFallback: false,
  stemMeters: 0,
  scenicScore: 0,
  relaxation: 'none',
  terrain: 'rolling',
  measured: true,
});

/** Parse an NDJSON payload into frames, failing loudly on a broken line. */
const parseFrames = (payload: string): LoopStreamFrame[] =>
  payload
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LoopStreamFrame);

describe('POST /v1/loops — refused before a byte is written', () => {
  beforeEach(() => {
    searchLoopsMock.mockReset();
  });

  it('rejects an unauthenticated request', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      payload: validBody(),
    });
    expect(response.statusCode).toBe(401);
    expect(searchLoopsMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts an anonymous session, like the risk overlay does', async () => {
    searchLoopsMock.mockResolvedValue({ status: 'empty' });
    const app = await buildTestApp({
      authenticateUser: vi
        .fn()
        .mockResolvedValue({ id: 'anon-1', email: null, isAnonymous: true }),
    } as Partial<MobileApiDependencies>);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it.each([
    ['a missing start', { start: undefined }],
    ['a distance below the shortest offered', { targetDistanceMeters: 500 }],
    ['a distance above the longest offered', { targetDistanceMeters: 250_000 }],
    ['an unknown terrain', { terrain: 'mountainous' }],
    ['an unknown surface', { surface: 'gravelly' }],
    ['a heading that is not a compass point', { heading: 'ENE' }],
    ['a latitude off the planet', { start: { lat: 120, lon: 26 } }],
  ])('rejects %s', async (_name, override) => {
    const app = await buildTestApp();
    const payload = validBody(override as Record<string, unknown>);
    if ((override as Record<string, unknown>).start === undefined) {
      delete (payload as Record<string, unknown>).start;
    }

    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(searchLoopsMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses a start outside the routing graph rather than serving a worse loop', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody({ start: NEW_YORK }),
    });

    // Loops need `exclude=unpaved`, road classes and the safety profile, and
    // Mapbox supplies none of the three. There is no degraded mode, so the
    // honest answer is a refusal.
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('FEATURE_DISABLED');
    expect(searchLoopsMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('answers 429 on its own bucket, not the route-preview one', async () => {
    const consume = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 6,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterMs: 30_000,
    });
    const app = await buildTestApp({
      rateLimiter: { backend: 'memory', consume, clear: vi.fn() },
    } as Partial<MobileApiDependencies>);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    expect(response.statusCode).toBe(429);
    expect(consume.mock.calls[0]![0].bucket).toBe('loopSearch');
    expect(response.headers['retry-after']).toBeDefined();
    expect(searchLoopsMock).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /v1/loops — the stream', () => {
  beforeEach(() => {
    searchLoopsMock.mockReset();
  });

  it('streams candidates and progress before the result', async () => {
    searchLoopsMock.mockImplementation(
      async (
        _ports: unknown,
        _request: unknown,
        callbacks: {
          onCandidate?: (l: unknown) => void;
          onProgress?: (r: number, a: number) => void;
        },
      ) => {
        callbacks.onCandidate?.(loop('a'));
        callbacks.onProgress?.(1, 1);
        callbacks.onCandidate?.(loop('b'));
        callbacks.onProgress?.(2, 2);
        return {
          status: 'ok',
          loops: [loop('a'), loop('b')],
          relaxation: 'none',
          checked: 2,
        };
      },
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');

    const frames = parseFrames(response.payload);
    expect(frames.map((f) => f.type)).toEqual([
      'candidate',
      'progress',
      'candidate',
      'progress',
      'result',
    ]);

    const result = frames.at(-1)!;
    expect(result.type).toBe('result');
    if (result.type !== 'result') return;
    expect(result.loops).toHaveLength(2);
    expect(result.relaxation).toBe('none');
    expect(result.checked).toBe(2);
    await app.close();
  });

  it('carries the whole route on each loop, marked so reroute cannot delete it', async () => {
    searchLoopsMock.mockResolvedValue({
      status: 'ok',
      loops: [loop('a')],
      relaxation: 'none',
      checked: 1,
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    const frames = parseFrames(response.payload);
    const result = frames.at(-1)!;
    if (result.type !== 'result') throw new Error('expected a result frame');

    const only = result.loops[0]!;
    // On a loop the destination IS the origin, so an unsuppressed reroute asks
    // for the shortest way home and silently deletes the rest of the ride.
    expect(only.route.source).toBe('generated_loop');
    expect(only.route.geometryPolyline6).toBeTruthy();
    expect(only.climbMeters).toBe(120);
    await app.close();
  });

  it('ends with an `empty` frame when nothing rideable came back', async () => {
    searchLoopsMock.mockResolvedValue({ status: 'empty' });

    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    expect(response.statusCode).toBe(200);
    const frames = parseFrames(response.payload);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.type).toBe('empty');
    await app.close();
  });

  it('reports a mid-stream failure as an `error` frame, not a status code', async () => {
    searchLoopsMock.mockImplementation(
      async (
        _ports: unknown,
        _request: unknown,
        callbacks: { onCandidate?: (l: unknown) => void },
      ) => {
        callbacks.onCandidate?.(loop('a'));
        throw new Error('OSRM went away');
      },
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    // 200, because the headers left before the failure existed. This is why
    // the client must read the terminal frame rather than the status.
    expect(response.statusCode).toBe(200);
    const frames = parseFrames(response.payload);
    expect(frames[0]!.type).toBe('candidate');

    const last = frames.at(-1)!;
    expect(last.type).toBe('error');
    if (last.type !== 'error') return;
    expect(last.message).toContain('OSRM went away');
    await app.close();
  });

  it('always ends with exactly one terminal frame', async () => {
    const cases = [
      { status: 'empty' },
      { status: 'ok', loops: [loop('a')], relaxation: 'none', checked: 1 },
    ];

    for (const outcome of cases) {
      searchLoopsMock.mockReset();
      searchLoopsMock.mockResolvedValue(outcome);
      const app = await buildTestApp();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/loops',
        headers: authHeaders,
        payload: validBody(),
      });

      const frames = parseFrames(response.payload);
      const terminal = frames.filter((f) =>
        ['result', 'empty', 'error'].includes(f.type),
      );
      expect(terminal).toHaveLength(1);
      expect(frames.at(-1)).toBe(terminal[0]);
      await app.close();
    }
  });

  it('writes every frame as one complete line of JSON', async () => {
    searchLoopsMock.mockImplementation(
      async (
        _ports: unknown,
        _request: unknown,
        callbacks: { onCandidate?: (l: unknown) => void },
      ) => {
        // Fired from several workers at once in the real search, which is why
        // the writer serialises: a half-written line interleaved with the next
        // parses on neither side.
        for (let i = 0; i < 20; i += 1) callbacks.onCandidate?.(loop(`c${i}`));
        return { status: 'empty' };
      },
    );

    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody(),
    });

    const lines = response.payload.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(21);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    await app.close();
  });

  it('passes the rider request through to the search unchanged', async () => {
    searchLoopsMock.mockResolvedValue({ status: 'empty' });
    const app = await buildTestApp();

    await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload: validBody({
        terrain: 'hilly',
        surface: 'paved',
        heading: 'SW',
        targetDistanceMeters: 40000,
        locale: 'ro',
      }),
    });

    const [, request] = searchLoopsMock.mock.calls[0]!;
    expect(request).toMatchObject({
      start: BUCHAREST,
      targetDistanceMeters: 40000,
      terrain: 'hilly',
      surface: 'paved',
      heading: 'SW',
      locale: 'ro',
    });
    await app.close();
  });

  it('defaults the locale rather than failing without one', async () => {
    searchLoopsMock.mockResolvedValue({ status: 'empty' });
    const app = await buildTestApp();
    const payload = validBody();
    delete (payload as Record<string, unknown>).locale;

    const response = await app.inject({
      method: 'POST',
      url: '/v1/loops',
      headers: authHeaders,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(searchLoopsMock.mock.calls[0]![1].locale).toBe('en');
    await app.close();
  });
});
