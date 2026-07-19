/**
 * Pedal Nudge — routes.
 *
 *   POST /v1/nudges/evaluate          (cron, Bearer CRON_SECRET)
 *   POST /v1/nudges/event             (internal P0 trigger, Bearer CRON_SECRET)
 *   POST /v1/nudges/telemetry         (mobile, Bearer user JWT)
 *   POST /v1/nudges/recompute-pattern (cron, Bearer CRON_SECRET)
 *
 * The cron `evaluate` loop in Phase 1 wires three triggers:
 *   - streak_at_risk_mild / dramatic
 *   - milestone_celebration
 *
 * Phase 2 adds: daily_ride_reminder, badge_proximity, lapsed_reengagement,
 * community_signal. The priority queue + dispatcher are forward-compatible.
 *
 * Anonymous gating: enforced by the mobile API caller for P0 events
 * (requireFullUser upstream), and at the cron level by the fact that
 * anonymous Supabase users typically have no display_name and rarely
 * sustain a multi-day streak. Per the locked spec they're meant to see
 * NOTHING — the signup flow upstream is the canonical gate.
 */

import type { ErrorResponse, NudgeTrigger } from '@defensivepedal/core';
import {
  CITY_PULSE_FALLBACK_POPULATION,
  CITY_PULSE_ROTATION_MEMORY,
  computeCityRiderCount,
  computeRidePattern,
  drawInitialFireAt,
  drawNextFireAt,
  getCityPulseWeatherFactor,
  getTriggerPriority,
  isAfterSunset,
  isBadCyclingWeather,
  isGuaranteeBreached,
  isMilestoneDay,
  localDateISO,
  pickMessage,
  type NudgeContext,
  type NudgeLocale,
  type NudgePriority,
} from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { verifyBearerSecret } from '../lib/cronAuth';
import { fetchCyclingForecast } from '../lib/clients/openMeteo';
import { cityKey, findNearestCity } from '../lib/nudges/cities';
import { dispatchNudge } from '../lib/nudges/dispatcher';
import { evaluateEligibility, type UserNudgeProfile } from '../lib/nudges/eligibility';
import { areNudgesEnabled, isCityPulseEnabled } from '../lib/nudges/killSwitch';
import { pickHighestPriorityTrigger } from '../lib/nudges/priorityQueue';
import { resolveUserLocation, type UserLocation } from '../lib/nudges/userLocation';
import {
  errorResponseSchema,
  nudgesAttributeRequestSchema,
  nudgesAttributeResponseSchema,
  nudgesEvaluateRequestSchema,
  nudgesEvaluateResponseSchema,
  nudgesEventRequestSchema,
  nudgesEventResponseSchema,
  nudgesRecomputePatternRequestSchema,
  nudgesRecomputePatternResponseSchema,
  nudgesTelemetryRequestSchema,
  nudgesTelemetryResponseSchema,
} from '../lib/nudgeSchemas';
import { requireAuthenticatedUser } from '../lib/auth';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Timing-safe shared implementation (review 2026-06-12) — lib/cronAuth.ts.
const ensureCronAuth = (auth: string | undefined) => {
  verifyBearerSecret(auth, process.env.CRON_SECRET);
};

const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new HttpError('Supabase client unavailable.', {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }
  return supabaseAdmin;
};

const fetchPushTokens = async (userId: string): Promise<string[]> => {
  const db = ensureSupabase();
  const { data, error } = await db
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId);
  if (error || !data) return [];
  return (data as Array<{ expo_push_token: string }>).map((r) => r.expo_push_token);
};

interface ProfileRow {
  id: string;
  display_name: string | null;
  notify_pedal_nudges: boolean | null;
  notify_streak: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
  pedal_voice_sassy: boolean | null;
  is_anonymous: boolean | null;
  notify_riding_tips: boolean | null;
}

const toUserNudgeProfile = (row: ProfileRow): UserNudgeProfile => ({
  userId: row.id,
  // 2026-07-16 (consent-gated anonymous push): the old code hardcoded
  // `hasEmail: true` on the claim that "anonymous gating happens upstream" —
  // it did NOT (anonymous users have streaks/trips, so they enter the
  // candidate buckets, and 323 of 439 production push tokens belonged to
  // anonymous users). `profiles.is_anonymous` is trigger-maintained and
  // verified in sync with auth.users (984/984, 2026-07-16), so eligibility
  // now sees the real signal and enforces the anonymous whitelist + the
  // notify_riding_tips consent gate itself.
  hasEmail: !(row.is_anonymous ?? false),
  notifyRidingTips: row.notify_riding_tips ?? false,
  notifyPedalNudges: row.notify_pedal_nudges ?? true,
  notifyStreak: row.notify_streak ?? true,
  quietHoursStart: row.quiet_hours_start ?? '22:00',
  quietHoursEnd: row.quiet_hours_end ?? '07:00',
  timezone: row.quiet_hours_timezone ?? 'Europe/Bucharest',
});

const PROFILE_COLUMNS =
  'id, display_name, notify_pedal_nudges, notify_streak, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, pedal_voice_sassy, is_anonymous, notify_riding_tips';

/**
 * Triggers whose intended follow-up action is "complete a ride / qualify
 * streak today". The /attribute sweep checks for a trip_tracks row
 * created after sent_at to set action_completed_at.
 *
 * Non-actionable triggers (post_ride_celebration, post_hazard_thanks,
 * milestone_celebration, badge_proximity, community_signal) celebrate or
 * inform — the user already took the action that triggered them, so
 * attribution doesn't apply.
 */
const ACTIONABLE_TRIGGERS: readonly NudgeTrigger[] = [
  'streak_at_risk_mild',
  'streak_at_risk_dramatic',
  'daily_ride_reminder',
  'lapsed_reengagement',
  'streak_lost_apology',
  // Social-proof ride ask — "join them?" means a completed ride counts as
  // the attributed action (plan doc §Telemetry).
  'city_riders_pulse',
];

// ---------------------------------------------------------------------------
// Build routes
// ---------------------------------------------------------------------------

export const buildNudgeRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const verifyAccessToken = dependencies.authenticateUser;

  return async (app) => {
    // ───────────────────────── POST /v1/nudges/event (P0 fast path) ─────────────────────────
    app.post<{
      Body: {
        userId: string;
        trigger: NudgeTrigger;
        context?: NudgeContext;
        locale?: NudgeLocale;
      };
      Reply:
        | {
            nudgeLogId: string | null;
            outcome: string;
            ticketId: string | null;
          }
        | ErrorResponse;
    }>(
      '/nudges/event',
      {
        schema: {
          body: nudgesEventRequestSchema,
          response: {
            200: nudgesEventResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        ensureCronAuth(request.headers.authorization);

        if (!areNudgesEnabled()) {
          request.log.info({ event: 'nudge_event_kill_switch' }, 'nudges disabled — /event no-op');
          return { nudgeLogId: null, outcome: 'cancelled_kill_switch', ticketId: null };
        }

        const db = ensureSupabase();

        const { userId, trigger, context = {}, locale = 'en' } = request.body;

        const { data: profileRow } = await db
          .from('profiles')
          .select(PROFILE_COLUMNS)
          .eq('id', userId)
          .maybeSingle();

        if (!profileRow) {
          throw new HttpError('Unknown user.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        const typed = profileRow as ProfileRow;
        const profile = toUserNudgeProfile(typed);
        const priority = getTriggerPriority(trigger);

        const elig = evaluateEligibility({
          trigger,
          priority,
          profile,
          window: {
            pushesLast24h: 0, // P0 ignores this
            badWeatherNow: false,
            afterSunset: false,
            qualifiedStreakToday: false,
          },
        });

        const tokens = elig.eligible ? await fetchPushTokens(userId) : [];

        const mergedContext: NudgeContext = {
          riderName: context.riderName ?? typed.display_name ?? undefined,
          city: context.city,
          streakCount: context.streakCount,
          milestoneDay: context.milestoneDay,
          badgeLabel: context.badgeLabel,
          lapsedDays: context.lapsedDays,
        };

        const dispatchOutcome = elig.eligible ? 'scheduled' : elig.outcome;

        const result = await dispatchNudge(db, {
          userId,
          trigger,
          context: mergedContext,
          locale,
          sassy: typed.pedal_voice_sassy ?? true,
          pushTokens: tokens,
          outcome: dispatchOutcome as Parameters<typeof dispatchNudge>[1]['outcome'],
        });

        return {
          nudgeLogId: result.nudgeLogId,
          outcome: result.outcome,
          ticketId: result.ticketId,
        };
      },
    );

    // ───────────────────────── POST /v1/nudges/evaluate (cron) ─────────────────────────
    app.post<{
      Reply: { evaluated: number; sent: number; suppressed: number } | ErrorResponse;
    }>(
      '/nudges/evaluate',
      {
        schema: {
          body: nudgesEvaluateRequestSchema,
          response: {
            200: nudgesEvaluateResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        ensureCronAuth(request.headers.authorization);

        if (!areNudgesEnabled()) {
          request.log.info({ event: 'nudge_evaluate_kill_switch' }, 'nudges disabled — /evaluate no-op');
          return { evaluated: 0, sent: 0, suppressed: 0 };
        }

        const db = ensureSupabase();

        // City Riders Pulse: seed nudge_schedule rows for riders who became
        // eligible (first completed trip) since the last tick. Organic-only —
        // dormant riders get seeded when they next ride.
        if (isCityPulseEnabled()) {
          await seedCityPulseSchedules(db, request.log);
        }

        const userCandidates = await buildUserCandidateMap(db, request.log);

        let evaluated = 0;
        let sent = 0;
        let suppressed = 0;

        for (const [userId, ctx] of userCandidates) {
          try {
            const { data: profileRow } = await db
              .from('profiles')
              .select(PROFILE_COLUMNS)
              .eq('id', userId)
              .maybeSingle();
            if (!profileRow) continue;

            const typed = profileRow as ProfileRow;
            const profile = toUserNudgeProfile(typed);
            const sassy = typed.pedal_voice_sassy ?? true;
            evaluated++;

            const qualifiedToday = isQualifiedTodayInTz(
              ctx.lastQualifyingDate,
              profile.timezone,
            );

            // Filter candidates that depend on qualified-today state.
            const liveCandidates = ctx.candidates.filter((c) => {
              if (c === 'streak_at_risk_mild' || c === 'streak_at_risk_dramatic') {
                return !qualifiedToday;
              }
              return true;
            });

            // daily_ride_reminder: load this user's ride pattern and add
            // the candidate if (a) we have a confident pattern, (b) the
            // current local hour is ~1h before their typical start, (c)
            // they haven't qualified today, and (d) we haven't already
            // fired this trigger in the last 22h.
            if (!qualifiedToday) {
              const shouldAddDailyRide = await isDailyRideReminderEligible(
                db,
                userId,
                profile.timezone,
              );
              if (shouldAddDailyRide) {
                liveCandidates.push('daily_ride_reminder');
              }
            }

            // community_signal: surface a once-per-week ping when the
            // rider's leaderboard rank dropped ≥3 positions between the
            // two most recent weekly snapshots. Skip if we already fired
            // it this week.
            const shouldAddCommunitySignal = await isCommunitySignalEligible(
              db,
              userId,
            );
            if (shouldAddCommunitySignal) {
              liveCandidates.push('community_signal');
            }

            if (liveCandidates.length === 0) continue;

            const pushesLast24h = await countPushesLast24h(db, userId);

            // Safety floor: resolve the rider's lat/lon (recent trip start
            // or Bucharest fallback) and check sunset + bad-weather. Both
            // checks fail closed on missing data — eligibility suppresses
            // the ride-asking triggers when conditions are unknown.
            const location = await resolveUserLocation(db, userId);
            const afterSunset = isAfterSunset(location.lat, location.lon);
            const forecast = await fetchCyclingForecast(location.lat, location.lon);
            const badWeatherNow = forecast ? isBadCyclingWeather(forecast) : true;

            // City Riders Pulse guarantee: past 5 days unsent → escalate the
            // candidate to P2 so it wins the next allowed slot.
            const hasCityPulse = liveCandidates.includes('city_riders_pulse');
            const priorityOverrides =
              hasCityPulse && isGuaranteeBreached(ctx.cityPulseLastSentAt ?? null)
                ? ({ city_riders_pulse: 2 as NudgePriority } as const)
                : undefined;

            const decision = pickHighestPriorityTrigger({
              candidates: liveCandidates,
              profile,
              window: {
                pushesLast24h,
                badWeatherNow,
                afterSunset,
                qualifiedStreakToday: qualifiedToday,
              },
              // Cron path: cron-sourced P0 (milestone backstop) must respect
              // quiet hours so it never buzzes overnight (review 2026-06-12).
              enforceQuietHours: true,
              priorityOverrides,
            });

            const baseContext: NudgeContext = {
              riderName: typed.display_name ?? undefined,
              streakCount: ctx.streakCount,
              milestoneDay: isMilestoneDay(ctx.streakCount) ? ctx.streakCount : undefined,
              lapsedDays: ctx.lapsedDays,
            };

            // Log each suppressed candidate for funnel visibility.
            for (const considered of decision.considered) {
              if (decision.trigger === considered.trigger) continue;
              if (considered.result.eligible) continue;
              await dispatchNudge(db, {
                userId,
                trigger: considered.trigger,
                context: baseContext,
                locale: 'en',
                sassy,
                pushTokens: [],
                outcome: considered.result.outcome as Parameters<typeof dispatchNudge>[1]['outcome'],
              });
              suppressed++;
            }

            // City pulse lost the slot or was suppressed this tick: transient
            // outcomes (weather/sunset/quiet-hours/cap/slot) leave the schedule
            // due so it retries next tick; permanent-ish gates (consent off,
            // anonymous, no device) redraw 1–5 days out to avoid tick-spam.
            if (hasCityPulse && decision.trigger !== 'city_riders_pulse') {
              const pulseConsidered = decision.considered.find(
                (c) => c.trigger === 'city_riders_pulse',
              );
              const pulseOutcome =
                pulseConsidered && !pulseConsidered.result.eligible
                  ? pulseConsidered.result.outcome
                  : 'lost_slot';
              await updateCityPulseSchedule(db, userId, pulseOutcome, location);
            }

            if (!decision.trigger) continue;

            const tokens = await fetchPushTokens(userId);

            // City pulse dispatch extras: the synthetic N (deterministic per
            // city+date), the rotation inputs, and the escalated priority.
            let dispatchContext = baseContext;
            let sendDateISO: string | undefined;
            let recentVariantIds: readonly string[] | undefined;
            let priorityOverride: NudgePriority | undefined;
            if (decision.trigger === 'city_riders_pulse') {
              const city = findNearestCity(location.lat, location.lon);
              const utcOffsetHours = city?.utcOffsetHours ?? 2;
              const dateISO = localDateISO(new Date(), utcOffsetHours);
              // Bad weather is suppressed upstream by the safety floor, so the
              // factor here grades 0.4 (borderline) to 1.0 (good) by the worst
              // forecast dimension; the ?? is defensive (missing forecast).
              const weatherFactor = getCityPulseWeatherFactor(forecast) ?? 0.6;
              const key = city
                ? cityKey(city)
                : `fallback|${location.lat.toFixed(1)},${location.lon.toFixed(1)}`;
              const count = computeCityRiderCount(
                key,
                city?.population ?? CITY_PULSE_FALLBACK_POPULATION,
                city?.countryCode ?? '',
                dateISO,
                weatherFactor,
              );
              recentVariantIds = await fetchRecentCityPulseVariants(db, userId);
              sendDateISO = dateISO;
              priorityOverride = priorityOverrides?.city_riders_pulse;
              dispatchContext = {
                ...baseContext,
                // city undefined → pedalVoice renders its localized
                // "your city" fallback instead of a wrong name.
                city: city?.name,
                n: count.n,
                rate: Math.round(count.rate * 10000) / 10000,
                weatherFactor,
              };
              // Mirror the deterministic variant id into nudge_log.context —
              // dispatchNudge re-derives the identical pick from the same
              // rotation inputs.
              const preview = pickMessage({
                trigger: 'city_riders_pulse',
                locale: 'en',
                context: dispatchContext,
                sassy,
                userId,
                sendDateISO,
                recentVariantIds,
              });
              dispatchContext = { ...dispatchContext, variantId: preview.variantId };
            }

            const dispatchResult = await dispatchNudge(db, {
              userId,
              trigger: decision.trigger,
              context: dispatchContext,
              locale: 'en',
              sassy,
              pushTokens: tokens,
              outcome: 'scheduled',
              priorityOverride,
              sendDateISO,
              recentVariantIds,
            });

            if (decision.trigger === 'city_riders_pulse') {
              await updateCityPulseSchedule(db, userId, dispatchResult.outcome, location);
            }

            if (dispatchResult.outcome === 'sent') sent++;
            else suppressed++;
          } catch (err) {
            request.log.warn(
              {
                event: 'nudge_evaluate_user_error',
                userId,
                error: (err as Error).message,
              },
              'evaluation failed for user',
            );
          }
        }

        request.log.info(
          { event: 'nudge_evaluate_complete', evaluated, sent, suppressed },
          'nudges/evaluate complete',
        );

        return { evaluated, sent, suppressed };
      },
    );

    // ───────────────────────── POST /v1/nudges/telemetry (mobile) ─────────────────────────
    app.post<{
      Body: { nudgeLogId: string; event: 'tapped' | 'action_completed'; occurredAt?: string };
      Reply: { ok: boolean } | ErrorResponse;
    }>(
      '/nudges/telemetry',
      {
        schema: {
          body: nudgesTelemetryRequestSchema,
          response: {
            200: nudgesTelemetryResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireAuthenticatedUser(request, verifyAccessToken);
        const db = ensureSupabase();
        const { nudgeLogId, event, occurredAt } = request.body;
        const when = occurredAt ?? new Date().toISOString();

        const update =
          event === 'tapped' ? { tapped_at: when } : { action_completed_at: when };

        const { error } = await db
          .from('nudge_log')
          .update(update)
          .eq('id', nudgeLogId)
          .eq('user_id', user.id);

        if (error) {
          request.log.warn(
            { event: 'nudge_telemetry_update_error', error: error.message },
            'telemetry update failed',
          );
          return { ok: false };
        }
        return { ok: true };
      },
    );

    // ───────────────────────── POST /v1/nudges/attribute (cron) ─────────────────────────
    app.post<{
      Reply: { scanned: number; attributed: number } | ErrorResponse;
    }>(
      '/nudges/attribute',
      {
        schema: {
          body: nudgesAttributeRequestSchema,
          response: {
            200: nudgesAttributeResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        ensureCronAuth(request.headers.authorization);

        if (!areNudgesEnabled()) {
          request.log.info({ event: 'nudge_attribute_kill_switch' }, 'nudges disabled — /attribute no-op');
          return { scanned: 0, attributed: 0 };
        }

        const db = ensureSupabase();
        const now = Date.now();
        // 2-h attribution window: scan rows sent between (now-2h) and (now-15min).
        // The 15-min lower bound gives the mobile telemetry a chance to land first.
        const upper = new Date(now - 15 * 60 * 1000).toISOString();
        const lower = new Date(now - 2 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await db
          .from('nudge_log')
          .select('id, user_id, trigger_id, sent_at')
          .eq('outcome', 'sent')
          .is('action_completed_at', null)
          .gte('sent_at', lower)
          .lte('sent_at', upper)
          .in('trigger_id', ACTIONABLE_TRIGGERS)
          .limit(1000);

        if (error) {
          request.log.error(
            { event: 'nudge_attribute_query_error', error: error.message },
            'attribute query failed',
          );
          throw new HttpError('Attribute query failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            details: [error.message],
          });
        }

        let attributed = 0;

        for (const r of (rows ?? []) as Array<{
          id: string;
          user_id: string;
          trigger_id: string;
          sent_at: string;
        }>) {
          try {
            // Did the user complete a trip since sent_at? Cheap COUNT.
            const { count } = await db
              .from('trip_tracks')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', r.user_id)
              .gte('created_at', r.sent_at);

            if ((count ?? 0) > 0) {
              await db
                .from('nudge_log')
                .update({ action_completed_at: new Date().toISOString() })
                .eq('id', r.id);
              attributed++;
            }
          } catch (err) {
            request.log.warn(
              {
                event: 'nudge_attribute_user_error',
                nudgeLogId: r.id,
                error: (err as Error).message,
              },
              'attribute failed for row',
            );
          }
        }

        request.log.info(
          { event: 'nudge_attribute_complete', scanned: rows?.length ?? 0, attributed },
          'nudges/attribute complete',
        );

        return { scanned: rows?.length ?? 0, attributed };
      },
    );

    // ───────────────────────── POST /v1/nudges/recompute-pattern (cron) ─────────────────────────
    app.post<{ Reply: { updated: number } | ErrorResponse }>(
      '/nudges/recompute-pattern',
      {
        schema: {
          body: nudgesRecomputePatternRequestSchema,
          response: {
            200: nudgesRecomputePatternResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        ensureCronAuth(request.headers.authorization);

        if (!areNudgesEnabled()) {
          request.log.info(
            { event: 'nudge_pattern_kill_switch' },
            'nudges disabled — /recompute-pattern no-op',
          );
          return { updated: 0 };
        }

        const db = ensureSupabase();

        // Walk profiles opted into streak nudges (notify_streak=true). The
        // pattern only matters for these riders since daily_ride_reminder
        // is the only consumer. Cap at 5000 / run to keep latency bounded.
        const { data: profileRows, error } = await db
          .from('profiles')
          .select('id, quiet_hours_timezone')
          .eq('notify_streak', true)
          .limit(5000);

        if (error) {
          request.log.error(
            { event: 'nudge_pattern_query_error', error: error.message },
            'recompute-pattern query failed',
          );
          throw new HttpError('Pattern query failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            details: [error.message],
          });
        }

        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        let updated = 0;

        for (const row of (profileRows ?? []) as Array<{
          id: string;
          quiet_hours_timezone: string | null;
        }>) {
          try {
            const tz = row.quiet_hours_timezone ?? 'Europe/Bucharest';
            const { data: trips } = await db
              .from('trips')
              .select('started_at')
              .eq('user_id', row.id)
              .gte('started_at', fourteenDaysAgo)
              .not('started_at', 'is', null)
              .limit(200);

            const starts = (trips ?? [])
              .map((t: { started_at: string | null }) => t.started_at)
              .filter((s): s is string => !!s);

            if (starts.length === 0) continue;

            const pattern = computeRidePattern(starts, tz);
            if (!pattern) continue;

            await db.from('user_ride_pattern').upsert(
              {
                user_id: row.id,
                typical_start_hour: pattern.typicalStartHour,
                confidence: pattern.confidence,
                sample_count: pattern.sampleCount,
                last_computed_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' },
            );
            updated++;
          } catch (err) {
            request.log.warn(
              {
                event: 'nudge_pattern_user_error',
                userId: row.id,
                error: (err as Error).message,
              },
              'pattern recompute failed for user',
            );
          }
        }

        request.log.info(
          { event: 'nudge_pattern_complete', updated },
          'nudges/recompute-pattern complete',
        );
        return { updated };
      },
    );
  };
};

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const countPushesLast24h = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
): Promise<number> => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: nudgeCount } = await db
    .from('nudge_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('outcome', 'sent')
    .gte('created_at', since);

  const { count: notifCount } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('created_at', since);

  return (nudgeCount ?? 0) + (notifCount ?? 0);
};

/**
 * Compare a DATE column value against today-in-user-TZ. Pure given a clock.
 * `last_qualifying_date` is stored as a DATE in the rider's local timezone.
 */
const isQualifiedTodayInTz = (
  lastDate: string | null,
  timezone: string,
  now: Date = new Date(),
): boolean => {
  if (!lastDate) return false;
  const todayInTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return lastDate === todayInTz;
};

// ---------------------------------------------------------------------------
// User-candidate map builder
// ---------------------------------------------------------------------------

interface UserCandidateContext {
  readonly streakCount: number;
  readonly lastQualifyingDate: string | null;
  readonly lapsedDays?: number;
  /** nudge_schedule.last_sent_at for city_riders_pulse (Bucket D users). */
  readonly cityPulseLastSentAt?: string | null;
  readonly candidates: NudgeTrigger[];
}

/**
 * Build a Map<userId, candidates> by walking the relevant streak buckets:
 *
 *   Bucket A — active streak (`current_streak > 0`):
 *     - `milestone_celebration` when streak crossed a milestone day
 *     - `streak_at_risk_mild` (4–6 days) / `streak_at_risk_dramatic` (>=7)
 *
 *   Bucket B — just-broke streak (`current_streak = 0`, longest >= 3,
 *   last_qualifying_date 1–3 days ago) → `streak_lost_apology`
 *
 *   Bucket C — lapsed (`current_streak = 0`, last_qualifying_date 3–30
 *   days ago) → `lapsed_reengagement` (gated downstream so we don't fire
 *   more often than every 4 days per user via nudge_log lookback).
 *
 * Each user appears once in the result; their candidates list collects
 * all triggers they're eligible for at this tick. The priority queue
 * picks the winner per user.
 */
const buildUserCandidateMap = async (
  db: ReturnType<typeof ensureSupabase>,
  log: import('fastify').FastifyBaseLogger,
): Promise<Map<string, UserCandidateContext>> => {
  const map = new Map<string, UserCandidateContext>();

  // ─── Bucket A: active streak ───
  const { data: activeRows, error: activeErr } = await db
    .from('streak_state')
    .select('user_id, current_streak, last_qualifying_date')
    .gt('current_streak', 0)
    .limit(1000);

  if (activeErr) {
    log.error(
      { event: 'nudges_active_query_error', error: activeErr.message },
      'active-streak query failed',
    );
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const row of (activeRows ?? []) as Array<{
    user_id: string;
    current_streak: number | null;
    last_qualifying_date: string | null;
  }>) {
    const streakCount = row.current_streak ?? 0;
    const candidates: NudgeTrigger[] = [];

    // Per-trigger dedup (review 2026-06-12). Without it, Bucket A re-queued
    // these on EVERY 30-min tick, bounded only by the 2/24h cap — so
    // milestone_celebration (P0, bypasses the cap) re-sent all day including
    // overnight, and streak_at_risk fired twice ~30 min apart each morning.
    if (isMilestoneDay(streakCount)) {
      // The P0 post-ride fast path already fires this within seconds of the
      // qualifying ride; the cron is only a backstop. 24h dedup.
      const recentMilestone = await hasRecentNudge(
        db,
        row.user_id,
        'milestone_celebration',
        DAY_MS,
      );
      if (!recentMilestone) candidates.push('milestone_celebration');
    }
    if (streakCount >= 4) {
      const atRisk: NudgeTrigger =
        streakCount >= 7 ? 'streak_at_risk_dramatic' : 'streak_at_risk_mild';
      // 22h dedup (same pattern as daily_ride_reminder) — one streak-at-risk
      // ping per day, not one per tick.
      const recentAtRisk = await hasRecentNudge(db, row.user_id, atRisk, 22 * 60 * 60 * 1000);
      if (!recentAtRisk) candidates.push(atRisk);
    }
    if (candidates.length === 0) continue;
    map.set(row.user_id, {
      streakCount,
      lastQualifyingDate: row.last_qualifying_date,
      candidates,
    });
  }

  // ─── Bucket B: just-broke streak (1–3 days post-loss, longest >= 3) ───
  const today = new Date();
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

  const { data: lostRows, error: lostErr } = await db
    .from('streak_state')
    .select('user_id, current_streak, longest_streak, last_qualifying_date')
    .eq('current_streak', 0)
    .gte('longest_streak', 3)
    .lte('last_qualifying_date', dateOnly(yesterday))
    .gte('last_qualifying_date', dateOnly(threeDaysAgo))
    .limit(1000);

  if (lostErr) {
    log.warn(
      { event: 'nudges_lost_query_error', error: lostErr.message },
      'just-lost-streak query failed',
    );
  }

  for (const row of (lostRows ?? []) as Array<{
    user_id: string;
    current_streak: number | null;
    longest_streak: number | null;
    last_qualifying_date: string | null;
  }>) {
    // Skip if we already fired the apology in the last 7 days.
    const recentApology = await hasRecentNudge(
      db,
      row.user_id,
      'streak_lost_apology',
      7 * 24 * 60 * 60 * 1000,
    );
    if (recentApology) continue;

    const existing = map.get(row.user_id);
    const candidates = existing ? [...existing.candidates] : [];
    candidates.push('streak_lost_apology');
    map.set(row.user_id, {
      streakCount: existing?.streakCount ?? row.current_streak ?? 0,
      lastQualifyingDate: existing?.lastQualifyingDate ?? row.last_qualifying_date,
      lapsedDays: daysBetween(row.last_qualifying_date, today),
      candidates,
    });
  }

  // ─── Bucket C: lapsed reengagement (3–30 days inactive) ───
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data: lapsedRows, error: lapsedErr } = await db
    .from('streak_state')
    .select('user_id, current_streak, last_qualifying_date')
    .eq('current_streak', 0)
    .lte('last_qualifying_date', dateOnly(threeDaysAgo))
    .gte('last_qualifying_date', dateOnly(thirtyDaysAgo))
    .limit(1000);

  if (lapsedErr) {
    log.warn(
      { event: 'nudges_lapsed_query_error', error: lapsedErr.message },
      'lapsed-reengagement query failed',
    );
  }

  for (const row of (lapsedRows ?? []) as Array<{
    user_id: string;
    current_streak: number | null;
    last_qualifying_date: string | null;
  }>) {
    // Avoid pestering: only fire if no lapsed nudge in last 4 days.
    const recentLapsed = await hasRecentNudge(
      db,
      row.user_id,
      'lapsed_reengagement',
      4 * 24 * 60 * 60 * 1000,
    );
    if (recentLapsed) continue;

    const existing = map.get(row.user_id);
    const candidates = existing ? [...existing.candidates] : [];
    candidates.push('lapsed_reengagement');
    map.set(row.user_id, {
      streakCount: existing?.streakCount ?? row.current_streak ?? 0,
      lastQualifyingDate: existing?.lastQualifyingDate ?? row.last_qualifying_date,
      lapsedDays: daysBetween(row.last_qualifying_date, today),
      candidates,
    });
  }

  // ─── Bucket D: City Riders Pulse — due schedule rows ───
  if (isCityPulseEnabled()) {
    const { data: dueRows, error: dueErr } = await db
      .from('nudge_schedule')
      .select('user_id, next_fire_at, last_sent_at')
      .eq('trigger_id', 'city_riders_pulse')
      .lte('next_fire_at', new Date().toISOString())
      .limit(1000);

    if (dueErr) {
      log.warn(
        { event: 'nudges_city_pulse_due_query_error', error: dueErr.message },
        'city-pulse due-schedule query failed',
      );
    }

    for (const row of (dueRows ?? []) as Array<{
      user_id: string;
      next_fire_at: string;
      last_sent_at: string | null;
    }>) {
      const existing = map.get(row.user_id);
      const candidates = existing ? [...existing.candidates] : [];
      candidates.push('city_riders_pulse');
      map.set(row.user_id, {
        streakCount: existing?.streakCount ?? 0,
        lastQualifyingDate: existing?.lastQualifyingDate ?? null,
        lapsedDays: existing?.lapsedDays,
        cityPulseLastSentAt: row.last_sent_at,
        candidates,
      });
    }
  }

  return map;
};

const daysBetween = (lastDate: string | null, today: Date): number | undefined => {
  if (!lastDate) return undefined;
  const last = new Date(`${lastDate}T00:00:00Z`).getTime();
  return Math.floor((today.getTime() - last) / (24 * 60 * 60 * 1000));
};

/**
 * Daily-ride-reminder candidate gate. Returns true when:
 *   - user_ride_pattern.typical_start_hour is set with confidence >= 0.4
 *   - current local hour == typical_start_hour - 1
 *   - no daily_ride_reminder fired in the last 22h
 *
 * Lookup is cheap (single-row), and we only call this for users already
 * in the candidate map so the load is bounded by the cron's user cap.
 */
const RIDE_REMINDER_MIN_CONFIDENCE = 0.4;

const isDailyRideReminderEligible = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<boolean> => {
  const { data } = await db
    .from('user_ride_pattern')
    .select('typical_start_hour, confidence')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as {
    typical_start_hour: number | null;
    confidence: number | null;
  } | null;
  if (!row || row.typical_start_hour === null) return false;
  if ((row.confidence ?? 0) < RIDE_REMINDER_MIN_CONFIDENCE) return false;

  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
  const currentHour = Number.parseInt(fmt.format(now), 10);
  if (!Number.isFinite(currentHour)) return false;

  // Fire window: exactly one hour before typical start. Cron runs every
  // 30 min so the user's "1h before" hour gets two evaluation chances.
  const targetHour = (row.typical_start_hour - 1 + 24) % 24;
  if (currentHour !== targetHour) return false;

  // Dedup — don't fire twice within the same 22h window.
  return !(await hasRecentNudge(
    db,
    userId,
    'daily_ride_reminder',
    22 * 60 * 60 * 1000,
  ));
};

/**
 * community_signal candidate gate. Returns true when the user's CO2-metric
 * leaderboard rank dropped by 3+ positions between their two most recent
 * weekly snapshots. Once-per-week dedup via nudge_log lookback.
 *
 * Returns false when the user has fewer than 2 snapshots — can't compute
 * a delta — or when the delta is too small to be motivating.
 *
 * Note: badge_proximity is intentionally NOT wired in this phase. The
 * server has no badge-progress calculation today (mobile computes it
 * client-side), so generic "1 unit to unlock X" detection is a separate
 * scoped piece of work tracked for a follow-up PR.
 */
const COMMUNITY_RANK_DROP_THRESHOLD = 3;

const isCommunitySignalEligible = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
): Promise<boolean> => {
  // Dedup — once per 6 days minimum.
  const alreadyFired = await hasRecentNudge(
    db,
    userId,
    'community_signal',
    6 * 24 * 60 * 60 * 1000,
  );
  if (alreadyFired) return false;

  const { data } = await db
    .from('leaderboard_snapshots')
    .select('rank, period_end')
    .eq('user_id', userId)
    .eq('period_type', 'weekly')
    .eq('metric', 'co2')
    .order('period_end', { ascending: false })
    .limit(2);

  const rows = (data ?? []) as Array<{ rank: number; period_end: string }>;
  if (rows.length < 2) return false;

  const currentRank = rows[0]!.rank;
  const priorRank = rows[1]!.rank;
  // Higher rank number = worse position. Dropping = rank increases.
  return currentRank - priorRank >= COMMUNITY_RANK_DROP_THRESHOLD;
};

// ---------------------------------------------------------------------------
// City Riders Pulse schedule management
// ---------------------------------------------------------------------------

/**
 * Seed `nudge_schedule` rows for riders with a trip in the last 7 days who
 * don't have one yet: next_fire_at = now + U(0…5 days) at a random minute in
 * the 07:00–21:30 local window. Runs every evaluate tick; the 7-day trips
 * window bounds the scan while guaranteeing every newly-active rider is
 * caught (their first trip is by definition recent). Dormant riders seed on
 * their next ride — no backfill needed.
 */
const seedCityPulseSchedules = async (
  db: ReturnType<typeof ensureSupabase>,
  log: import('fastify').FastifyBaseLogger,
): Promise<void> => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tripRows, error: tripsErr } = await db
      .from('trips')
      .select('user_id')
      .gte('started_at', since)
      .not('started_at', 'is', null)
      .limit(2000);
    if (tripsErr || !tripRows?.length) return;

    const userIds = [...new Set((tripRows as Array<{ user_id: string }>).map((r) => r.user_id))];

    const { data: existingRows } = await db
      .from('nudge_schedule')
      .select('user_id')
      .eq('trigger_id', 'city_riders_pulse')
      .in('user_id', userIds);
    const seeded = new Set(
      ((existingRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    );

    for (const userId of userIds) {
      if (seeded.has(userId)) continue;
      const location = await resolveUserLocation(db, userId);
      const city = findNearestCity(location.lat, location.lon);
      const fireAt = drawInitialFireAt(new Date(), Math.random, city?.utcOffsetHours ?? 2);
      await db.from('nudge_schedule').upsert(
        {
          user_id: userId,
          trigger_id: 'city_riders_pulse',
          next_fire_at: fireAt.toISOString(),
          last_sent_at: null,
        },
        { onConflict: 'user_id,trigger_id', ignoreDuplicates: true },
      );
    }
  } catch (err) {
    log.warn(
      { event: 'nudges_city_pulse_seed_error', error: (err as Error).message },
      'city-pulse seeding failed',
    );
  }
};

/**
 * Outcomes that keep the schedule row due so the pulse retries next tick:
 * lost the priority slot, daily cap, quiet hours, and the safety floor
 * (weather/sunset — these deliberately override the 5-day guarantee).
 */
const CITY_PULSE_TRANSIENT_OUTCOMES = new Set([
  'lost_slot',
  'suppressed_cap',
  'suppressed_quiet_hours',
  'suppressed_weather',
  'suppressed_sunset',
  'suppressed_qualified_already',
]);

/**
 * Advance the schedule after a tick in which the pulse resolved:
 *   - 'sent' → stamp last_sent_at and draw the next fire 1–5 days out.
 *   - permanent-ish gates (consent off, anonymous, no token, expo error) →
 *     redraw next_fire_at WITHOUT stamping last_sent_at, so the row doesn't
 *     re-log a suppression every 30-min tick.
 *   - transient gates → leave the row due (retry next tick).
 */
const updateCityPulseSchedule = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
  outcome: string,
  location: UserLocation,
): Promise<void> => {
  if (CITY_PULSE_TRANSIENT_OUTCOMES.has(outcome)) return;

  const utcOffsetHours = findNearestCity(location.lat, location.lon)?.utcOffsetHours ?? 2;
  const now = new Date();
  const nextFireAt = drawNextFireAt(now, Math.random, utcOffsetHours);
  const patch =
    outcome === 'sent'
      ? {
          next_fire_at: nextFireAt.toISOString(),
          last_sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        }
      : { next_fire_at: nextFireAt.toISOString(), updated_at: now.toISOString() };

  await db
    .from('nudge_schedule')
    .update(patch)
    .eq('user_id', userId)
    .eq('trigger_id', 'city_riders_pulse');
};

/**
 * Last variant ids actually sent to this user for the pulse (most recent
 * first) — the per-send rotation skips them so no line repeats within four
 * sends.
 */
const fetchRecentCityPulseVariants = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
): Promise<readonly string[]> => {
  const { data } = await db
    .from('nudge_log')
    .select('variant_id')
    .eq('user_id', userId)
    .eq('trigger_id', 'city_riders_pulse')
    .eq('outcome', 'sent')
    .order('created_at', { ascending: false })
    .limit(CITY_PULSE_ROTATION_MEMORY);
  return ((data ?? []) as Array<{ variant_id: string }>).map((r) => r.variant_id);
};

/**
 * True if a `nudge_log` row with the given trigger exists for the user
 * within the last `windowMs`. Used to prevent re-firing streak_lost_apology
 * and lapsed_reengagement too quickly.
 */
const hasRecentNudge = async (
  db: ReturnType<typeof ensureSupabase>,
  userId: string,
  trigger: NudgeTrigger,
  windowMs: number,
): Promise<boolean> => {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await db
    .from('nudge_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('trigger_id', trigger)
    .in('outcome', ['sent', 'scheduled'])
    .gte('created_at', since);
  return (count ?? 0) > 0;
};
