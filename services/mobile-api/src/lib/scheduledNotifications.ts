import type { FastifyBaseLogger } from 'fastify';

import { supabaseAdmin } from './supabaseAdmin';
import { dispatchNotification } from './notifications';

const MAX_NOTIFICATIONS_PER_WEEK = 3;

interface UserRow {
  id: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
}

/**
 * Count notifications sent to a user in the current 7-day window.
 * Returns true if under the weekly cap.
 */
const isUnderWeeklyCap = async (userId: string): Promise<boolean> => {
  if (!supabaseAdmin) return false;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('created_at', sevenDaysAgo);

  if (error) return false;
  return (count ?? 0) < MAX_NOTIFICATIONS_PER_WEEK;
};

/**
 * Streak Protection Reminders (8 PM local time)
 * Sent to users whose streak is >= 2 days and who haven't ridden today.
 */
export const sendStreakProtectionReminders = async (
  logger: FastifyBaseLogger,
): Promise<{ sent: number; skipped: number }> => {
  if (!supabaseAdmin) return { sent: 0, skipped: 0 };

  // Find users with active streaks who opted in
  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('id, quiet_hours_start, quiet_hours_end, quiet_hours_timezone')
    .eq('notify_streak', true);

  if (error || !users) {
    logger.error({ event: 'streak_reminders_query_error', error: error?.message }, 'failed to load users for streak reminders');
    return { sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;

  for (const user of users as UserRow[]) {
    try {
      // Check streak state
      const { data: streak } = await supabaseAdmin
        .from('streak_state')
        .select('current_streak, last_qualifying_date')
        .eq('user_id', user.id)
        .single();

      if (!streak || streak.current_streak < 2) {
        skipped++;
        continue;
      }

      // Check if already rode today (4AM cutoff in user's TZ)
      const tz = user.quiet_hours_timezone ?? 'UTC';
      const todayInTz = new Date(
        new Date().toLocaleString('en-US', { timeZone: tz }),
      );
      todayInTz.setHours(todayInTz.getHours() - 4);
      const todayStr = todayInTz.toISOString().split('T')[0];

      if (streak.last_qualifying_date === todayStr) {
        skipped++;
        continue;
      }

      // Weekly cap check
      if (!(await isUnderWeeklyCap(user.id))) {
        skipped++;
        continue;
      }

      await dispatchNotification(user.id, 'system', {
        title: `${streak.current_streak}-day streak at risk!`,
        body: 'Take a quick ride to keep your streak alive.',
        data: { type: 'streak_reminder', screen: 'route-planning' },
      });

      sent++;
    } catch (err) {
      logger.warn({ event: 'streak_reminder_error', userId: user.id, error: err instanceof Error ? err.message : 'unknown' }, 'streak reminder failed');
      skipped++;
    }
  }

  logger.info({ event: 'streak_reminders_complete', sent, skipped }, 'streak protection reminders sent');
  return { sent, skipped };
};

/**
 * Weekly Impact Summary (Sunday 9 AM local time)
 * Sent to users who had at least one ride this week.
 */
export const sendWeeklyImpactSummary = async (
  logger: FastifyBaseLogger,
): Promise<{ sent: number; skipped: number }> => {
  if (!supabaseAdmin) return { sent: 0, skipped: 0 };

  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('id, total_co2_saved_kg, total_money_saved_eur, quiet_hours_start, quiet_hours_end, quiet_hours_timezone')
    .eq('notify_impact_summary', true);

  if (error || !users) {
    logger.error({ event: 'weekly_summary_query_error', error: error?.message }, 'failed to load users for weekly summary');
    return { sent: 0, skipped: 0 };
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  let skipped = 0;

  for (const user of users as Array<UserRow & { total_co2_saved_kg: number; total_money_saved_eur: number }>) {
    try {
      // Check if user had rides this week
      const { count } = await supabaseAdmin
        .from('ride_impacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', weekAgo);

      if (!count || count === 0) {
        skipped++;
        continue;
      }

      if (!(await isUnderWeeklyCap(user.id))) {
        skipped++;
        continue;
      }

      // Aggregate this week's impact
      const { data: weekData } = await supabaseAdmin
        .from('ride_impacts')
        .select('co2_saved_kg, money_saved_eur, distance_meters')
        .eq('user_id', user.id)
        .gte('created_at', weekAgo);

      const weekCo2 = (weekData ?? []).reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.co2_saved_kg ?? 0), 0);
      const weekMoney = (weekData ?? []).reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.money_saved_eur ?? 0), 0);

      await dispatchNotification(user.id, 'system', {
        title: 'Your weekly cycling impact',
        body: `This week: ${weekCo2.toFixed(1)} kg CO2 saved, ${weekMoney.toFixed(2)} EUR saved in ${count} rides.`,
        data: { type: 'weekly_summary', screen: 'impact-dashboard' },
      });

      sent++;
    } catch (err) {
      logger.warn({ event: 'weekly_summary_error', userId: user.id, error: err instanceof Error ? err.message : 'unknown' }, 'weekly summary failed');
      skipped++;
    }
  }

  logger.info({ event: 'weekly_summary_complete', sent, skipped }, 'weekly impact summaries sent');
  return { sent, skipped };
};

/**
 * Social Impact Digest (7 PM daily)
 * Sent to users who received new hazard validations or community interactions.
 */
export const sendSocialImpactDigest = async (
  logger: FastifyBaseLogger,
): Promise<{ sent: number; skipped: number }> => {
  if (!supabaseAdmin) return { sent: 0, skipped: 0 };

  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('id, notify_community, quiet_hours_start, quiet_hours_end, quiet_hours_timezone')
    .eq('notify_community', true);

  if (error || !users) {
    logger.error({ event: 'social_digest_query_error', error: error?.message }, 'failed to load users for social digest');
    return { sent: 0, skipped: 0 };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  let skipped = 0;

  for (const user of users as UserRow[]) {
    try {
      // Get user's hazard IDs for subquery
      const { data: userHazards } = await supabaseAdmin
        .from('hazards')
        .select('id')
        .eq('user_id', user.id);

      const hazardIds = (userHazards ?? []).map((h: Record<string, unknown>) => h.id as string);

      // Count new validations on user's hazards in last 24h
      let validationCount = 0;
      if (hazardIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('hazard_validations')
          .select('id', { count: 'exact', head: true })
          .in('hazard_id', hazardIds)
          .neq('user_id', user.id)
          .gte('responded_at', oneDayAgo);
        validationCount = count ?? 0;
      }

      // Get user's trip share IDs for subquery
      const { data: userShares } = await supabaseAdmin
        .from('trip_shares')
        .select('id')
        .eq('user_id', user.id);

      const shareIds = (userShares ?? []).map((s: Record<string, unknown>) => s.id as string);

      // Count new likes on user's shared trips
      let likeCount = 0;
      if (shareIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('feed_likes')
          .select('id', { count: 'exact', head: true })
          .in('trip_share_id', shareIds)
          .neq('user_id', user.id)
          .gte('created_at', oneDayAgo);
        likeCount = count ?? 0;
      }

      const totalInteractions = (validationCount ?? 0) + (likeCount ?? 0);

      if (totalInteractions === 0) {
        skipped++;
        continue;
      }

      if (!(await isUnderWeeklyCap(user.id))) {
        skipped++;
        continue;
      }

      const parts: string[] = [];
      if (validationCount && validationCount > 0) {
        parts.push(`${validationCount} hazard validation${validationCount > 1 ? 's' : ''}`);
      }
      if (likeCount && likeCount > 0) {
        parts.push(`${likeCount} reaction${likeCount > 1 ? 's' : ''}`);
      }

      await dispatchNotification(user.id, 'community', {
        title: 'Community activity on your contributions',
        body: `Today: ${parts.join(' and ')} from fellow cyclists.`,
        data: { type: 'social_digest', screen: 'impact-dashboard' },
      });

      sent++;
    } catch (err) {
      logger.warn({ event: 'social_digest_error', userId: user.id, error: err instanceof Error ? err.message : 'unknown' }, 'social digest failed');
      skipped++;
    }
  }

  logger.info({ event: 'social_digest_complete', sent, skipped }, 'social impact digests sent');
  return { sent, skipped };
};
