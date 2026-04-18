// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// supabaseAdmin mock — ensureSupabase() just needs it to be truthy for the
// plugin to wire up; the service is injected in tests so the client itself
// is never hit.
// ---------------------------------------------------------------------------
vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {} as Record<string, unknown>,
}));

import Fastify from 'fastify';
import type { FastifyError } from 'fastify';

import {
  HttpError,
  toErrorResponse,
  formatValidationDetails,
} from '../lib/http';
import {
  buildRouteShareRoutes,
  isRouteSharesEnabled,
} from '../routes/route-shares';
import { encodePolyline } from '@defensivepedal/core';
import type { MobileApiDependencies } from '../lib/dependencies';
import type { RouteShareService } from '../lib/routeShareService';

// ---------------------------------------------------------------------------
// Helpers — minimal Fastify app that only mounts the route-share plugin
// and emulates the parent app's error handler contract.
// ---------------------------------------------------------------------------

const BYPASS_TOKEN = 'test-bypass-token';
const USER_ID = 'full-user-001';

const authHeaders = { authorization: `Bearer ${BYPASS_TOKEN}` };

const fakeAuthenticateUser = vi
  .fn<(token: string) => Promise<{ id: string; email: string | null } | null>>()
  .mockResolvedValue({ id: USER_ID, email: 'rider@test.local' });

const makeDependencies = (
  overrides: Partial<MobileApiDependencies> = {},
): MobileApiDependencies =>
  ({
    authenticateUser: fakeAuthenticateUser,
    ...overrides,
  }) as MobileApiDependencies;

const buildTestApp = (service: RouteShareService, deps?: Partial<MobileApiDependencies>) => {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (Array.isArray((error as { validation?: unknown[] }).validation)) {
      return reply
        .status(400)
        .send(
          toErrorResponse(
            'Request validation failed.',
            'VALIDATION_ERROR',
            formatValidationDetails(error),
          ),
        );
    }
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error.message, error.code, error.details));
    }
    return reply.status(500).send(toErrorResponse('Unexpected server error.', 'INTERNAL_ERROR'));
  });

  void app.register(buildRouteShareRoutes(makeDependencies(deps), { service }), {
    prefix: '/v1',
  });
  return app;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const shortPolyline = encodePolyline([
  [26.1025, 44.4268],
  [26.1035, 44.4278],
]);

const validBody = {
  source: 'planned',
  route: {
    origin: { lat: 44.4268, lon: 26.1025 },
    destination: { lat: 44.4278, lon: 26.1035 },
    geometryPolyline6: shortPolyline,
    distanceMeters: 150,
    durationSeconds: 60,
    routingMode: 'safe',
  },
};

const happyCreateRow = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'abcd1234',
  source: 'planned' as const,
  createdAt: '2026-04-18T10:00:00.000Z',
  expiresAt: '2026-05-18T10:00:00.000Z',
};

// Response-side the schema `required` list includes riskSegments + safetyScore;
// extend the request fixture with defaults so it satisfies the public-view
// response shape when echoed back by the mocked service.
const publicRoute = {
  ...validBody.route,
  riskSegments: [] as Array<{
    startIndex: number;
    endIndex: number;
    riskCategory: 'very_safe' | 'safe' | 'moderate' | 'dangerous' | 'extreme';
  }>,
  safetyScore: null as number | null,
};

const happyPublicView = {
  code: 'abcd1234',
  source: 'planned' as const,
  sharerDisplayName: 'Jane',
  sharerAvatarUrl: null,
  route: publicRoute,
  endpointsHidden: true,
  fullLengthMeters: 150,
  viewCount: 1,
  createdAt: '2026-04-18T10:00:00.000Z',
  expiresAt: '2026-05-18T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// isRouteSharesEnabled — pure unit tests
// ---------------------------------------------------------------------------

describe('isRouteSharesEnabled', () => {
  it('defaults to true when ENABLE_ROUTE_SHARES is unset', () => {
    expect(isRouteSharesEnabled({})).toBe(true);
  });

  it('is true when set to "true"', () => {
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: 'true' })).toBe(true);
  });

  it('is false when set to "false"', () => {
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: 'false' })).toBe(false);
  });

  it('is false when set to "0" or "off"', () => {
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: '0' })).toBe(false);
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: 'off' })).toBe(false);
  });

  it('stays on for unknown values (typo safety)', () => {
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: 'yes' })).toBe(true);
    expect(isRouteSharesEnabled({ ENABLE_ROUTE_SHARES: 'tRuE' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/route-shares
// ---------------------------------------------------------------------------

describe('POST /v1/route-shares', () => {
  beforeEach(() => {
    fakeAuthenticateUser.mockReset();
    fakeAuthenticateUser.mockResolvedValue({ id: USER_ID, email: 'rider@test.local' });
  });

  const happyService = (): RouteShareService => ({
    createShare: vi.fn().mockResolvedValue(happyCreateRow),
    getPublicShare: vi.fn(),
  });

  it('returns 401 without an Authorization header', async () => {
    const app = buildTestApp(happyService());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when the bypass token is invalid', async () => {
    fakeAuthenticateUser.mockResolvedValue(null);
    const app = buildTestApp(happyService());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 with appUrl/webUrl universal link for the new share', async () => {
    const service = happyService();
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: validBody,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.id).toBe(happyCreateRow.id);
    expect(body.code).toBe(happyCreateRow.code);
    expect(body.source).toBe('planned');
    expect(body.appUrl).toBe(
      `https://routes.defensivepedal.com/r/${happyCreateRow.code}`,
    );
    expect(body.webUrl).toBe(body.appUrl);
    expect(body.createdAt).toBe(happyCreateRow.createdAt);
    expect(body.expiresAt).toBe(happyCreateRow.expiresAt);
    await app.close();
  });

  it('passes the authenticated user id through to the service', async () => {
    const createShare = vi.fn().mockResolvedValue(happyCreateRow);
    const service: RouteShareService = { createShare, getPublicShare: vi.fn() };
    const app = buildTestApp(service);
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: validBody,
    });

    expect(createShare).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
    await app.close();
  });

  it('returns 400 on missing source discriminator', async () => {
    const app = buildTestApp(happyService());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: { route: validBody.route },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 on unknown routingMode', async () => {
    const app = buildTestApp(happyService());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: {
        ...validBody,
        route: { ...validBody.route, routingMode: 'scenic' },
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 on source !== "planned" in slice 1', async () => {
    const app = buildTestApp(happyService());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: { ...validBody, source: 'saved' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 502 when the service throws', async () => {
    const service: RouteShareService = {
      createShare: vi.fn().mockRejectedValue(new Error('db down')),
      getPublicShare: vi.fn(),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares',
      headers: authHeaders,
      payload: validBody,
    });

    expect(res.statusCode).toBe(502);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/route-shares/public/:code
// ---------------------------------------------------------------------------

describe('GET /v1/route-shares/public/:code', () => {
  it('is reachable without any Authorization header (public endpoint)', async () => {
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare: vi.fn().mockResolvedValue({ ok: true, value: happyPublicView }),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/abcd1234',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.code).toBe('abcd1234');
    expect(body.source).toBe('planned');
    expect(body.endpointsHidden).toBe(true);
    // New contract fields (sharerAvatarUrl, viewCount) pass through from service
    expect(body.sharerAvatarUrl).toBeNull();
    expect(body.viewCount).toBe(1);
    await app.close();
  });

  it('returns 404 when service reports NOT_FOUND', async () => {
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare: vi.fn().mockResolvedValue({ ok: false, error: 'NOT_FOUND' }),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/abcd1234',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 410 when service reports EXPIRED', async () => {
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare: vi.fn().mockResolvedValue({ ok: false, error: 'EXPIRED' }),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/abcd1234',
    });
    expect(res.statusCode).toBe(410);
    const body = res.json() as Record<string, unknown>;
    expect((body.details as string[])[0]).toBe('EXPIRED');
    await app.close();
  });

  it('returns 410 when service reports REVOKED', async () => {
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare: vi.fn().mockResolvedValue({ ok: false, error: 'REVOKED' }),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/abcd1234',
    });
    expect(res.statusCode).toBe(410);
    const body = res.json() as Record<string, unknown>;
    expect((body.details as string[])[0]).toBe('REVOKED');
    await app.close();
  });

  it('returns 400 when :code fails the shape check', async () => {
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare: vi.fn(),
    };
    const app = buildTestApp(service);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/bad-code',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('does not call the service when the code is malformed', async () => {
    const getPublicShare = vi.fn();
    const service: RouteShareService = {
      createShare: vi.fn(),
      getPublicShare,
    };
    const app = buildTestApp(service);
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/v1/route-shares/public/toolongoralpha',
    });
    expect(getPublicShare).not.toHaveBeenCalled();
    await app.close();
  });
});
