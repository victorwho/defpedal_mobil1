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

        const { error } = await db
          .from('feed_likes')
          .upsert(
            { trip_share_id: request.params.id, user_id: user.id },
            { onConflict: 'trip_share_id,user_id' },
          );

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
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const { error } = await db.from('trip_loves').upsert(
          { trip_share_id: request.params.id, user_id: user.id },
          { onConflict: 'trip_share_id,user_id' },
        );
        if (error) throw new HttpError('Love failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'love',
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
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const { error } = await db.from('trip_loves').delete().eq('trip_share_id', request.params.id).eq('user_id', user.id);
        if (error) throw new HttpError('Unlove failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        return { acceptedAt: new Date().toISOString() };
      },
    );

  };

  return routes;
};
