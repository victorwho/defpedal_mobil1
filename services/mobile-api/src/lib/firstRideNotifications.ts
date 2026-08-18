/**
 * First-Ride / Re-engagement Notification Engine
 *
 * Four notification templates with a strict 2/week budget per user.
 * Called by the daily notifications cron Cloud Scheduler job.
 *
 * Templates:
 *  1. first_ride_nudge    — 48h after signup, no ride yet
 *  2. post_first_ride     — 24h after first ride
 *  3. weather_invitation  — weekend + 3+ days lapsed + a forecast at the
 *                           rider's own location that clears the
 *                           good-cycling-day window (G-25)
 *  4. lapsed_reengagement — 7+ days inactive, max 2 total ever
 *
 * Copy is locale-keyed (en/ro/es) in firstRideNotificationCopy.ts. The
 * caller supplies `preferred_locale` and `location` on the profile; both
 * degrade safely (English / no weather send) when absent.
 *
 * Replaces the original Mia-persona notification engine. Persona-based
 * gating was removed when the multi-level Mia journey was retired
 * (2026-05-10) — these four nudges now apply to every user with
 * `notify_mia=true` (column kept under the `notify_mia` name for
 * backwards-compat with the existing profiles schema; rename in a
 * future migration).
 */
import { isGoodCyclingDay } from '@defensivepedal/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCyclingForecast } from './clients/openMeteo';
import {
  DEDUPE_MARKERS,
  FIRST_RIDE_COPY,
  dedupeFilter,
  normalizeFirstRideLocale,
  type FirstRideLocale,
} from './firstRideNotificationCopy';
import { dispatchNotification } from './notifications';
import { ANONYMOUS_ALLOWED_TRIGGERS } from './nudges/eligibility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FirstRideTemplate =
  | 'first_ride_nudge'
  | 'post_first_ride'
  | 'weather_invitation'
  | 'lapsed_reengagement';

export interface FirstRideProfile {
  readonly id: string;
  readonly total_rides: number;
  readonly notify_mia: boolean;
  readonly created_at: string;
  readonly last_ride_at: string | null;
  /**
   * profiles.is_anonymous (2026-07-16, consent-gated anonymous push).
   * Anonymous users only receive the ANONYMOUS_ALLOWED_TRIGGERS templates —
   * post_first_ride stays registered-only. The caller (cron route) is
   * responsible for the notify_riding_tips + ANON_PUSH_ENABLED gates.
   */
  readonly is_anonymous: boolean;
  /**
   * profiles.preferred_locale, narrowed by the caller. Undefined/unknown
   * renders English — safe while the column is still rolling out.
   */
  readonly preferred_locale?: string | null;
  /**
   * Where the rider actually is, resolved by the caller from their most
   * recent trip. `weather_invitation` fetches the forecast for this point
   * and stays silent without it (fail closed) — it must never promise good
   * weather it has not checked. Every other template ignores it.
   */
  readonly location?: { readonly lat: number; readonly lon: number } | null;
}

interface TemplateResult {
  readonly template: FirstRideTemplate;
  readonly sent: boolean;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEEKLY_BUDGET = 2;
const LAPSED_MAX_TOTAL = 2;
const LAPSED_MIN_GAP_DAYS = 7;

// Notification log category — kept as 'mia' so historical entries continue
// to count against the same weekly budget the prior engine enforced.
const LOG_CATEGORY = 'mia';

// ---------------------------------------------------------------------------
// Weekly budget check (Mon 4 AM UTC – Sun 23:59 UTC)
// ---------------------------------------------------------------------------

/** Start of the current budget week (Mon 04:00 UTC), for a given instant. */
export const weekStart = (now: Date = new Date()): Date => {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysToMonday);
  monday.setUTCHours(4, 0, 0, 0);
  if (now < monday) {
    monday.setUTCDate(monday.getUTCDate() - 7);
  }
  return monday;
};

/**
 * Pre-loaded notification_log facts for a whole candidate set.
 *
 * Why this exists: the cron used to ask the database per user AND per template
 * — one weekly-budget count plus one dedupe count for each of the three
 * marker-bearing templates, so ~4 sequential round-trips per rider. At 687
 * candidates that is ~2,750 serial queries, and Supabase lives in us-east-1
 * while Cloud Run runs in europe-central2, so each costs ~100 ms of Atlantic.
 * The job hit its 300 s deadline and returned 504 EVERY day for at least 8 days
 * (error-log #82), always dying part-way through the same prefix of users, so
 * the tail was never evaluated at all. Loading the same facts in a handful of
 * `in (...)` queries collapses that to ~3 round-trips total.
 */
export interface FirstRideLogIndex {
  /** userId -> rows with status='sent' since the week start. */
  readonly weeklySent: ReadonlyMap<string, number>;
  /** `${userId}|${template}` -> prior sends, matched on the dedupe markers. */
  readonly priorSends: ReadonlyMap<string, number>;
}

/** Supabase `.in()` gets unwieldy well before this; keep URLs sane. */
const LOG_INDEX_CHUNK = 200;

const priorKey = (userId: string, template: FirstRideTemplate): string =>
  `${userId}|${template}`;

/**
 * Load every `notification_log` fact the per-user checks need, for all
 * candidates at once. Mirrors the semantics of the queries it replaces exactly:
 * the weekly count filters `status='sent'`, while the dedupe count deliberately
 * does NOT filter on status (a suppressed row still means "we already tried
 * this template"), and matches the same locale markers `dedupeFilter` uses.
 */
export const loadFirstRideLogIndex = async (
  db: SupabaseClient,
  userIds: readonly string[],
  now: Date = new Date(),
): Promise<FirstRideLogIndex> => {
  const weeklySent = new Map<string, number>();
  const priorSends = new Map<string, number>();
  if (userIds.length === 0) return { weeklySent, priorSends };

  const since = weekStart(now).toISOString();
  const templates = Object.keys(DEDUPE_MARKERS) as FirstRideTemplate[];

  for (let i = 0; i < userIds.length; i += LOG_INDEX_CHUNK) {
    const chunk = userIds.slice(i, i + LOG_INDEX_CHUNK);
    const { data, error } = await db
      .from('notification_log')
      .select('user_id, status, body, created_at')
      .eq('category', LOG_CATEGORY)
      .in('user_id', chunk);

    // Fail open, exactly like the per-user queries did: an index miss means the
    // gates read zero, which can over-send but never permanently mutes a rider.
    if (error || !data) continue;

    for (const row of data as Array<{
      user_id: string; status: string; body: string | null; created_at: string;
    }>) {
      if (row.status === 'sent' && row.created_at >= since) {
        weeklySent.set(row.user_id, (weeklySent.get(row.user_id) ?? 0) + 1);
      }
      const body = (row.body ?? '').toLowerCase();
      for (const template of templates) {
        const markers = DEDUPE_MARKERS[template] ?? [];
        if (markers.some((m) => body.includes(m.toLowerCase()))) {
          const key = priorKey(row.user_id, template);
          priorSends.set(key, (priorSends.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return { weeklySent, priorSends };
};

/**
 * Trip-derived facts for a whole candidate set: how many trips each rider has,
 * and their most recent COMPLETED trip (which carries the coordinates
 * `weather_invitation` needs).
 *
 * Replaces two more per-user round-trips in the cron loop. Together with
 * `loadFirstRideLogIndex` this takes the per-rider cost from ~6 sequential
 * queries to zero — see that function's comment for why that mattered.
 *
 * Semantics are preserved exactly, including a quirk: the ride count includes
 * trips with a NULL `ended_at` (the query it replaces never filtered on it), so
 * an in-progress ride still counts toward `total_rides`. `lastTrip` on the other
 * hand only considers completed trips.
 */
export interface RiderTripFacts {
  readonly rideCounts: ReadonlyMap<string, number>;
  readonly lastTrips: ReadonlyMap<string, { ended_at: string; start_location: unknown }>;
}

export const loadRiderTripFacts = async (
  db: SupabaseClient,
  userIds: readonly string[],
): Promise<RiderTripFacts> => {
  const rideCounts = new Map<string, number>();
  const lastTrips = new Map<string, { ended_at: string; start_location: unknown }>();
  if (userIds.length === 0) return { rideCounts, lastTrips };

  for (let i = 0; i < userIds.length; i += LOG_INDEX_CHUNK) {
    const chunk = userIds.slice(i, i + LOG_INDEX_CHUNK);
    const { data, error } = await db
      .from('trips')
      .select('user_id, ended_at, start_location')
      .in('user_id', chunk);

    if (error || !data) continue; // fail open, same as the per-user queries

    for (const row of data as Array<{
      user_id: string; ended_at: string | null; start_location: unknown;
    }>) {
      rideCounts.set(row.user_id, (rideCounts.get(row.user_id) ?? 0) + 1);
      if (!row.ended_at) continue;
      const current = lastTrips.get(row.user_id);
      if (!current || row.ended_at > current.ended_at) {
        lastTrips.set(row.user_id, { ended_at: row.ended_at, start_location: row.start_location });
      }
    }
  }

  return { rideCounts, lastTrips };
};

export const getWeeklyCount = async (
  db: SupabaseClient,
  userId: string,
  index?: FirstRideLogIndex,
): Promise<number> => {
  if (index) return index.weeklySent.get(userId) ?? 0;

  const now = new Date();
  const monday = weekStart(now);

  const { count, error } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', LOG_CATEGORY)
    .eq('status', 'sent')
    .gte('created_at', monday.toISOString());

  if (error) return 0; // fail open
  return count ?? 0;
};

export const isUnderWeeklyBudget = async (
  db: SupabaseClient,
  userId: string,
  index?: FirstRideLogIndex,
): Promise<boolean> => {
  const count = await getWeeklyCount(db, userId, index);
  return count < WEEKLY_BUDGET;
};

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

const hoursSince = (isoDate: string): number =>
  (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);

const daysSince = (isoDate: string): number => hoursSince(isoDate) / 24;

const localeOf = (profile: FirstRideProfile): FirstRideLocale =>
  normalizeFirstRideLocale(profile.preferred_locale);

/**
 * How many times this template already went out to the user, matched across
 * every locale's marker (see firstRideNotificationCopy.ts). Fails open with
 * 0 so a query error can't permanently mute a template.
 */
const priorSendCount = async (
  db: SupabaseClient,
  userId: string,
  template: FirstRideTemplate,
  index?: FirstRideLogIndex,
): Promise<number> => {
  const filter = dedupeFilter(template);
  if (!filter) return 0;
  if (index) return index.priorSends.get(priorKey(userId, template)) ?? 0;

  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', LOG_CATEGORY)
    .or(filter);

  return count ?? 0;
};

/** Send one template in the rider's language. */
const send = async (
  profile: FirstRideProfile,
  template: FirstRideTemplate,
): Promise<void> => {
  const copy = FIRST_RIDE_COPY[template][localeOf(profile)];
  await dispatchNotification(profile.id, LOG_CATEGORY, {
    title: copy.title,
    body: copy.body,
    // Audit 2026-07-05 UX-5: 'type' discriminator so the mobile tap handler
    // routes to the planner instead of dead-ending (payloads had no data).
    data: { type: 'first_ride', screen: 'route-planning', template },
  });
};

// ---------------------------------------------------------------------------
// 4 Notification trigger functions
// ---------------------------------------------------------------------------

/** 1. First ride nudge: 48h after signup, no ride yet. Sent once ever. */
export const checkFirstRideNudge = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
  index?: FirstRideLogIndex,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'first_ride_nudge';

  if (profile.total_rides > 0) {
    return { template, sent: false, reason: 'has_rides' };
  }
  if (hoursSince(profile.created_at) < 48) {
    return { template, sent: false, reason: 'too_early' };
  }

  if ((await priorSendCount(db, profile.id, template, index)) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await send(profile, template);

  return { template, sent: true };
};

/** 2. Post first ride: 24h after completing first ride. Sent once ever. */
export const checkPostFirstRide = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
  index?: FirstRideLogIndex,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'post_first_ride';

  if (profile.total_rides !== 1) {
    return { template, sent: false, reason: 'not_exactly_one_ride' };
  }
  if (!profile.last_ride_at) {
    return { template, sent: false, reason: 'no_last_ride' };
  }
  if (hoursSince(profile.last_ride_at) < 24) {
    return { template, sent: false, reason: 'too_early' };
  }

  if ((await priorSendCount(db, profile.id, template, index)) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await send(profile, template);

  return { template, sent: true };
};

/**
 * 3. Weather invitation: weekend window + 3+ days since last ride + a real
 * forecast that clears the good-cycling-day window at the rider's location.
 *
 * Until 2026-08-13 (review finding G-25) this template asserted "Perfect
 * cycling weather this weekend" from the weekday alone — no forecast was
 * ever fetched, so it promised sunshine into a Dublin downpour. It now
 * fails closed at three points: no resolved location, no forecast, or a
 * forecast outside `isGoodCyclingDay` all mean no send. The copy claims
 * only what was verified (a single day — the forecast client fetches one).
 */
export const checkWeatherInvitation = async (
  _db: SupabaseClient,
  profile: FirstRideProfile,
  _index?: FirstRideLogIndex,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'weather_invitation';

  const dayOfWeek = new Date().getUTCDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday

  if (!isWeekend) {
    return { template, sent: false, reason: 'not_weekend' };
  }

  if (profile.last_ride_at && daysSince(profile.last_ride_at) < 3) {
    return { template, sent: false, reason: 'rode_recently' };
  }

  const location = profile.location;
  if (!location) {
    return { template, sent: false, reason: 'no_location' };
  }

  const forecast = await fetchCyclingForecast(location.lat, location.lon);
  if (!forecast) {
    return { template, sent: false, reason: 'no_forecast' };
  }
  if (!isGoodCyclingDay(forecast)) {
    return { template, sent: false, reason: 'bad_weather' };
  }

  await send(profile, template);

  return { template, sent: true };
};

/** 4. Lapsed re-engagement: 7+ days since last ride. Max 2 total ever. */
export const checkLapsedReengagement = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
  index?: FirstRideLogIndex,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'lapsed_reengagement';

  if (!profile.last_ride_at) {
    return { template, sent: false, reason: 'never_rode' };
  }

  if (daysSince(profile.last_ride_at) < LAPSED_MIN_GAP_DAYS) {
    return { template, sent: false, reason: 'not_lapsed' };
  }

  if ((await priorSendCount(db, profile.id, template, index)) >= LAPSED_MAX_TOTAL) {
    return { template, sent: false, reason: 'max_lapsed_reached' };
  }

  await send(profile, template);

  return { template, sent: true };
};

// ---------------------------------------------------------------------------
// Main evaluation pipeline
// ---------------------------------------------------------------------------

/**
 * Evaluate all 4 notification triggers for a single user.
 * Stops after the first successful send (1 notification per cron run per user).
 */
export const evaluateFirstRideNotifications = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
  index?: FirstRideLogIndex,
): Promise<TemplateResult[]> => {
  const results: TemplateResult[] = [];

  if (!(await isUnderWeeklyBudget(db, profile.id, index))) {
    return [{ template: 'first_ride_nudge', sent: false, reason: 'weekly_budget_exceeded' }];
  }

  const allChecks: ReadonlyArray<{
    template: FirstRideTemplate;
    check: (
      db: SupabaseClient,
      profile: FirstRideProfile,
      index?: FirstRideLogIndex,
    ) => Promise<TemplateResult>;
  }> = [
    { template: 'first_ride_nudge', check: checkFirstRideNudge },
    { template: 'post_first_ride', check: checkPostFirstRide },
    { template: 'weather_invitation', check: checkWeatherInvitation },
    { template: 'lapsed_reengagement', check: checkLapsedReengagement },
  ];

  // Anonymous users only receive the whitelisted templates (2026-07-16) —
  // shared constant with the nudge system so both engines agree.
  const checks = (
    profile.is_anonymous
      ? allChecks.filter((c) => ANONYMOUS_ALLOWED_TRIGGERS.includes(c.template))
      : allChecks
  ).map((c) => c.check);

  for (const check of checks) {
    const result = await check(db, profile, index);
    results.push(result);
    if (result.sent) break;
  }

  return results;
};
