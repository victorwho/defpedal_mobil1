import type {
  ActivityFeedItem,
  ActivityFeedResponse,
  ActivityType,
  ErrorResponse,
  FeedComment,
  RiderTierName,
  WriteAckResponse,
} from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import {
  activityFeedQuerystringSchema,
  activityFeedResponseSchema,
  activityIdParamsSchema,
  errorResponseSchema,
  reactRequestSchema,
  reactionTypeParamsSchema,
  type ActivityFeedQuerystring,
  type ActivityIdParams,
  type ReactBody,
  type ReactionTypeParams,
} from '../lib/activityFeedSchemas';
import { requireFullUser } from '../lib/auth';
import { sanitiseComment } from '../lib/commentSanitize';
import type { MobileApiDependencies } from '../lib/dependencies';
import { feedCommentRequestSchema, feedCommentsResponseSchema, type FeedCommentBody } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { checkContentAgainstFilter } from '../lib/moderationFilter';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { XP_VALUES } from '../lib/xp';
import { ensureSupabase, requireUser } from './feed-helpers';

const DEFAULT_FEED_LIMIT = 20;

// ---------------------------------------------------------------------------
// Helper: map RPC row to ActivityFeedItem
// ---------------------------------------------------------------------------

const mapActivityRow = (row: Record<string, unknown>): ActivityFeedItem => {
  const username = row.username as string | null;
  return {
    id: row.id as string,
    user: {
      id: row.user_id as string,
      displayName: username ? `@${username}` : (row.display_name as string) ?? 'Rider',
      avatarUrl: (row.avatar_url as string) ?? null,
      riderTier: (row.rider_tier as RiderTierName) ?? undefined,
    },
    type: row.type as ActivityType,
    payload: row.payload as ActivityFeedItem['payload'],
    createdAt: row.created_at as string,
    likeCount: Number(row.like_count ?? 0),
    loveCount: Number(row.love_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
    lovedByMe: Boolean(row.loved_by_me),
    score: Number(row.score ?? 0),
  } as unknown as ActivityFeedItem;
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const buildActivityFeedRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // ─────────────────────────────────────────────────────────────────────
    // GET /v2/feed — ranked blended activity feed
    // ─────────────────────────────────────────────────────────────────────
    app.get<{ Querystring: ActivityFeedQuerystring; Reply: ActivityFeedResponse | ErrorResponse }>(
      '/v2/feed',
      {
        schema: {
          querystring: activityFeedQuerystringSchema,
          response: {
            200: activityFeedResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, cursorScore, cursorId, limit: rawLimit } = request.query;
        const limit = rawLimit ?? DEFAULT_FEED_LIMIT;

        const { data, error } = await db.rpc('get_ranked_feed', {
          p_viewer_id: user.id,
          p_lat: lat,
          p_lon: lon,
          p_cursor_score: cursorScore ?? null,
          p_cursor_id: cursorId ?? null,
          p_limit: limit,
        });

        if (error) {
          request.log.error({ event: 'activity_feed_error', error: error.message }, 'ranked feed query failed');
          throw new HttpError('Feed query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        const items = rows.map(mapActivityRow);

        // Cursor: encode score + id for next page
        const lastItem = items[items.length - 1];
        const cursor = items.length === limit && lastItem
          ? `${lastItem.score}:${lastItem.id}`
          : null;

        return { items, cursor };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // POST /v2/feed/:id/react — add reaction (like or love)
    // ─────────────────────────────────────────────────────────────────────
    app.post<{ Params: ActivityIdParams; Body: ReactBody; Reply: WriteAckResponse | ErrorResponse }>(
      '/v2/feed/:id/react',
      {
        schema: {
          params: activityIdParamsSchema,
          body: reactRequestSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Reactions intentionally stay open to anonymous sessions (matches the
        // v1 sibling in feed-reactions.ts — likes are low-stakes and the app is
        // anonymous-first), but they must not be an unbounded write path
        // (audit 2026-07-05 SEC-4): throttle per caller on the 'write' bucket.
        const user = await requireUser(request, dependencies);

        const rl = await dependencies.rateLimiter.consume({
          bucket: 'write',
          key: buildRateLimitIdentity({ ip: request.ip, userId: user.id }),
          limit: dependencies.rateLimitPolicies.write.limit,
          windowMs: dependencies.rateLimitPolicies.write.windowMs,
        });
        reply.header('x-ratelimit-limit', rl.limit);
        reply.header('x-ratelimit-remaining', rl.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rl.resetAt / 1000));
        if (!rl.allowed) {
          throw new HttpError('Rate limit exceeded for reactions.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rl.retryAfterMs / 1000))} seconds.`],
          });
        }

        const db = ensureSupabase();

        // Reactions consolidated to a single "like" (review P3): coerce 'love'
        // to 'like' so old app versions sending love create likes and the love
        // reaction never refills.
        const reactionType = request.body.type === 'love' ? 'like' : request.body.type;

        const { error } = await db
          .from('activity_reactions')
          .upsert(
            {
              activity_id: request.params.id,
              user_id: user.id,
              reaction_type: reactionType,
            },
            { onConflict: 'activity_id,user_id,reaction_type' },
          );

        if (error) {
          throw new HttpError('Reaction failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try {
              await supabaseAdmin.rpc('award_xp', {
                p_user_id: user.id,
                p_action: reactionType,
                p_base_xp: XP_VALUES.like,
                p_multiplier: 1.0,
                p_source_id: request.params.id,
              });
            } catch { /* non-fatal */ }
          })();
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // DELETE /v2/feed/:id/react/:type — remove reaction
    // ─────────────────────────────────────────────────────────────────────
    app.delete<{ Params: ReactionTypeParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/v2/feed/:id/react/:type',
      {
        schema: {
          params: reactionTypeParamsSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Same throttling rationale as POST react above (audit SEC-4).
        const user = await requireUser(request, dependencies);

        const rl = await dependencies.rateLimiter.consume({
          bucket: 'write',
          key: buildRateLimitIdentity({ ip: request.ip, userId: user.id }),
          limit: dependencies.rateLimitPolicies.write.limit,
          windowMs: dependencies.rateLimitPolicies.write.windowMs,
        });
        reply.header('x-ratelimit-limit', rl.limit);
        reply.header('x-ratelimit-remaining', rl.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rl.resetAt / 1000));
        if (!rl.allowed) {
          throw new HttpError('Rate limit exceeded for reactions.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rl.retryAfterMs / 1000))} seconds.`],
          });
        }

        const db = ensureSupabase();

        // Coerce 'love' → 'like' (reactions consolidated — see POST react above).
        const reactionType = request.params.type === 'love' ? 'like' : request.params.type;

        const { error } = await db
          .from('activity_reactions')
          .delete()
          .eq('activity_id', request.params.id)
          .eq('user_id', user.id)
          .eq('reaction_type', reactionType);

        if (error) {
          throw new HttpError('Remove reaction failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // GET /v2/feed/:id/comments — paginated comments on an activity
    // ─────────────────────────────────────────────────────────────────────
    app.get<{ Params: ActivityIdParams; Reply: { comments: FeedComment[] } | ErrorResponse }>(
      '/v2/feed/:id/comments',
      {
        schema: {
          params: activityIdParamsSchema,
          response: {
            200: feedCommentsResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        // Step 1: fetch comment rows. We CANNOT use an embedded join like
        // `profiles!activity_comments_user_id_fkey(...)` because the FK on
        // `activity_comments.user_id` points at `auth.users(id)`, not at
        // `profiles(id)`. PostgREST rejects the embedded-resource syntax
        // when the named constraint doesn't connect to the requested table,
        // and the failure surfaces as an empty comment list to the client
        // (with the activity_feed.comment_count still showing the real
        // count, hence the "count says N, list shows 0" symptom).
        // Same workaround the legacy feed-comments endpoint uses.
        const { data: rows, error } = await db
          .from('activity_comments')
          .select('id, user_id, body, created_at')
          .eq('activity_id', request.params.id)
          // Auto-moderated comments are per-row hidden (visible only to the
          // moderator via service-role queries) — same model as feed_comments.
          .eq('is_hidden', false)
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) {
          throw new HttpError('Comments fetch failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const commentRows = rows ?? [];

        // Step 2: batch-fetch profiles for all unique commenter user IDs.
        const userIds = [...new Set(commentRows.map((r) => r.user_id as string))];
        const profileMap = new Map<
          string,
          {
            display_name: string;
            username: string | null;
            avatar_url: string | null;
            rider_tier: RiderTierName | null;
          }
        >();

        if (userIds.length > 0) {
          const { data: profileRows, error: profileError } = await db
            .from('profiles')
            .select('id, display_name, username, avatar_url, rider_tier')
            .in('id', userIds);

          if (profileError) {
            // Non-fatal: comments still load, authors fall back to "Rider".
            request.log.warn(
              { event: 'activity_comments_profile_lookup_failed', error: profileError.message },
              'profile batch lookup failed for activity-comment authors',
            );
          }

          for (const p of profileRows ?? []) {
            profileMap.set(p.id as string, {
              display_name: (p.display_name as string) ?? 'Rider',
              username: (p.username as string) ?? null,
              avatar_url: (p.avatar_url as string) ?? null,
              rider_tier: (p.rider_tier as RiderTierName) ?? null,
            });
          }
        }

        const comments: FeedComment[] = commentRows.map((row) => {
          const profile = profileMap.get(row.user_id as string) ?? null;
          return {
            id: row.id as string,
            user: {
              id: row.user_id as string,
              displayName: profile?.username
                ? `@${profile.username}`
                : profile?.display_name ?? 'Rider',
              avatarUrl: profile?.avatar_url ?? null,
              ...(profile?.rider_tier ? { riderTier: profile.rider_tier } : {}),
            },
            body: row.body as string,
            createdAt: row.created_at as string,
          };
        });

        return { comments };
      },
    );

    // ─────────────────────────────────────────────────────────────────────
    // POST /v2/feed/:id/comment — add comment to an activity
    // ─────────────────────────────────────────────────────────────────────
    app.post<{ Params: ActivityIdParams; Body: FeedCommentBody; Reply: WriteAckResponse | ErrorResponse }>(
      '/v2/feed/:id/comment',
      {
        schema: {
          params: activityIdParamsSchema,
          body: feedCommentRequestSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            403: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Review 2026-06-12 P1: this endpoint shipped with requireUser (which
        // admits anonymous Supabase sessions), no rate limit, and no content
        // moderation — while its v1 sibling (feed-comments.ts) enforces all
        // three per compliance plan item 7. Mirror the v1 pipeline exactly:
        // full account, 'comment' bucket, sanitise + filter with per-row
        // is_hidden auto-hide and a content_reports row for review.
        const user = await requireFullUser(request, dependencies.authenticateUser);

        const rl = await dependencies.rateLimiter.consume({
          bucket: 'comment',
          key: buildRateLimitIdentity({ userId: user.id }),
          limit: dependencies.rateLimitPolicies.comment.limit,
          windowMs: dependencies.rateLimitPolicies.comment.windowMs,
        });
        reply.header('x-ratelimit-limit', rl.limit);
        reply.header('x-ratelimit-remaining', rl.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rl.resetAt / 1000));
        if (!rl.allowed) {
          throw new HttpError('Rate limit exceeded for comments.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rl.retryAfterMs / 1000))} seconds.`],
          });
        }

        const sanitised = sanitiseComment(request.body.body);
        const filterResult = checkContentAgainstFilter(sanitised.body);
        const autoHide = sanitised.flagged || filterResult.flagged;

        const db = ensureSupabase();

        const { data: insertedRow, error } = await db
          .from('activity_comments')
          .insert({
            activity_id: request.params.id,
            user_id: user.id,
            body: sanitised.body,
            is_hidden: autoHide,
          })
          .select('id')
          .single();

        if (error) {
          throw new HttpError('Comment failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // Auto-filter hit — queue a content_reports row for moderator review
        // (fire-and-forget; the comment itself already landed, hidden).
        if (autoHide && insertedRow) {
          void (async () => {
            try {
              await db.from('content_reports').insert([
                {
                  reporter_user_id: user.id, // self-reported via auto-filter
                  target_type: 'comment',
                  target_id: insertedRow.id as string,
                  reason: filterResult.flagged ? 'hate' : 'spam',
                  details: filterResult.pattern
                    ? `auto-filter pattern: ${filterResult.pattern}`
                    : sanitised.reason
                      ? `auto-filter: ${sanitised.reason}`
                      : null,
                  auto_filter: true,
                },
              ]);
            } catch (autoFilterError) {
              request.log.warn(
                { event: 'auto_filter_report_insert_failed', err: autoFilterError },
                'failed to insert auto-filter content_reports row for activity comment',
              );
            }
          })();
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

  };

  return routes;
};
