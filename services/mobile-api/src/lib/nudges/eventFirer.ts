/**
 * Pedal Nudge — fire-and-forget P0 event helpers.
 *
 * Same trust boundary as the existing `qualifyStreakAsync` pattern in
 * lib/streaks.ts: these functions are called inside route handlers after a
 * successful save (ride / hazard) and never propagate failures to the
 * caller. Failures land in the request log.
 */

import type { FastifyBaseLogger } from 'fastify';
import {
  getTriggerPriority,
  isMilestoneDay,
  type NudgeContext,
  type NudgeTrigger,
} from '@defensivepedal/core';

import { dispatchNudge } from './dispatcher';
import { evaluateEligibility, type UserNudgeProfile } from './eligibility';
import { areNudgesEnabled } from './killSwitch';
import { supabaseAdmin } from '../supabaseAdmin';

interface ProfileRow {
  id: string;
  display_name: string | null;
  notify_pedal_nudges: boolean | null;
  notify_streak: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
  pedal_voice_sassy: boolean | null;
}

const PROFILE_COLUMNS =
  'id, display_name, notify_pedal_nudges, notify_streak, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, pedal_voice_sassy';

const toProfile = (row: ProfileRow): UserNudgeProfile => ({
  userId: row.id,
  // Anonymous gate is enforced upstream by requireFullUser; if we reach
  // here it's a full user. Setting `true` keeps eligibility from short-
  // circuiting on a column that doesn't exist on profiles.
  hasEmail: true,
  notifyPedalNudges: row.notify_pedal_nudges ?? true,
  notifyStreak: row.notify_streak ?? true,
  quietHoursStart: row.quiet_hours_start ?? '22:00',
  quietHoursEnd: row.quiet_hours_end ?? '07:00',
  timezone: row.quiet_hours_timezone ?? 'Europe/Bucharest',
});

/**
 * Fire a P0 event after a save operation. Resolves a profile + push tokens
 * and dispatches through the standard pipeline. NEVER throws — failures
 * are logged and discarded.
 */
const fireP0EventAsync = async (
  userId: string,
  trigger: NudgeTrigger,
  context: NudgeContext,
  log: FastifyBaseLogger,
): Promise<void> => {
  try {
    if (!areNudgesEnabled()) {
      log.info({ event: 'nudge_p0_kill_switch', userId, trigger }, 'nudges disabled — P0 skipped');
      return;
    }
    if (!supabaseAdmin) return;

    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (!profileRow) return;
    const typed = profileRow as ProfileRow;
    const profile = toProfile(typed);

    const priority = getTriggerPriority(trigger);

    const elig = evaluateEligibility({
      trigger,
      priority,
      profile,
      window: {
        pushesLast24h: 0, // P0 ignores
        badWeatherNow: false,
        afterSunset: false,
        qualifiedStreakToday: false,
      },
    });

    let pushTokens: string[] = [];
    if (elig.eligible) {
      const { data: tokenRows } = await supabaseAdmin
        .from('push_tokens')
        .select('expo_push_token')
        .eq('user_id', userId);
      pushTokens = (tokenRows ?? []).map(
        (r: { expo_push_token: string }) => r.expo_push_token,
      );
    }

    const mergedContext: NudgeContext = {
      ...context,
      riderName: context.riderName ?? typed.display_name ?? undefined,
    };

    const outcome = elig.eligible ? 'scheduled' : elig.outcome;

    await dispatchNudge(supabaseAdmin, {
      userId,
      trigger,
      context: mergedContext,
      locale: 'en', // Phase 2 stores locale on profile
      sassy: typed.pedal_voice_sassy ?? true,
      pushTokens,
      outcome: outcome as Parameters<typeof dispatchNudge>[1]['outcome'],
    });
  } catch (err) {
    log.warn(
      { event: 'nudge_p0_fire_error', userId, trigger, error: (err as Error).message },
      'P0 nudge fire failed',
    );
  }
};

/**
 * Fire-and-forget wrapper. Same semantics as `qualifyStreakAsync` —
 * caller does not await.
 */
export const fireP0Event = (
  userId: string,
  trigger: NudgeTrigger,
  context: NudgeContext,
  log: FastifyBaseLogger,
): void => {
  void fireP0EventAsync(userId, trigger, context, log);
};

/**
 * After `qualifyStreakAsync('ride', ...)` updates streak_state, this helper
 * reads the new count and fires:
 *   - `post_ride_celebration` (always, P0)
 *   - `milestone_celebration` (if the new count is a milestone day)
 *
 * Both are fire-and-forget. The streak RPC is async fire-and-forget too,
 * so we add a short delay to let the RPC settle before reading. This is a
 * pragmatic Phase-1 design — Phase 2 wires the RPC return value through.
 */
export const firePostRideEventsAsync = (
  userId: string,
  log: FastifyBaseLogger,
): void => {
  void (async () => {
    try {
      // 250ms head-start for the qualifyStreakAsync RPC to commit.
      await new Promise((resolve) => setTimeout(resolve, 250));

      if (!supabaseAdmin) return;
      const { data: streakRow } = await supabaseAdmin
        .from('streak_state')
        .select('current_streak')
        .eq('user_id', userId)
        .maybeSingle();

      const streakCount = (streakRow as { current_streak: number } | null)?.current_streak ?? 0;

      await fireP0EventAsync(
        userId,
        'post_ride_celebration',
        { streakCount },
        log,
      );

      if (isMilestoneDay(streakCount)) {
        await fireP0EventAsync(
          userId,
          'milestone_celebration',
          { streakCount, milestoneDay: streakCount },
          log,
        );
      }
    } catch (err) {
      log.warn(
        { event: 'nudge_post_ride_fire_error', userId, error: (err as Error).message },
        'post-ride nudge fire failed',
      );
    }
  })();
};
