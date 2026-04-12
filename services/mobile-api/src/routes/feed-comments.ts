import type { ErrorResponse, FeedComment, WriteAckResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  feedCommentRequestSchema,
  feedCommentsResponseSchema,
  type FeedCommentBody,
  type TripShareIdParams,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
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
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { error } = await db
          .from('feed_comments')
          .insert([
            {
              trip_share_id: request.params.id,
              user_id: user.id,
              body: request.body.body.trim(),
            },
          ]);

        if (error) {
          throw new HttpError('Comment failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
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
