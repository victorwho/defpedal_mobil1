import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { verifyCronAuth } from '../lib/cronAuth';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  evaluateFirstRideNotifications,
  loadFirstRideLogIndex,
  loadRiderTripFacts,
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
        // ⚠️ MEASURED 2026-09-26: 899 candidates against this cap of 1000 — 90%
        // of it, not the ~687 recorded when the cap was written. It is not
        // truncating yet, but it is close, and the alert below is now what makes
        // crossing it visible. Deliberately NOT raised in the same change: the
        // per-candidate evaluation cost has not been measured, and this is the
        // job that spent 8+ days returning 504 by doing too much per run
        // (error-log #82). Raise it with a measurement, not a guess.
        const CANDIDATE_LIMIT = 1000;
        const runCandidateQuery = async (columns: string) => {
          let candidateQuery = db.from('profiles').select(columns).eq('notify_mia', true);
          candidateQuery = isAnonPushEnabled()
            ? candidateQuery.or('is_anonymous.eq.false,notify_riding_tips.eq.true')
            : candidateQuery.eq('is_anonymous', false);
          // An unordered LIMIT leaves the window to the planner, so consecutive
          // runs could evaluate different arbitrary subsets and a rider could
          // sit outside every one of them indefinitely. DESCENDING is the
          // deliberate direction: three of the four templates here
          // (first_ride_nudge, post_first_ride, weather_invitation) are aimed at
          // recent signups, so if the cap is ever hit the rows that must survive
          // are the NEWEST. Ascending would have systematically dropped exactly
          // the cohort this cron exists for.
          return candidateQuery.order('created_at', { ascending: false }).limit(CANDIDATE_LIMIT);
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
          // beyond row 1000 silently never get evaluated.
          //
          // ⚠️ `error`, not `warn`. The GCP log-based alert policy fires on
          // `severity >= ERROR`, so at warn level this "surface it loudly" was
          // surfacing to nobody — it would have sat in the logs unread while the
          // tail of the fleet went unevaluated. `nudges.ts` made the same call
          // correctly in `reportIfTruncated`; this is the copy that drifted.
          request.log.error(
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

        // Everything the per-rider checks need, in a handful of `in (...)`
        // queries instead of ~6 sequential round-trips EACH.
        //
        // This job returned 504 at its 300 s deadline every single day for at
        // least 8 days (error-log #82). 687 candidates x ~6 queries x ~100 ms —
        // Supabase is in us-east-1, Cloud Run in europe-central2, so every
        // round-trip crosses the Atlantic — is ~410 s of pure latency. It always
        // died part-way through the same prefix of users, so the tail was never
        // evaluated at all, silently, for as long as the population has been
        // this size.
        const candidateIds = profiles.map((p) => p.id);
        const [logIndex, tripFacts] = await Promise.all([
          loadFirstRideLogIndex(db, candidateIds),
          loadRiderTripFacts(db, candidateIds),
        ]);

        for (const row of profiles) {
          try {
            // Trip facts come from the batch above. start_location rides along
            // on the same row and gives weather_invitation the rider's actual
            // coordinates — it sends nothing without them (G-25). PostgREST
            // hands geography columns back as WKB hex, so it must go through the
            // shared parser, never a `.lat ?? 0` read (error-log #70).
            const rideCount = tripFacts.rideCounts.get(row.id) ?? 0;
            const lastTrip = tripFacts.lastTrips.get(row.id);

            const profile: FirstRideProfile = {
              id: row.id,
              total_rides: rideCount,
              notify_mia: row.notify_mia,
              created_at: row.created_at,
              last_ride_at: (lastTrip?.ended_at as string | null | undefined) ?? null,
              is_anonymous: row.is_anonymous ?? false,
              preferred_locale: row.preferred_locale ?? null,
              location: parseGeographyPoint(lastTrip?.start_location),
            };

            const results = await evaluateFirstRideNotifications(db, profile, logIndex);
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
