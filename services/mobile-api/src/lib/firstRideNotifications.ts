/**
 * First-Ride / Re-engagement Notification Engine
 *
 * Four notification templates with a strict 2/week budget per user.
 * Called by the daily notifications cron Cloud Scheduler job.
 *
 * Templates:
 *  1. first_ride_nudge    — 48h after signup, no ride yet
 *  2. post_first_ride     — 24h after first ride
 *  3. weather_invitation  — favorable riding conditions (weekend + 3+ days lapsed)
 *  4. lapsed_reengagement — 7+ days inactive, max 2 total ever
 *
 * Replaces the original Mia-persona notification engine. Persona-based
 * gating was removed when the multi-level Mia journey was retired
 * (2026-05-10) — these four nudges now apply to every user with
 * `notify_mia=true` (column kept under the `notify_mia` name for
 * backwards-compat with the existing profiles schema; rename in a
 * future migration).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchNotification } from './notifications';

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

export const getWeeklyCount = async (
  db: SupabaseClient,
  userId: string,
): Promise<number> => {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysToMonday);
  monday.setUTCHours(4, 0, 0, 0);

  if (now < monday) {
    monday.setUTCDate(monday.getUTCDate() - 7);
  }

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
): Promise<boolean> => {
  const count = await getWeeklyCount(db, userId);
  return count < WEEKLY_BUDGET;
};

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

const hoursSince = (isoDate: string): number =>
  (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);

const daysSince = (isoDate: string): number => hoursSince(isoDate) / 24;

// ---------------------------------------------------------------------------
// 4 Notification trigger functions
// ---------------------------------------------------------------------------

/** 1. First ride nudge: 48h after signup, no ride yet. Sent once ever. */
export const checkFirstRideNudge = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'first_ride_nudge';

  if (profile.total_rides > 0) {
    return { template, sent: false, reason: 'has_rides' };
  }
  if (hoursSince(profile.created_at) < 48) {
    return { template, sent: false, reason: 'too_early' };
  }

  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('category', LOG_CATEGORY)
    .ilike('body', '%first route%');

  if ((count ?? 0) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await dispatchNotification(profile.id, LOG_CATEGORY, {
    title: 'Your First Ride Awaits',
    body: 'Your first route is ready — just 5 minutes on quiet streets near home. This weekend could be the start of something great.',
    // Audit 2026-07-05 UX-5: 'type' discriminator so the mobile tap handler
    // routes to the planner instead of dead-ending (payloads had no data).
    data: { type: 'first_ride', screen: 'route-planning' },
  });

  return { template, sent: true };
};

/** 2. Post first ride: 24h after completing first ride. Sent once ever. */
export const checkPostFirstRide = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
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

  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('category', LOG_CATEGORY)
    .ilike('body', '%first time%');

  if ((count ?? 0) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await dispatchNotification(profile.id, LOG_CATEGORY, {
    title: 'You Did It!',
    body: 'Yesterday you rode for the first time. Remember how good that felt? Another short ride is waiting for you.',
    // Audit 2026-07-05 UX-5: 'type' discriminator so the mobile tap handler
    // routes to the planner instead of dead-ending (payloads had no data).
    data: { type: 'first_ride', screen: 'route-planning' },
  });

  return { template, sent: true };
};

/** 3. Weather invitation: weekend + 3+ days since last ride. */
export const checkWeatherInvitation = async (
  _db: SupabaseClient,
  profile: FirstRideProfile,
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

  await dispatchNotification(profile.id, LOG_CATEGORY, {
    title: 'Perfect Weekend Ride',
    body: 'Perfect cycling weather this weekend. A short ride through quiet streets?',
    // Audit 2026-07-05 UX-5: 'type' discriminator so the mobile tap handler
    // routes to the planner instead of dead-ending (payloads had no data).
    data: { type: 'first_ride', screen: 'route-planning' },
  });

  return { template, sent: true };
};

/** 4. Lapsed re-engagement: 7+ days since last ride. Max 2 total ever. */
export const checkLapsedReengagement = async (
  db: SupabaseClient,
  profile: FirstRideProfile,
): Promise<TemplateResult> => {
  const template: FirstRideTemplate = 'lapsed_reengagement';

  if (!profile.last_ride_at) {
    return { template, sent: false, reason: 'never_rode' };
  }

  if (daysSince(profile.last_ride_at) < LAPSED_MIN_GAP_DAYS) {
    return { template, sent: false, reason: 'not_lapsed' };
  }

  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('category', LOG_CATEGORY)
    .ilike('body', '%been a while%');

  if ((count ?? 0) >= LAPSED_MAX_TOTAL) {
    return { template, sent: false, reason: 'max_lapsed_reached' };
  }

  await dispatchNotification(profile.id, LOG_CATEGORY, {
    title: 'We Miss You',
    body: "It's been a while — that's okay. Your route is still here whenever you're ready. No pressure.",
    // Audit 2026-07-05 UX-5: 'type' discriminator so the mobile tap handler
    // routes to the planner instead of dead-ending (payloads had no data).
    data: { type: 'first_ride', screen: 'route-planning' },
  });

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
): Promise<TemplateResult[]> => {
  const results: TemplateResult[] = [];

  if (!(await isUnderWeeklyBudget(db, profile.id))) {
    return [{ template: 'first_ride_nudge', sent: false, reason: 'weekly_budget_exceeded' }];
  }

  const checks = [
    checkFirstRideNudge,
    checkPostFirstRide,
    checkWeatherInvitation,
    checkLapsedReengagement,
  ];

  for (const check of checks) {
    const result = await check(db, profile);
    results.push(result);
    if (result.sent) break;
  }

  return results;
};
