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
  getTriggerPriority,
  isMilestoneDay,
  type NudgeContext,
  type NudgeLocale,
} from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { dispatchNudge } from '../lib/nudges/dispatcher';
import { evaluateEligibility, type UserNudgeProfile } from '../lib/nudges/eligibility';
import { areNudgesEnabled } from '../lib/nudges/killSwitch';
import { pickHighestPriorityTrigger } from '../lib/nudges/priorityQueue';
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

const ensureCronAuth = (auth: string | undefined) => {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) {
    throw new HttpError('Cron secret not configured.', {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  }
  if (auth !== `Bearer ${secret}`) {
    throw new HttpError('Unauthorized cron call.', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }
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
  notify_streak: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
  pedal_voice_sassy: boolean | null;
}

const toUserNudgeProfile = (row: ProfileRow): UserNudgeProfile => ({
  userId: row.id,
  // Per Phase 1 design: anonymous gating happens upstream (mobile API's
  // requireFullUser for P0 events, signup flow for cron loop). The cron
  // sees only users who already opted into `notify_streak`, so it treats
  // them as full users for eligibility purposes.
  hasEmail: true,
  notifyStreak: row.notify_streak ?? true,
  quietHoursStart: row.quiet_hours_start ?? '22:00',
  quietHoursEnd: row.quiet_hours_end ?? '07:00',
  timezone: row.quiet_hours_timezone ?? 'Europe/Bucharest',
});

const PROFILE_COLUMNS =
  'id, display_name, notify_streak, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, pedal_voice_sassy';

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
            if (liveCandidates.length === 0) continue;

            const pushesLast24h = await countPushesLast24h(db, userId);

            const decision = pickHighestPriorityTrigger({
              candidates: liveCandidates,
              profile,
              window: {
                pushesLast24h,
                badWeatherNow: false, // Wired in a future session (Open-Meteo client)
                afterSunset: false,
                qualifiedStreakToday: qualifiedToday,
              },
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

            if (!decision.trigger) continue;

            const tokens = await fetchPushTokens(userId);

            const dispatchResult = await dispatchNudge(db, {
              userId,
              trigger: decision.trigger,
              context: baseContext,
              locale: 'en',
              sassy,
              pushTokens: tokens,
              outcome: 'scheduled',
            });

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

    // ───────────────────────── POST /v1/nudges/recompute-pattern (cron stub) ─────────────────────────
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
        // Phase 1 stub. The user_ride_pattern table is in place; the
        // computation logic (14-day mode of ride-start hour, confidence)
        // lands in Phase 2 with the adaptive-timing feature.
        return { updated: 0 };
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

  for (const row of (activeRows ?? []) as Array<{
    user_id: string;
    current_streak: number | null;
    last_qualifying_date: string | null;
  }>) {
    const streakCount = row.current_streak ?? 0;
    const candidates: NudgeTrigger[] = [];
    if (isMilestoneDay(streakCount)) candidates.push('milestone_celebration');
    if (streakCount >= 4) {
      candidates.push(
        streakCount >= 7 ? 'streak_at_risk_dramatic' : 'streak_at_risk_mild',
      );
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

  return map;
};

const daysBetween = (lastDate: string | null, today: Date): number | undefined => {
  if (!lastDate) return undefined;
  const last = new Date(`${lastDate}T00:00:00Z`).getTime();
  return Math.floor((today.getTime() - last) / (24 * 60 * 60 * 1000));
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
