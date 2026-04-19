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

// Slice 3: mock the ambassador-reward push dispatcher. Tests that care about
// the push side effect inspect `dispatchAmbassadorRewardNotificationMock`.
const dispatchAmbassadorRewardNotificationMock = vi.fn().mockResolvedValue({
  dispatched: false,
  priority: 'normal' as const,
});
vi.mock('../lib/ambassadorRewards', () => ({
  dispatchAmbassadorRewardNotification: (...args: unknown[]) =>
    dispatchAmbassadorRewardNotificationMock(...args),
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
    claimShare: vi.fn(),
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
    const service: RouteShareService = { createShare, getPublicShare: vi.fn(), claimShare: vi.fn() };
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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
      claimShare: vi.fn(),
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

// ---------------------------------------------------------------------------
// POST /v1/route-shares/:code/claim
// ---------------------------------------------------------------------------

describe('POST /v1/route-shares/:code/claim', () => {
  beforeEach(() => {
    fakeAuthenticateUser.mockReset();
    fakeAuthenticateUser.mockResolvedValue({ id: USER_ID, email: 'rider@test.local' });
  });

  const emptyRewards = {
    inviteeXpAwarded: null,
    inviteeNewBadges: [],
    inviterXpAwarded: null,
    inviterNewBadges: [],
    inviterUserId: '',
    miaMilestoneAdvanced: false,
  } as const;

  const happyClaimPayload = {
    code: 'abcd1234',
    routePayload: publicRoute,
    sharerDisplayName: 'Jane',
    sharerAvatarUrl: null,
    alreadyClaimed: false,
    rewards: emptyRewards,
  };

  const makeClaimService = (
    claimShareImpl: RouteShareService['claimShare'],
  ): RouteShareService => ({
    createShare: vi.fn(),
    getPublicShare: vi.fn(),
    claimShare: claimShareImpl,
  });

  it('returns 401 without an Authorization header', async () => {
    const app = buildTestApp(makeClaimService(vi.fn()));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 401 when bypass token is invalid', async () => {
    fakeAuthenticateUser.mockResolvedValue(null);
    const app = buildTestApp(makeClaimService(vi.fn()));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('returns 400 when :code fails the shape check', async () => {
    const claimShare = vi.fn();
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/bad-code/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(400);
    // Malformed :code must short-circuit before the service is called.
    expect(claimShare).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 when service reports not_found', async () => {
    const claimShare = vi.fn().mockResolvedValue({ status: 'not_found' });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 410 + details:["expired"] for expired shares', async () => {
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'gone', reason: 'expired' });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(410);
    const body = res.json() as Record<string, unknown>;
    expect((body.details as string[])[0]).toBe('expired');
    await app.close();
  });

  it('returns 410 + details:["revoked"] for revoked shares', async () => {
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'gone', reason: 'revoked' });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(410);
    const body = res.json() as Record<string, unknown>;
    expect((body.details as string[])[0]).toBe('revoked');
    await app.close();
  });

  it('returns 422 + details:["self_referral"] when the invitee owns the share', async () => {
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'invalid', reason: 'self_referral' });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as Record<string, unknown>;
    expect(body.code).toBe('BAD_REQUEST');
    expect((body.details as string[])[0]).toBe('self_referral');
    await app.close();
  });

  it('returns 200 with alreadyClaimed:false on first-time claim', async () => {
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: happyClaimPayload });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.code).toBe('abcd1234');
    expect(body.alreadyClaimed).toBe(false);
    expect(body.sharerDisplayName).toBe('Jane');
    expect(body.sharerAvatarUrl).toBeNull();
    expect(body.routePayload).toEqual(publicRoute);
    await app.close();
  });

  it('passes the authenticated user id through to the service as inviteeUserId', async () => {
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: happyClaimPayload });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });

    expect(claimShare).toHaveBeenCalledWith({
      code: 'abcd1234',
      inviteeUserId: USER_ID,
    });
    await app.close();
  });

  it('returns 200 with alreadyClaimed:true on idempotent re-claim (same payload)', async () => {
    const idempotent = {
      ...happyClaimPayload,
      alreadyClaimed: true,
    };
    const claimShare = vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: idempotent });
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.alreadyClaimed).toBe(true);
    // The routePayload echoes the same shape on both first-claim and
    // re-claim so the mobile client's navigation logic is uniform.
    expect(body.routePayload).toEqual(publicRoute);
    await app.close();
  });

  it('returns 502 when claimShare throws (unknown DB error)', async () => {
    const claimShare = vi.fn().mockRejectedValue(new Error('db down'));
    const app = buildTestApp(makeClaimService(claimShare));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/v1/route-shares/abcd1234/claim',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(502);
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Slice 3 — ambassador rewards
  // ─────────────────────────────────────────────────────────────────────

  describe('ambassador rewards (slice 3)', () => {
    beforeEach(() => {
      dispatchAmbassadorRewardNotificationMock.mockClear();
    });

    it('surfaces invitee rewards and hides inviter rewards in the response', async () => {
      const claimShare = vi.fn().mockResolvedValue({
        status: 'ok',
        data: {
          ...happyClaimPayload,
          rewards: {
            inviteeXpAwarded: 50,
            inviteeNewBadges: [],
            inviterXpAwarded: 100,
            inviterNewBadges: [
              {
                badgeKey: 'ambassador_bronze',
                name: 'Ambassador',
                flavorText: 'Your first convert. The ripple begins.',
                iconKey: 'ambassador_bronze',
                tier: 1,
              },
            ],
            inviterUserId: 'inviter-uuid-777',
            miaMilestoneAdvanced: true,
          },
        },
      });
      const app = buildTestApp(makeClaimService(claimShare));
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/v1/route-shares/abcd1234/claim',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, unknown>;
      const rewards = body.rewards as Record<string, unknown>;
      expect(rewards.inviteeXpAwarded).toBe(50);
      expect(rewards.inviteeNewBadges).toEqual([]);
      // Inviter fields MUST NOT leak. Fastify's additionalProperties:false on
      // the rewards schema is the enforcement; this asserts it.
      expect(rewards).not.toHaveProperty('inviterXpAwarded');
      expect(rewards).not.toHaveProperty('inviterNewBadges');
      expect(rewards).not.toHaveProperty('inviterUserId');
      expect(rewards).not.toHaveProperty('miaMilestoneAdvanced');
      await app.close();
    });

    it('dispatches the inviter push notification with the full reward payload', async () => {
      const rewards = {
        inviteeXpAwarded: 50,
        inviteeNewBadges: [],
        inviterXpAwarded: 100,
        inviterNewBadges: [
          {
            badgeKey: 'ambassador_bronze',
            name: 'Ambassador',
            flavorText: 'Your first convert. The ripple begins.',
            iconKey: 'ambassador_bronze',
            tier: 1,
          },
        ],
        inviterUserId: 'inviter-uuid-777',
        miaMilestoneAdvanced: false,
      };
      const claimShare = vi
        .fn()
        .mockResolvedValue({ status: 'ok', data: { ...happyClaimPayload, rewards } });
      const app = buildTestApp(makeClaimService(claimShare));
      await app.ready();

      await app.inject({
        method: 'POST',
        url: '/v1/route-shares/abcd1234/claim',
        headers: authHeaders,
      });

      // Fire-and-forget: the call is initiated inside the handler but awaits
      // elsewhere. A microtask flush is enough because the handler uses
      // `void .catch(...)` and the mock is synchronous-resolved.
      await new Promise((r) => setImmediate(r));

      expect(dispatchAmbassadorRewardNotificationMock).toHaveBeenCalledTimes(1);
      const [[args]] = dispatchAmbassadorRewardNotificationMock.mock.calls;
      expect(args).toMatchObject({
        rewards,
        sharerDisplayName: 'Jane',
        inviteeDisplayName: null,
      });
      await app.close();
    });

    it('does not blow up when the rewards payload is absent (backward compat)', async () => {
      // The RPC is guaranteed to return a rewards object, but if for some
      // reason the Supabase client strips it, the route handler should still
      // reply cleanly with invitee-side defaults.
      const claimShare = vi.fn().mockResolvedValue({
        status: 'ok',
        data: { ...happyClaimPayload, rewards: emptyRewards },
      });
      const app = buildTestApp(makeClaimService(claimShare));
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/v1/route-shares/abcd1234/claim',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, unknown>;
      const rewards = body.rewards as Record<string, unknown>;
      expect(rewards.inviteeXpAwarded).toBeNull();
      expect(rewards.inviteeNewBadges).toEqual([]);
      await app.close();
    });

    it('passes through sharerDisplayName for the push-copy formatter', async () => {
      const rewards = {
        inviteeXpAwarded: null,
        inviteeNewBadges: [],
        inviterXpAwarded: 100,
        inviterNewBadges: [],
        inviterUserId: 'inviter-uuid-777',
        miaMilestoneAdvanced: true,
      };
      const claimShare = vi.fn().mockResolvedValue({
        status: 'ok',
        data: { ...happyClaimPayload, sharerDisplayName: 'Alice', rewards },
      });
      const app = buildTestApp(makeClaimService(claimShare));
      await app.ready();

      await app.inject({
        method: 'POST',
        url: '/v1/route-shares/abcd1234/claim',
        headers: authHeaders,
      });
      await new Promise((r) => setImmediate(r));

      const [[args]] = dispatchAmbassadorRewardNotificationMock.mock.calls;
      expect(args).toMatchObject({ sharerDisplayName: 'Alice' });
      await app.close();
    });
  });
});
