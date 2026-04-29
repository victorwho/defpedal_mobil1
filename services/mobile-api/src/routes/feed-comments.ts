import type { ErrorResponse, FeedComment, WriteAckResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { requireFullUser } from '../lib/auth';
import { sanitiseComment } from '../lib/commentSanitize';
import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  feedCommentRequestSchema,
  feedCommentsResponseSchema,
  type FeedCommentBody,
  type TripShareIdParams,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { checkContentAgainstFilter } from '../lib/moderationFilter';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { XP_VALUES } from '../lib/xp';
import { ensureSupabase, requireUser } from './feed-helpers';

export const buildFeedCommentRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // GET /feed/:id/comments
    app.get<{ Params: TripShareIdParams; Reply: { comments: FeedComment[] } | ErrorResponse }>(
      '/feed/:id/comments',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
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

        // Step 1: fetch comments (no embedded join — feed_comments.user_id references
        // auth.users, not profiles, so PostgREST can't resolve the relationship automatically)
        const { data: rows, error } = await db
          .from('feed_comments')
          .select('id, user_id, body, created_at')
          .eq('trip_share_id', request.params.id)
          .eq('is_hidden', false)
          .order('created_at', { ascending: true });

        if (error) {
          throw new HttpError('Failed to load comments.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const commentRows = rows ?? [];

        // Step 2: batch-fetch profiles for all unique commenter user IDs
        const userIds = [...new Set(commentRows.map((r) => r.user_id as string))];
        const profileMap = new Map<string, { display_name: string; username: string | null; avatar_url: string | null }>();

        if (userIds.length > 0) {
          const { data: profileRows, error: profileError } = await db
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', userIds);

          if (profileError) {
            // Non-fatal: comments still load, authors fall back to "Rider"
            request.log.warn(
              { event: 'comments_profile_lookup_failed', error: profileError.message },
              'profile batch lookup failed for comment authors',
            );
          }

          for (const p of profileRows ?? []) {
            profileMap.set(p.id as string, {
              display_name: p.display_name as string,
              username: (p.username as string) ?? null,
              avatar_url: (p.avatar_url as string) ?? null,
            });
          }
        }

        const comments: FeedComment[] = commentRows.map((row) => {
          const profile = profileMap.get(row.user_id as string) ?? null;
          return {
            id: row.id as string,
            user: {
              id: row.user_id as string,
              displayName: profile?.username ? `@${profile.username}` : (profile?.display_name ?? 'Rider'),
              avatarUrl: profile?.avatar_url ?? null,
            },
            body: row.body as string,
            createdAt: row.created_at as string,
          };
        });

        return { comments };
      },
    );

    // POST /feed/:id/comments
    app.post<{ Params: TripShareIdParams; Body: FeedCommentBody; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/comments',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
          body: feedCommentRequestSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Compliance plan item 7: anonymous Supabase sessions cannot post
        // comments. Switched from requireUser → requireFullUser. Tester
        // accounts that were anonymous-only will need to sign in with Google.
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
        // Auto-hide if either gate flagged. The post still lands so the user
        // doesn't see it disappear silently — filtering is per-row via
        // is_hidden so it's invisible to everyone except the moderator.
        const autoHide = sanitised.flagged || filterResult.flagged;

        const db = ensureSupabase();

        const { data: insertedRows, error } = await db
          .from('feed_comments')
          .insert([
            {
              trip_share_id: request.params.id,
              user_id: user.id,
              body: sanitised.body,
              is_hidden: autoHide,
            },
          ])
          .select('id')
          .single();

        if (error) {
          throw new HttpError('Comment failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // Auto-filter hit — queue a content_reports row so Victor reviews it
        // (fire-and-forget; the comment posted successfully).
        if (autoHide && insertedRows) {
          void (async () => {
            try {
              await db.from('content_reports').insert([
                {
                  reporter_user_id: user.id, // self-reported via auto-filter
                  target_type: 'comment',
                  target_id: insertedRows.id as string,
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
                'failed to insert auto-filter content_reports row',
              );
            }
          })();
        }

        // Fire-and-forget community notification to trip owner
        void (async () => {
          try {
            const { data: share } = await db
              .from('trip_shares')
              .select('user_id')
              .eq('id', request.params.id)
              .single();
            if (share && share.user_id !== user.id) {
              const { dispatchNotification } = await import('../lib/notifications');
              await dispatchNotification(share.user_id, 'community', {
                title: 'New comment on your trip 💬',
                body: request.body.body.trim().slice(0, 100),
                data: { type: 'community', tripShareId: request.params.id },
              });
            }
          } catch { /* ignore notification failures */ }
        })();

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'comment',
              p_base_xp: XP_VALUES.comment, p_multiplier: 1.0,
              p_source_id: request.params.id,
            }); } catch { /* non-fatal */ }
          })();
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

  };

  return routes;
};
