/**
 * Route-share API routes.
 *
 *   POST /v1/route-shares              (auth required)
 *   GET  /v1/route-shares/public/:code (public)
 *
 * Feature-flagged at `app.ts` via ENABLE_ROUTE_SHARES — when disabled, the
 * routes are not registered and the plugin is a no-op, which means any hit
 * on the paths above yields Fastify's default 404 (no route exposed).
 */

import type { ErrorResponse } from '@defensivepedal/core';
import { buildShareDeepLinks } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import {
  dispatchAmbassadorRewardNotification,
  dispatchFirstViewNotification,
} from '../lib/ambassadorRewards';
import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import {
  createRouteShareService,
  isBotUserAgent,
  type RouteShareService,
} from '../lib/routeShareService';
import {
  errorResponseSchema,
  mySharesResponseSchema,
  routeShareClaimParamsSchema,
  routeShareClaimResponseSchema,
  routeShareCreateRequestSchema,
  routeShareCreateResponseSchema,
  routeShareDeleteParamsSchema,
  routeSharePublicParamsSchema,
  routeSharePublicResponseSchema,
  routeShareViewBeaconResponseSchema,
  type MySharesResponse,
  type RouteShareClaimParams,
  type RouteShareClaimResponse,
  type RouteShareCreateRequest,
  type RouteShareCreateResponse,
  type RouteShareDeleteParams,
  type RouteSharePublicParams,
  type RouteSharePublicResponse,
  type RouteShareViewBeaconResponse,
} from '../lib/routeShareSchemas';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Slice 8: rate limit on the public view beacon. Keyed by IP (+ optional
// user agent via the memory rate limiter's bucket namespacing) so a single
// client can only bump view_count `PUBLIC_VIEW_LIMIT` times per window per
// share code. We enforce against (bucket, ip) rather than (ip, code) alone
// so bots/automation scripts that spray many codes still hit the ceiling.
const PUBLIC_VIEW_BUCKET = 'publicShareView';
const PUBLIC_VIEW_LIMIT = 60; // 60 beacons/min/ip is generous
const PUBLIC_VIEW_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new HttpError('Database unavailable.', {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }
  return supabaseAdmin;
};

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export type BuildRouteShareRoutesOptions = {
  /** Optional pre-built service. Defaults to one backed by supabaseAdmin. */
  service?: RouteShareService;
};

export const buildRouteShareRoutes = (
  dependencies: MobileApiDependencies,
  options: BuildRouteShareRoutesOptions = {},
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    const buildService = (): RouteShareService => {
      if (options.service) return options.service;
      const supabase = ensureSupabase();
      // Cast: supabaseAdmin is the full Supabase client; the service only
      // uses the subset declared in `SupabaseLike`.
      return createRouteShareService({
        supabase: supabase as unknown as Parameters<
          typeof createRouteShareService
        >[0]['supabase'],
      });
    };

    // -----------------------------------------------------------------------
    // POST /v1/route-shares
    // -----------------------------------------------------------------------
    app.post<{
      Body: RouteShareCreateRequest;
      Reply: RouteShareCreateResponse | ErrorResponse;
    }>(
      '/route-shares',
      {
        schema: {
          body: routeShareCreateRequestSchema,
          response: {
            200: routeShareCreateResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );

        const service = buildService();

        let row;
        try {
          row = await service.createShare({
            userId: user.id,
            request: request.body,
          });
        } catch (err) {
          request.log.error(
            { event: 'route_share_create_error', err: (err as Error).message },
            'route share creation failed',
          );
          throw new HttpError('Failed to create route share.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }

        const links = buildShareDeepLinks(row.code);

        return {
          id: row.id,
          code: row.code,
          source: row.source,
          appUrl: links.appUrl,
          webUrl: links.webUrl,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
        };
      },
    );

    // -----------------------------------------------------------------------
    // GET /v1/route-shares/public/:code
    // -----------------------------------------------------------------------
    app.get<{
      Params: RouteSharePublicParams;
      Reply: RouteSharePublicResponse | ErrorResponse;
    }>(
      '/route-shares/public/:code',
      {
        schema: {
          params: routeSharePublicParamsSchema,
          response: {
            200: routeSharePublicResponseSchema,
            404: errorResponseSchema,
            410: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const service = buildService();

        const result = await service.getPublicShare(request.params.code);

        if (result.ok === true) {
          return result.value as unknown as RouteSharePublicResponse;
        }

        // result is the error branch: { ok: false; error: PublicShareError }
        const errorCode: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' = (
          result as { ok: false; error: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' }
        ).error;

        if (errorCode === 'NOT_FOUND') {
          throw new HttpError('Route share not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        // EXPIRED and REVOKED both resolve to HTTP 410 Gone — the share
        // once existed but is no longer reachable.
        throw new HttpError(
          errorCode === 'EXPIRED'
            ? 'Route share has expired.'
            : 'Route share has been revoked.',
          {
            statusCode: 410,
            code: 'NOT_FOUND',
            details: [errorCode],
          },
        );
      },
    );

    // -----------------------------------------------------------------------
    // POST /v1/route-shares/:code/claim
    //
    // Authenticated — the invitee's user id is taken from the auth context,
    // not the request body. Anonymous Supabase sessions are accepted (same
    // pattern as POST /v1/route-shares) since the Habit Engine flow can
    // activate the invitee before they sign up for a full account.
    // -----------------------------------------------------------------------
    app.post<{
      Params: RouteShareClaimParams;
      Reply: RouteShareClaimResponse | ErrorResponse;
    }>(
      '/route-shares/:code/claim',
      {
        schema: {
          params: routeShareClaimParamsSchema,
          response: {
            200: routeShareClaimResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            410: errorResponseSchema,
            422: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );

        const service = buildService();

        let result;
        try {
          result = await service.claimShare({
            code: request.params.code,
            inviteeUserId: user.id,
          });
        } catch (err) {
          request.log.error(
            { event: 'route_share_claim_error', err: (err as Error).message },
            'claim_route_share RPC failed',
          );
          throw new HttpError('Failed to claim route share.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }

        if (result.status === 'ok') {
          // Fire-and-forget push to the sharer. Any failure is logged inside
          // dispatchNotification via notification_log, so we don't block the
          // claim response on it (best-effort — the reward rows are already
          // committed in the DB transaction by the time we get here).
          void dispatchAmbassadorRewardNotification({
            rewards: result.data.rewards,
            sharerDisplayName: result.data.sharerDisplayName,
            // The invitee display name is not currently surfaced in the RPC
            // return — using null falls back to "Someone" in the push copy.
            // A future refinement can wire it through if the push-copy UX
            // needs the real name.
            inviteeDisplayName: null,
          }).catch((err) => {
            request.log.warn(
              { event: 'ambassador_push_dispatch_failed', err: (err as Error).message },
              'Ambassador reward push dispatch failed',
            );
          });

          // Strip inviter-side reward fields before replying — the invitee
          // only ever sees their own XP/badge deltas and the slice-4
          // followPending flag. Fastify's schema validation rejects any
          // leaked inviter field as an additionalProperties violation
          // (belt and suspenders).
          const { inviterXpAwarded, inviterNewBadges, inviterUserId, miaMilestoneAdvanced, ...inviteeRewards } =
            result.data.rewards;
          void inviterXpAwarded;
          void inviterNewBadges;
          void inviterUserId;
          void miaMilestoneAdvanced;

          const response: RouteShareClaimResponse = {
            code: result.data.code,
            routePayload: result.data.routePayload as RouteShareClaimResponse['routePayload'],
            sharerDisplayName: result.data.sharerDisplayName,
            sharerAvatarUrl: result.data.sharerAvatarUrl,
            alreadyClaimed: result.data.alreadyClaimed,
            rewards: inviteeRewards,
          };
          return response;
        }

        if (result.status === 'not_found') {
          throw new HttpError('Route share not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        if (result.status === 'gone') {
          throw new HttpError(
            result.reason === 'expired'
              ? 'Route share has expired.'
              : 'Route share has been revoked.',
            {
              statusCode: 410,
              code: 'NOT_FOUND',
              details: [result.reason],
            },
          );
        }

        // result.status === 'invalid' — currently only self_referral
        throw new HttpError('Cannot claim your own route share.', {
          statusCode: 422,
          code: 'BAD_REQUEST',
          details: [result.reason],
        });
      },
    );

    // -----------------------------------------------------------------------
    // Slice 8: GET /v1/route-shares/mine
    //
    // Authenticated. Returns the caller's share rows (active + revoked,
    // newest first) plus the Ambassador lifetime aggregates.
    // -----------------------------------------------------------------------
    app.get<{ Reply: MySharesResponse | ErrorResponse }>(
      '/route-shares/mine',
      {
        schema: {
          response: {
            200: mySharesResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );

        const service = buildService();

        try {
          const result = await service.listMyShares(user.id);
          return result;
        } catch (err) {
          request.log.error(
            { event: 'route_share_list_mine_error', err: (err as Error).message },
            'listMyShares failed',
          );
          throw new HttpError('Failed to load your shared routes.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }
      },
    );

    // -----------------------------------------------------------------------
    // Slice 8: DELETE /v1/route-shares/:id
    //
    // Authenticated, owner-only. Non-owner and unknown id both resolve to
    // 404 (anti-enumeration, same rationale as the RPC). Idempotent: revoking
    // an already-revoked share still returns 204.
    // -----------------------------------------------------------------------
    app.delete<{ Params: RouteShareDeleteParams; Reply: ErrorResponse | undefined }>(
      '/route-shares/:id',
      {
        schema: {
          params: routeShareDeleteParamsSchema,
          response: {
            204: { type: 'null' },
            401: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );

        const service = buildService();

        let result;
        try {
          result = await service.revokeShare({
            id: request.params.id,
            userId: user.id,
          });
        } catch (err) {
          request.log.error(
            { event: 'route_share_revoke_error', err: (err as Error).message },
            'revokeShare failed',
          );
          throw new HttpError('Failed to revoke route share.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }

        if (result.status === 'not_found') {
          throw new HttpError('Route share not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        reply.code(204).send(undefined);
      },
    );

    // -----------------------------------------------------------------------
    // Slice 8: POST /v1/route-shares/:code/view
    //
    // Public, UA-filtered + per-IP throttled. Fires the first-view push
    // (best-effort) when the RPC reports firstView=true. Bot UAs and
    // throttled callers get `{ bumped: false, firstView: false }` with
    // HTTP 200 — we never reveal whether a code exists to a probable bot.
    // -----------------------------------------------------------------------
    app.post<{
      Params: RouteSharePublicParams;
      Reply: RouteShareViewBeaconResponse | ErrorResponse;
    }>(
      '/route-shares/:code/view',
      {
        schema: {
          params: routeSharePublicParamsSchema,
          response: {
            200: routeShareViewBeaconResponseSchema,
            404: errorResponseSchema,
            410: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const ua = request.headers['user-agent'] as string | undefined;
        if (isBotUserAgent(ua)) {
          return { bumped: false, firstView: false };
        }

        const rlDecision = await dependencies.rateLimiter.consume({
          bucket: PUBLIC_VIEW_BUCKET,
          key: buildRateLimitIdentity({ ip: request.ip }),
          limit: PUBLIC_VIEW_LIMIT,
          windowMs: PUBLIC_VIEW_WINDOW_MS,
        });
        if (!rlDecision.allowed) {
          return { bumped: false, firstView: false };
        }

        const service = buildService();

        let result;
        try {
          result = await service.recordView(request.params.code);
        } catch (err) {
          request.log.error(
            { event: 'route_share_view_error', err: (err as Error).message },
            'recordView failed',
          );
          throw new HttpError('Failed to record route share view.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }

        if (result.status === 'not_found') {
          throw new HttpError('Route share not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        if (result.status === 'gone') {
          throw new HttpError(
            result.reason === 'expired'
              ? 'Route share has expired.'
              : 'Route share has been revoked.',
            {
              statusCode: 410,
              code: 'NOT_FOUND',
              details: [result.reason],
            },
          );
        }

        // First view → fire-and-forget push to the sharer. Any failure is
        // logged inside dispatchNotification; we never block the beacon
        // response on push delivery (a push retry is cheaper than a view
        // beacon timeout).
        if (result.firstView) {
          void dispatchFirstViewNotification({
            sharerUserId: result.sharerUserId,
            shortCode: result.shortCode,
          }).catch((err) => {
            request.log.warn(
              { event: 'first_view_push_dispatch_failed', err: (err as Error).message },
              'First-view push dispatch failed',
            );
          });
        }

        return { bumped: result.bumped, firstView: result.firstView };
      },
    );
  };

  return routes;
};

// ---------------------------------------------------------------------------
// Feature flag — consulted once at route-registration time in app.ts.
// Default is ON per user decision.
// ---------------------------------------------------------------------------

export const isRouteSharesEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const raw = env.ENABLE_ROUTE_SHARES;
  if (raw == null) return true; // default on
  const normalized = raw.trim().toLowerCase();
  // Explicitly off only on the canonical falsy strings. Any other value
  // (including empty string and unknown tokens) keeps the route enabled so
  // a typo in Cloud Run env doesn't silently disable sharing.
  return !(normalized === 'false' || normalized === '0' || normalized === 'off');
};
