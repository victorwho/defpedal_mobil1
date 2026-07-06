import type { ErrorResponse, FollowRequest, RiderTierName, SuggestedUser } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import {
  approveDeclineResponseSchema,
  errorResponseSchema,
  followActionResponseSchema,
  followRequestsResponseSchema,
  suggestedUsersQuerystringSchema,
  suggestedUsersResponseSchema,
  unfollowResponseSchema,
  userIdParamsSchema,
  type SuggestedUsersQuerystring,
  type UserIdParams,
} from '../lib/followSchemas';
import { HttpError } from '../lib/http';
import { ensureSupabase, requireFullUser, requireUser } from './feed-helpers';

// ---------------------------------------------------------------------------
// Rate limiting — follow-graph writes share the dedicated `follow` bucket so
// one account cannot mass-follow to spam notifications (audit 2026-07-05
// SEC-2). Mirrors the applyRateLimit helper in leaderboard.ts.
// ---------------------------------------------------------------------------

const applyFollowRateLimit = async (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: MobileApiDependencies,
  userId: string,
) => {
  const policy = dependencies.rateLimitPolicies.follow;
  const decision = await dependencies.rateLimiter.consume({
    bucket: 'follow',
    key: buildRateLimitIdentity({ ip: request.ip, userId }),
    limit: policy.limit,
    windowMs: policy.windowMs,
  });

  reply.header('x-ratelimit-limit', decision.limit);
  reply.header('x-ratelimit-remaining', decision.remaining);
  reply.header('x-ratelimit-reset', Math.ceil(decision.resetAt / 1000));
  if (decision.retryAfterMs > 0) {
    reply.header('retry-after', Math.max(1, Math.ceil(decision.retryAfterMs / 1000)));
  }

  if (!decision.allowed) {
    request.log.warn(
      { event: 'mobile_api_rate_limited', policy: 'follow', ip: request.ip, userId },
      'request rate limited',
    );
    throw new HttpError('Rate limit exceeded for this endpoint.', {
      statusCode: 429,
      code: 'RATE_LIMITED',
      details: [`Retry after ${Math.max(1, Math.ceil(decision.retryAfterMs / 1000))} seconds.`],
    });
  }
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const buildFollowRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // ─────────────────────────────────────────────────────────────────────
    // POST /users/:id/follow — follow a user (instant for public, pending for private)
    // ─────────────────────────────────────────────────────────────────────
    app.post<{ Params: UserIdParams }>(
      '/users/:id/follow',
      {
        schema: {
          params: userIdParamsSchema,
          response: {
            200: followActionResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Anonymous sessions cannot create follows — they'd appear in target
        // users' follow_requests / followers without an attributable identity.
        const user = await requireFullUser(request, dependencies);
        await applyFollowRateLimit(request, reply, dependencies, user.id);
        const db = ensureSupabase();
        const targetId = request.params.id;

        if (targetId === user.id) {
          throw new HttpError('Cannot follow yourself.', { statusCode: 400, code: 'BAD_REQUEST' });
        }

        // Check if target exists and whether they're private
        const { data: targetProfile, error: profileError } = await db
          .from('profiles')
          .select('id, is_private, display_name')
          .eq('id', targetId)
          .single();

        if (profileError || !targetProfile) {
          throw new HttpError('User not found.', { statusCode: 404, code: 'NOT_FOUND' });
        }

        const isPrivate = Boolean(targetProfile.is_private);
        const followStatus = isPrivate ? 'pending' : 'accepted';

        // Check if already following/pending
        const { data: existing } = await db
          .from('user_follows')
          .select('status')
          .eq('follower_id', user.id)
          .eq('following_id', targetId)
          .single();

        if (existing) {
          // Already exists — return current status
          return {
            status: existing.status as string,
            actionAt: new Date().toISOString(),
          };
        }

        const { error: insertError } = await db
          .from('user_follows')
          .insert({
            follower_id: user.id,
            following_id: targetId,
            status: followStatus,
          });

        if (insertError) {
          if (insertError.code === '23505') {
            // Already following (race condition)
            return { status: followStatus, actionAt: new Date().toISOString() };
          }
          throw new HttpError('Follow failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [insertError.message],
          });
        }

        // Send push notification for private profile follow requests
        if (isPrivate) {
          void (async () => {
            try {
              // Get requester's display name
              const { data: requesterProfile } = await db
                .from('profiles')
                .select('display_name, username')
                .eq('id', user.id)
                .single();

              const requesterName = requesterProfile?.username
                ? `@${requesterProfile.username}`
                : (requesterProfile?.display_name as string) ?? 'A rider';

              const { dispatchNotification } = await import('../lib/notifications');
              await dispatchNotification(targetId, 'community', {
                title: 'New follow request',
                body: `${requesterName} wants to follow you.`,
                data: { type: 'follow_request', requesterId: user.id },
              });
            } catch { /* non-fatal */ }
          })();
        }

        return { status: followStatus, actionAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // DELETE /users/:id/follow — unfollow
    // ─────────────────────────────────────────────────────────────────────
    app.delete<{ Params: UserIdParams }>(
      '/users/:id/follow',
      {
        schema: {
          params: userIdParamsSchema,
          response: {
            200: unfollowResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies);
        await applyFollowRateLimit(request, reply, dependencies, user.id);
        const db = ensureSupabase();

        await db
          .from('user_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', request.params.id);

        return { unfollowedAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // POST /users/:id/follow/approve — approve pending follow request
    // ─────────────────────────────────────────────────────────────────────
    app.post<{ Params: UserIdParams }>(
      '/users/:id/follow/approve',
      {
        schema: {
          params: userIdParamsSchema,
          response: {
            200: approveDeclineResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies);
        await applyFollowRateLimit(request, reply, dependencies, user.id);
        const db = ensureSupabase();
        const requesterId = request.params.id;

        // The current user is the target (the one being followed)
        const { data, error } = await db
          .from('user_follows')
          .update({ status: 'accepted' })
          .eq('follower_id', requesterId)
          .eq('following_id', user.id)
          .eq('status', 'pending')
          .select('follower_id')
          .single();

        if (error || !data) {
          throw new HttpError('Follow request not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        return { actionAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // POST /users/:id/follow/decline — decline pending follow request
    // ─────────────────────────────────────────────────────────────────────
    app.post<{ Params: UserIdParams }>(
      '/users/:id/follow/decline',
      {
        schema: {
          params: userIdParamsSchema,
          response: {
            200: approveDeclineResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies);
        await applyFollowRateLimit(request, reply, dependencies, user.id);
        const db = ensureSupabase();
        const requesterId = request.params.id;

        // Delete the pending request (requester can re-request later)
        const { error } = await db
          .from('user_follows')
          .delete()
          .eq('follower_id', requesterId)
          .eq('following_id', user.id)
          .eq('status', 'pending');

        if (error) {
          throw new HttpError('Decline failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { actionAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // GET /profile/follow-requests — pending incoming follow requests
    // ─────────────────────────────────────────────────────────────────────
    app.get<{ Reply: { requests: FollowRequest[] } | ErrorResponse }>(
      '/profile/follow-requests',
      {
        schema: {
          response: {
            200: followRequestsResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        // We CANNOT embed `profiles!user_follows_follower_id_fkey(...)` — the FK
        // on user_follows.follower_id points at auth.users(id), not profiles(id),
        // so PostgREST returns "Could not find a relationship between
        // 'user_follows' and 'profiles'" → a 500 on every account with a pending
        // request (surfaced in Sentry 2026-06-14). Two-query + in-memory join
        // instead, the same workaround activity-feed comments uses.
        const { data: pending, error } = await db
          .from('user_follows')
          .select('follower_id, created_at, source')
          .eq('following_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          throw new HttpError('Failed to load follow requests.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const pendingRows = pending ?? [];
        const followerIds = [...new Set(pendingRows.map((r) => r.follower_id as string))];

        const profileMap = new Map<string, Record<string, unknown>>();
        if (followerIds.length > 0) {
          const { data: profileRows, error: profileError } = await db
            .from('profiles')
            .select('id, display_name, username, avatar_url, rider_tier')
            .in('id', followerIds);

          if (profileError) {
            throw new HttpError('Failed to load follow requests.', {
              statusCode: 502,
              code: 'UPSTREAM_ERROR',
              details: [profileError.message],
            });
          }

          for (const p of profileRows ?? []) {
            profileMap.set(p.id as string, p as Record<string, unknown>);
          }
        }

        const requests: FollowRequest[] = pendingRows.map((row) => {
          const profile = profileMap.get(row.follower_id as string) ?? null;
          const username = profile?.username as string | null;
          // Slice 4: user_follows.source='route_share_claim' tags pending
          // follows produced by claim_route_share against a private sharer.
          // Surface a human-readable subtitle so the Follow Requests UI can
          // render "Signed up via your shared route" under the timestamp.
          // Anything else (NULL = standard manual follow) leaves `context`
          // undefined and the UI renders nothing extra.
          const source = (row as Record<string, unknown>).source as string | null | undefined;
          const context =
            source === 'route_share_claim'
              ? 'Signed up via your shared route'
              : undefined;
          return {
            id: row.follower_id as string,
            user: {
              id: row.follower_id as string,
              displayName: username ? `@${username}` : (profile?.display_name as string) ?? 'Rider',
              avatarUrl: (profile?.avatar_url as string) ?? null,
              riderTier: (profile?.rider_tier as RiderTierName) ?? undefined,
            },
            requestedAt: row.created_at as string,
            ...(context ? { context } : {}),
          };
        });

        return { requests };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // GET /feed/suggested-users — suggested users for the viewer
    // ─────────────────────────────────────────────────────────────────────
    app.get<{ Querystring: SuggestedUsersQuerystring; Reply: { users: SuggestedUser[] } | ErrorResponse }>(
      '/feed/suggested-users',
      {
        schema: {
          querystring: suggestedUsersQuerystringSchema,
          response: {
            200: suggestedUsersResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, limit: rawLimit } = request.query;
        const limit = rawLimit ?? 10;

        const { data, error } = await db.rpc('get_suggested_users', {
          p_viewer_id: user.id,
          p_lat: lat,
          p_lon: lon,
          p_limit: limit,
        });

        if (error) {
          request.log.error({ event: 'suggested_users_error', error: error.message }, 'suggested users query failed');
          throw new HttpError('Suggested users query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const users: SuggestedUser[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: row.user_id as string,
          displayName: (row.display_name as string) ?? 'Rider',
          avatarUrl: (row.avatar_url as string) ?? null,
          riderTier: (row.rider_tier as RiderTierName) ?? undefined,
          activityCount: Number(row.activity_count ?? 0),
          mutualFollows: Number(row.mutual_follows ?? 0),
        }));

        return { users };
      },
    );

  };

  return routes;
};
