import type { ErrorResponse, FollowRequest, RiderTierName, SuggestedUser } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
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
import { ensureSupabase, requireUser } from './feed-helpers';

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
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
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
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
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
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
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
            404: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
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

        const { data, error } = await db
          .from('user_follows')
          .select(`
            follower_id,
            created_at,
            profiles!user_follows_follower_id_fkey (
              id,
              display_name,
              username,
              avatar_url,
              rider_tier
            )
          `)
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

        const requests: FollowRequest[] = (data ?? []).map((row) => {
          const profile = row.profiles as unknown as Record<string, unknown> | null;
          const username = profile?.username as string | null;
          return {
            id: row.follower_id as string,
            user: {
              id: row.follower_id as string,
              displayName: username ? `@${username}` : (profile?.display_name as string) ?? 'Rider',
              avatarUrl: (profile?.avatar_url as string) ?? null,
              riderTier: (profile?.rider_tier as RiderTierName) ?? undefined,
            },
            requestedAt: row.created_at as string,
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
