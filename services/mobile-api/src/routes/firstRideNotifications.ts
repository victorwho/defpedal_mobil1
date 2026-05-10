import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  evaluateFirstRideNotifications,
  type FirstRideProfile,
} from '../lib/firstRideNotifications';

interface NotificationEvaluateResponse {
  evaluated: number;
  notified: number;
}

const errorResponseSchema = {
  type: 'object',
  required: ['error', 'code'],
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
} as const;

const notificationEvaluateResponseSchema = {
  type: 'object',
  required: ['evaluated', 'notified'],
  properties: {
    evaluated: { type: 'number' },
    notified: { type: 'number' },
  },
} as const;

const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new HttpError('Supabase client unavailable.', {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }
  return supabaseAdmin;
};

/**
 * Daily cron endpoint that drives the four post-onboarding nudge templates
 * (first-ride / post-first-ride / weekend weather / lapsed-7d). Replaces the
 * legacy `/v1/mia/notifications/evaluate` Mia-persona-gated endpoint.
 *
 * Auth: Bearer CRON_SECRET. Cloud Scheduler hits this once per day.
 */
export const buildFirstRideNotificationRoutes = (
  _dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.post<{ Reply: NotificationEvaluateResponse | ErrorResponse }>(
      '/notifications/firstride/evaluate',
      {
        schema: {
          response: {
            200: notificationEvaluateResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const cronSecret = process.env.CRON_SECRET ?? '';
        if (!cronSecret) {
          throw new HttpError('Cron secret not configured.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
          });
        }

        const auth = request.headers.authorization;
        if (auth !== `Bearer ${cronSecret}`) {
          throw new HttpError('Unauthorized cron call.', {
            statusCode: 401,
            code: 'UNAUTHORIZED',
          });
        }

        const db = ensureSupabase();

        const { data: profileRows, error: queryError } = await db
          .from('profiles')
          .select('id, notify_mia, created_at, last_ride_at')
          .eq('notify_mia', true)
          .limit(1000);

        if (queryError) {
          request.log.error(
            { event: 'firstride_notification_query_error', error: queryError.message },
            'eligible user query failed',
          );
          throw new HttpError('Notification query failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            details: [queryError.message],
          });
        }

        const profiles = (profileRows ?? []) as Array<{
          id: string;
          notify_mia: boolean;
          created_at: string;
          last_ride_at: string | null;
        }>;

        let evaluated = 0;
        let notified = 0;

        for (const row of profiles) {
          try {
            // Count completed trips for this user — drives first_ride_nudge
            // and post_first_ride gating. Cheap because each user typically
            // has 0–single-digit trips when they're still in this funnel.
            const { count: rideCount } = await db
              .from('trips')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', row.id);

            const profile: FirstRideProfile = {
              id: row.id,
              total_rides: rideCount ?? 0,
              notify_mia: row.notify_mia,
              created_at: row.created_at,
              last_ride_at: row.last_ride_at,
            };

            const results = await evaluateFirstRideNotifications(db, profile);
            evaluated++;
            if (results.some((r) => r.sent)) {
              notified++;
            }
          } catch (err) {
            request.log.warn(
              {
                event: 'firstride_notification_error',
                userId: row.id,
                error: (err as Error).message,
              },
              'notification evaluation failed for user',
            );
          }
        }

        request.log.info(
          { event: 'firstride_notifications_complete', evaluated, notified },
          'first-ride notification evaluation complete',
        );

        return { evaluated, notified };
      },
    );
  };

  return routes;
};
