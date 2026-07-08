import type { FastifyBaseLogger } from 'fastify';

import { supabaseAdmin } from './supabaseAdmin';
import { dispatchNotification } from './notifications';

const MAX_NOTIFICATIONS_PER_WEEK = 3;

// PostgREST `IN (...)` filters are sent in the URL — chunk id lists so a
// large opted-in user base can't overflow the request line.
const IN_CHUNK_SIZE = 500;

interface UserRow {
  id: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

interface WeekImpact {
  rideCount: number;
  co2Kg: number;
  moneyEur: number;
}

/**
 * Audit 2026-07-05 PERF-4: the weekly cron ran 1 + 2N sequential queries
 * (per-user ride-count + per-user notification-cap count). These two helpers
 * replace the per-user probes with one grouped query per 500 users each —
 * query volume is now constant in the number of opted-in users.
 */
const loadWeekImpactByUser = async (
  userIds: readonly string[],
  weekAgoIso: string,
): Promise<Map<string, WeekImpact>> => {
  const byUser = new Map<string, WeekImpact>();
  if (!supabaseAdmin) return byUser;

  for (const ids of chunk(userIds, IN_CHUNK_SIZE)) {
    const { data } = await supabaseAdmin
      .from('ride_impacts')
      .select('user_id, co2_saved_kg, money_saved_eur')
      .in('user_id', ids as string[])
      .gte('created_at', weekAgoIso);

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const userId = row.user_id as string;
      const entry = byUser.get(userId) ?? { rideCount: 0, co2Kg: 0, moneyEur: 0 };
      entry.rideCount += 1;
      entry.co2Kg += Number(row.co2_saved_kg ?? 0);
      entry.moneyEur += Number(row.money_saved_eur ?? 0);
      byUser.set(userId, entry);
    }
  }
  return byUser;
};

const loadSentCountsByUser = async (
  userIds: readonly string[],
  sinceIso: string,
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (!supabaseAdmin) return counts;

  for (const ids of chunk(userIds, IN_CHUNK_SIZE)) {
    const { data } = await supabaseAdmin
      .from('notification_log')
      .select('user_id')
      .eq('status', 'sent')
      .in('user_id', ids as string[])
      .gte('created_at', sinceIso);

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const userId = row.user_id as string;
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }
  return counts;
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

  // Audit 2026-07-05 PERF-4: batch the two per-user gate probes into grouped
  // queries so the cron scales with rides-this-week, not opted-in users.
  const candidates = users as Array<UserRow & { total_co2_saved_kg: number; total_money_saved_eur: number }>;
  const candidateIds = candidates.map((u) => u.id);
  const weekImpactByUser = await loadWeekImpactByUser(candidateIds, weekAgo);
  const sentCountsByUser = await loadSentCountsByUser(candidateIds, weekAgo);

  for (const user of candidates) {
    try {
      const week = weekImpactByUser.get(user.id);
      const count = week?.rideCount ?? 0;

      if (count === 0) {
        skipped++;
        continue;
      }

      if ((sentCountsByUser.get(user.id) ?? 0) >= MAX_NOTIFICATIONS_PER_WEEK) {
        skipped++;
        continue;
      }

      const weekCo2 = week?.co2Kg ?? 0;
      const weekMoney = week?.moneyEur ?? 0;

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
