/**
 * Mia Persona Notification Engine
 *
 * Six notification templates with a strict 2/week budget.
 * Called by the daily mia-notification-cron Cloud Scheduler job.
 *
 * Templates:
 *  1. first_ride_nudge    — 48h after signup, no ride yet
 *  2. post_first_ride     — 24h after first ride
 *  3. level_up_available  — eligible for level progression
 *  4. weather_invitation  — favorable riding conditions
 *  5. milestone_approach  — close to next level threshold
 *  6. lapsed_reengage     — 21+ days inactive, max 2 total ever
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchNotification } from './notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MiaTemplate =
  | 'first_ride_nudge'
  | 'post_first_ride'
  | 'level_up_available'
  | 'weather_invitation'
  | 'milestone_approaching'
  | 'lapsed_reengagement';

interface MiaProfile {
  readonly id: string;
  readonly persona: string;
  readonly mia_journey_level: number;
  readonly mia_journey_status: string | null;
  readonly mia_total_rides: number;
  readonly mia_rides_with_destination: number;
  readonly mia_started_at: string | null;
  readonly notify_mia: boolean;
  readonly created_at: string;
  readonly last_ride_at: string | null;
}

interface TemplateResult {
  readonly template: MiaTemplate;
  readonly sent: boolean;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIA_WEEKLY_BUDGET = 2;
const LAPSED_MAX_TOTAL = 2;
const LAPSED_MIN_GAP_DAYS = 21;

// Level name mapping for notification interpolation
const LEVEL_NAMES: Record<number, string> = {
  1: 'First Pedal',
  2: 'Neighborhood Explorer',
  3: 'Cafe Rider',
  4: 'Urban Navigator',
  5: 'Confident Cyclist',
};

// Rides needed to reach each level
const LEVEL_THRESHOLDS: Record<number, number> = {
  2: 1,
  3: 3,
  4: 5,
  5: 10,
};

// ---------------------------------------------------------------------------
// Weekly budget check
// ---------------------------------------------------------------------------

/**
 * Count Mia notifications sent this week (Mon 4AM UTC – Sun 23:59 UTC).
 */
export const getMiaWeeklyCount = async (
  db: SupabaseClient,
  userId: string,
): Promise<number> => {
  const now = new Date();
  // Find Monday 4AM UTC of the current week
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - daysToMonday);
  monday.setUTCHours(4, 0, 0, 0);

  // If we're before Monday 4AM, use previous week's Monday
  if (now < monday) {
    monday.setUTCDate(monday.getUTCDate() - 7);
  }

  const { count, error } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'mia')
    .eq('status', 'sent')
    .gte('created_at', monday.toISOString());

  if (error) return 0; // fail open
  return count ?? 0;
};

export const isUnderMiaWeeklyBudget = async (
  db: SupabaseClient,
  userId: string,
): Promise<boolean> => {
  const count = await getMiaWeeklyCount(db, userId);
  return count < MIA_WEEKLY_BUDGET;
};

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

const hoursSince = (isoDate: string): number => {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
};

const daysSince = (isoDate: string): number => {
  return hoursSince(isoDate) / 24;
};

// ---------------------------------------------------------------------------
// 6 Notification trigger functions
// ---------------------------------------------------------------------------

/**
 * 1. First ride nudge: 48h after signup, no ride yet. Sent once ever.
 */
export const checkFirstRideNudge = async (
  db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'first_ride_nudge';

  if (profile.mia_total_rides > 0) {
    return { template, sent: false, reason: 'has_rides' };
  }
  if (!profile.mia_started_at) {
    return { template, sent: false, reason: 'no_start_date' };
  }
  if (hoursSince(profile.mia_started_at) < 48) {
    return { template, sent: false, reason: 'too_early' };
  }

  // Check if already sent
  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('category', 'mia')
    .ilike('body', '%first route%');

  if ((count ?? 0) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await dispatchNotification(profile.id, 'mia', {
    title: 'Your First Ride Awaits',
    body: 'Your first route is ready — just 5 minutes on quiet streets near home. This weekend could be the start of something great.',
  });

  return { template, sent: true };
};

/**
 * 2. Post first ride: 24h after completing first ride. Sent once ever.
 */
export const checkPostFirstRide = async (
  db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'post_first_ride';

  if (profile.mia_total_rides !== 1) {
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
    .eq('category', 'mia')
    .ilike('body', '%first time%');

  if ((count ?? 0) > 0) {
    return { template, sent: false, reason: 'already_sent' };
  }

  await dispatchNotification(profile.id, 'mia', {
    title: 'You Did It!',
    body: 'Yesterday you rode for the first time. Remember how good that felt? Another short ride is waiting for you.',
  });

  return { template, sent: true };
};

/**
 * 3. Level-up available: user is eligible for level progression.
 */
export const checkLevelUpAvailable = async (
  db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'level_up_available';
  const nextLevel = profile.mia_journey_level + 1;

  if (nextLevel > 5) {
    return { template, sent: false, reason: 'max_level' };
  }

  const needed = LEVEL_THRESHOLDS[nextLevel] ?? Infinity;
  const ridesLeft = needed - profile.mia_total_rides;

  if (ridesLeft !== 1) {
    return { template, sent: false, reason: 'not_one_ride_away' };
  }

  const nextLevelName = LEVEL_NAMES[nextLevel] ?? `Level ${nextLevel}`;

  await dispatchNotification(profile.id, 'mia', {
    title: 'Almost There!',
    body: `You're one ride away from unlocking ${nextLevelName}! Ready when you are.`,
  });

  return { template, sent: true };
};

/**
 * 4. Weather invitation: favorable conditions.
 * Note: Simplified — sends on weekends if user hasn't ridden in 3+ days.
 */
export const checkWeatherInvitation = async (
  _db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'weather_invitation';

  const dayOfWeek = new Date().getUTCDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday

  if (!isWeekend) {
    return { template, sent: false, reason: 'not_weekend' };
  }

  if (profile.last_ride_at && daysSince(profile.last_ride_at) < 3) {
    return { template, sent: false, reason: 'rode_recently' };
  }

  await dispatchNotification(profile.id, 'mia', {
    title: 'Perfect Weekend Ride',
    body: 'Perfect cycling weather this weekend. A short ride through quiet streets?',
  });

  return { template, sent: true };
};

/**
 * 5. Milestone approaching: close to next level threshold.
 */
export const checkMilestoneApproaching = async (
  _db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'milestone_approaching';
  const nextLevel = profile.mia_journey_level + 1;

  if (nextLevel > 5) {
    return { template, sent: false, reason: 'max_level' };
  }

  const needed = LEVEL_THRESHOLDS[nextLevel] ?? Infinity;
  const ridesLeft = needed - profile.mia_total_rides;

  // Only trigger when 2 rides away (1 ride = level_up_available instead)
  if (ridesLeft !== 2) {
    return { template, sent: false, reason: 'not_two_away' };
  }

  const nextLevelName = LEVEL_NAMES[nextLevel] ?? `Level ${nextLevel}`;

  await dispatchNotification(profile.id, 'mia', {
    title: 'Getting Close!',
    body: `Just 2 more rides to reach ${nextLevelName} — you're almost there.`,
  });

  return { template, sent: true };
};

/**
 * 6. Lapsed re-engagement: 21+ days since last ride. Max 2 total ever.
 */
export const checkLapsedReengagement = async (
  db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult> => {
  const template: MiaTemplate = 'lapsed_reengagement';

  if (!profile.last_ride_at) {
    return { template, sent: false, reason: 'never_rode' };
  }

  if (daysSince(profile.last_ride_at) < LAPSED_MIN_GAP_DAYS) {
    return { template, sent: false, reason: 'not_lapsed' };
  }

  // Max 2 lapsed notifications ever
  const { count } = await db
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('category', 'mia')
    .ilike('body', '%been a while%');

  if ((count ?? 0) >= LAPSED_MAX_TOTAL) {
    return { template, sent: false, reason: 'max_lapsed_reached' };
  }

  await dispatchNotification(profile.id, 'mia', {
    title: 'We Miss You',
    body: "It's been a while — that's okay. Your route is still here whenever you're ready. No pressure.",
  });

  return { template, sent: true };
};

// ---------------------------------------------------------------------------
// Main evaluation pipeline
// ---------------------------------------------------------------------------

/**
 * Evaluate all 6 notification triggers for a single Mia user.
 * Stops after first successful send (1 notification per cron run per user).
 */
export const evaluateMiaNotifications = async (
  db: SupabaseClient,
  profile: MiaProfile,
): Promise<TemplateResult[]> => {
  const results: TemplateResult[] = [];

  // Budget gate — check before evaluating any triggers
  if (!(await isUnderMiaWeeklyBudget(db, profile.id))) {
    return [{ template: 'first_ride_nudge', sent: false, reason: 'weekly_budget_exceeded' }];
  }

  // Evaluate triggers in priority order. Stop after first send.
  const checks = [
    checkFirstRideNudge,
    checkPostFirstRide,
    checkLevelUpAvailable,
    checkMilestoneApproaching,
    checkWeatherInvitation,
    checkLapsedReengagement,
  ];

  for (const check of checks) {
    const result = await check(db, profile);
    results.push(result);
    if (result.sent) break; // only 1 notification per evaluation
  }

  return results;
};
