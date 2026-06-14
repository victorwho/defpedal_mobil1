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
 * Weekly Impact Summary (Sunday 9 AM local time)
 * Sent to users who had at least one ride this week.
 *
 * Quiet hours + per-user category prefs + daily budget are enforced inside
 * `dispatchNotification`; the weekly cap is enforced here. (Streak reminders
 * and the social digest crons were removed 2026-06-14 — streak nudging is now
 * owned by the Pedal nudge system, and social interactions are folded into the
 * `socialSuffix` below.)
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

      // Merge social interaction data (validations + likes from past 7 days)
      let socialSuffix = '';
      try {
        const { data: userHazards } = await supabaseAdmin
          .from('hazards')
          .select('id')
          .eq('user_id', user.id);
        const hazardIds = (userHazards ?? []).map((h: Record<string, unknown>) => h.id as string);

        let validationCount = 0;
        if (hazardIds.length > 0) {
          const { count: vc } = await supabaseAdmin
            .from('hazard_validations')
            .select('id', { count: 'exact', head: true })
            .in('hazard_id', hazardIds)
            .neq('user_id', user.id)
            .gte('responded_at', weekAgo);
          validationCount = vc ?? 0;
        }

        const { data: userShares } = await supabaseAdmin
          .from('trip_shares')
          .select('id')
          .eq('user_id', user.id);
        const shareIds = (userShares ?? []).map((s: Record<string, unknown>) => s.id as string);

        let likeCount = 0;
        if (shareIds.length > 0) {
          const { count: lc } = await supabaseAdmin
            .from('feed_likes')
            .select('id', { count: 'exact', head: true })
            .in('trip_share_id', shareIds)
            .neq('user_id', user.id)
            .gte('created_at', weekAgo);
          likeCount = lc ?? 0;
        }

        const socialParts: string[] = [];
        if (validationCount > 0) socialParts.push(`${validationCount} hazard validation${validationCount > 1 ? 's' : ''}`);
        if (likeCount > 0) socialParts.push(`${likeCount} reaction${likeCount > 1 ? 's' : ''}`);
        if (socialParts.length > 0) socialSuffix = ` Community: ${socialParts.join(' and ')}.`;
      } catch {
        // Social data is optional — don't fail the notification
      }

      // Leaderboard rank + personal best suffix
      let leaderboardSuffix = '';
      try {
        // Get latest weekly snapshot for this user (CO2 metric)
        const { data: latestRank } = await supabaseAdmin
          .from('leaderboard_snapshots')
          .select('rank, metric, value, period_end')
          .eq('user_id', user.id)
          .eq('period_type', 'weekly')
          .order('period_end', { ascending: false })
          .limit(2);

        if (latestRank && latestRank.length > 0) {
          const latest = latestRank[0] as Record<string, unknown>;
          const metricLabel = latest.metric === 'co2' ? 'CO2 savings' : 'hazard reporting';
          leaderboardSuffix += ` You finished #${latest.rank} in ${metricLabel}.`;

          // Personal best check: compare current value against all-time max
          const currentValue = Number(latest.value ?? 0);
          const { data: allSnapshots } = await supabaseAdmin
            .from('leaderboard_snapshots')
            .select('value')
            .eq('user_id', user.id)
            .eq('metric', latest.metric as string)
            .eq('period_type', 'weekly')
            .order('value', { ascending: false })
            .limit(1);

          if (allSnapshots && allSnapshots.length > 0) {
            const bestValue = Number((allSnapshots[0] as Record<string, unknown>).value ?? 0);
            // If the latest value IS the all-time best (or very close), it's a new PB
            if (currentValue >= bestValue * 0.99 && currentValue > 0) {
              if (latest.metric === 'co2') {
                // Check if there was a previous best that was lower
                const { data: prevBest } = await supabaseAdmin
                  .from('leaderboard_snapshots')
                  .select('value')
                  .eq('user_id', user.id)
                  .eq('metric', 'co2')
                  .eq('period_type', 'weekly')
                  .neq('period_end', latest.period_end as string)
                  .order('value', { ascending: false })
                  .limit(1);

                if (prevBest && prevBest.length > 0) {
                  const prevBestValue = Number((prevBest[0] as Record<string, unknown>).value ?? 0);
                  if (currentValue > prevBestValue) {
                    leaderboardSuffix += ` New personal best! You saved ${currentValue.toFixed(1)} kg CO2 this week (previous best: ${prevBestValue.toFixed(1)}).`;
                  }
                }
              }
            }
          }
        }
      } catch {
        // Leaderboard data is optional — don't fail the notification
      }

      await dispatchNotification(user.id, 'system', {
        title: 'Your weekly cycling impact',
        body: `This week: ${weekCo2.toFixed(1)} kg CO2 saved, ${weekMoney.toFixed(2)} EUR saved in ${count} rides.${socialSuffix}${leaderboardSuffix}`,
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
