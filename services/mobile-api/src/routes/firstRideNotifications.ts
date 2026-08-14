import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { verifyCronAuth } from '../lib/cronAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  evaluateFirstRideNotifications,
  type FirstRideProfile,
} from '../lib/firstRideNotifications';
import { isAnonPushEnabled } from '../lib/nudges/killSwitch';
import { parseGeographyPoint } from '../lib/nudges/userLocation';

/**
 * profiles.preferred_locale is rolling out in a separate migration. Asking
 * PostgREST for a column that does not exist fails the WHOLE query, which
 * would take the cron down, so the select is attempted with the column and
 * retried without it. Drop the retry once the column is live everywhere.
 */
const BASE_PROFILE_COLUMNS = 'id, notify_mia, created_at, is_anonymous, notify_riding_tips';
const PROFILE_COLUMNS_WITH_LOCALE = `${BASE_PROFILE_COLUMNS}, preferred_locale`;

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
        verifyCronAuth(request);

        const db = ensureSupabase();

        // Consent-gated anonymous push (2026-07-16): registered users keep the
        // notify_mia gate exactly as before. Anonymous users are included ONLY
        // when the ANON_PUSH_ENABLED kill switch is on AND they explicitly
        // opted into riding tips (notify_riding_tips=true — the GDPR consent).
        // Before this gate the query's notify_mia=true default (TRUE for every
        // profile) silently included all anonymous users — 285 consent-less
        // sends had gone out by 2026-07-16.
        const CANDIDATE_LIMIT = 1000;
        const runCandidateQuery = async (columns: string) => {
          let candidateQuery = db.from('profiles').select(columns).eq('notify_mia', true);
          candidateQuery = isAnonPushEnabled()
            ? candidateQuery.or('is_anonymous.eq.false,notify_riding_tips.eq.true')
            : candidateQuery.eq('is_anonymous', false);
          return candidateQuery.limit(CANDIDATE_LIMIT);
        };

        let { data: profileRows, error: queryError } = await runCandidateQuery(
          PROFILE_COLUMNS_WITH_LOCALE,
        );
        if (queryError) {
          // Pre-migration deployments have no preferred_locale column; every
          // rider then gets English copy instead of a dead cron.
          ({ data: profileRows, error: queryError } = await runCandidateQuery(
            BASE_PROFILE_COLUMNS,
          ));
        }

        if ((profileRows?.length ?? 0) >= CANDIDATE_LIMIT) {
          // PostgREST caps unpaginated reads — hitting the limit means users
          // beyond row 1000 silently never get evaluated. Surface it loudly.
          request.log.warn(
            { event: 'firstride_candidate_limit_hit', limit: CANDIDATE_LIMIT },
            'first-ride candidate query hit its row limit — tail users skipped',
          );
        }

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

        const profiles = (profileRows ?? []) as unknown as Array<{
          id: string;
          notify_mia: boolean;
          created_at: string;
          is_anonymous: boolean | null;
          notify_riding_tips: boolean | null;
          preferred_locale?: string | null;
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

            // Compute last_ride_at from trips (no profiles.last_ride_at column).
            // post_first_ride and lapsed_reengagement gate on this; null is
            // treated as "never rode" by the evaluator.
            //
            // start_location rides along on the SAME row (no extra query) and
            // gives weather_invitation the rider's actual coordinates — it
            // sends nothing without them (G-25). PostgREST hands geography
            // columns back as WKB hex, so it must go through the shared
            // parser, never a `.lat ?? 0` read (error-log #70).
            const { data: lastTrip } = await db
              .from('trips')
              .select('ended_at, start_location')
              .eq('user_id', row.id)
              .not('ended_at', 'is', null)
              .order('ended_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const profile: FirstRideProfile = {
              id: row.id,
              total_rides: rideCount ?? 0,
              notify_mia: row.notify_mia,
              created_at: row.created_at,
              last_ride_at: (lastTrip?.ended_at as string | null | undefined) ?? null,
              is_anonymous: row.is_anonymous ?? false,
              preferred_locale: row.preferred_locale ?? null,
              location: parseGeographyPoint(lastTrip?.start_location),
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
