import type { ErrorResponse, WriteAckResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  type TripShareIdParams,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { XP_VALUES } from '../lib/xp';
import { ensureSupabase, requireUser } from './feed-helpers';

export const buildFeedReactionRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // POST /feed/:id/like
    app.post<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/like',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
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

        // A plain INSERT, so that a duplicate is reported as Postgres error
        // 23505 (unique_violation) rather than being silently absorbed. That
        // distinction is load-bearing: the side effects below (owner
        // notification, XP) used to fire unconditionally after an idempotent
        // UPSERT, so re-liking an already-liked ride re-awarded XP every time —
        // an unbounded XP farm, since this route has no rate limit.
        // See docs/plans/external-review-triage-2026-09-25.md P1-11.
        //
        // Deliberately NOT `.upsert(..., { ignoreDuplicates: true }).select()`:
        // that would make "was this new?" depend on how PostgREST combines
        // `Prefer: resolution=ignore-duplicates` with `return=representation`,
        // which is a subtler contract than an error code. 23505 is unambiguous,
        // and `routes/follow.ts:139` already relies on it here.
        const { error } = await db
          .from('feed_likes')
          .insert({ trip_share_id: request.params.id, user_id: user.id });

        // Already liked: acknowledge idempotently, award nothing, notify nobody.
        //
        // NOTE: this closes the re-like path only. Unlike-then-relike deletes the
        // row and so inserts a genuinely new one, which still re-awards, because
        // `award_xp` does not honour `p_source_id` (there is no unique key on
        // xp_events). Closing that needs the per-action idempotency decision
        // recorded under P1-11 — do NOT "fix" it by constraining xp_events, or
        // streak and quiz XP stop working (measured: 258 of 331 apparent
        // duplicates there are legitimate recurrences).
        if (error?.code === '23505') {
          return { acceptedAt: new Date().toISOString() };
        }

        if (error) {
          throw new HttpError('Like failed.', {
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
                title: 'Someone liked your ride! 🚴',
                body: 'A fellow cyclist appreciated your trip.',
                data: { type: 'community', tripShareId: request.params.id },
              });
            }
          } catch { /* ignore notification failures */ }
        })();

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'like',
              p_base_xp: XP_VALUES.like, p_multiplier: 1.0,
              p_source_id: request.params.id,
            }); } catch { /* non-fatal */ }
          })();
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // DELETE /feed/:id/like
    app.delete<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/like',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
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
          .from('feed_likes')
          .delete()
          .eq('trip_share_id', request.params.id)
          .eq('user_id', user.id);

        if (error) {
          throw new HttpError('Unlike failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // POST /feed/:id/love
    app.post<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/love',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
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
        // Reactions consolidated to a single "like" (review P3): /love is now an
        // alias that writes feed_likes, so old app versions tapping love create
        // likes and trip_loves never refills (love_count stays 0).
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        // Same unconditional-XP-after-idempotent-write bug as /feed/:id/like had,
        // and reachable by every OLD client still tapping love — so it gets the
        // same 23505 treatment. See the long note on the like route above and
        // docs/plans/external-review-triage-2026-09-25.md P1-11.
        const { error } = await db
          .from('feed_likes')
          .insert({ trip_share_id: request.params.id, user_id: user.id });
        if (error?.code === '23505') {
          return { acceptedAt: new Date().toISOString() };
        }
        if (error) throw new HttpError('Love failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'like',
              p_base_xp: XP_VALUES.like, p_multiplier: 1.0,
              p_source_id: request.params.id,
            }); } catch { /* non-fatal */ }
          })();
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // DELETE /feed/:id/love
    app.delete<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/love',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
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
        // Alias to feed_likes (reactions consolidated — see POST /love above).
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const { error } = await db.from('feed_likes').delete().eq('trip_share_id', request.params.id).eq('user_id', user.id);
        if (error) throw new HttpError('Unlove failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        return { acceptedAt: new Date().toISOString() };
      },
    );

  };

  return routes;
};
