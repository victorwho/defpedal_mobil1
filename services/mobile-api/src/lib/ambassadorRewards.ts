/**
 * Ambassador rewards dispatcher — slice 3.
 *
 * Consumes the inviter-side fields the `claim_route_share` RPC returns
 * (`inviterXpAwarded`, `inviterNewBadges`, `inviterUserId`,
 * `miaMilestoneAdvanced`) and fires a push notification to the sharer on
 * first conversion, with a "first 3/day bypass" over the stock 1-per-24h
 * daily budget in `dispatchNotification`.
 *
 * Kept separate from routeShareService so the DB RPC layer stays pure of
 * side effects outside the transaction — push delivery happens *after* the
 * claim has committed, which means a push failure cannot roll the claim
 * back.
 */

import { dispatchNotification } from './notifications';
import { supabaseAdmin } from './supabaseAdmin';
import type { ClaimRewardsAll } from './routeShareService';

// Keep in lockstep with the draft PRD: the first N high-priority referral
// notifications of a calendar day bypass the 1/24h budget; subsequent ones
// fall through to the normal suppression path.
const REFERRAL_HIGH_PRIORITY_BUDGET = 3;

type CountArgs = {
  userId: string;
  sinceIso: string;
};

/**
 * Count how many referral pushes have already been *successfully sent* to
 * this inviter today. Uses the `notification_log` `data->>'kind' = 'referral'`
 * tag we set below so we don't double-count unrelated community pushes.
 */
const countReferralNotificationsToday = async ({
  userId,
  sinceIso,
}: CountArgs): Promise<number> => {
  if (!supabaseAdmin) return 0;
  const { count, error } = await supabaseAdmin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .eq('category', 'community')
    .gte('created_at', sinceIso)
    .contains('payload', { data: { kind: 'referral' } });

  if (error) return 0; // fail open — better to try a send than to suppress
  return count ?? 0;
};

type DispatchArgs = {
  rewards: ClaimRewardsAll;
  sharerDisplayName: string | null;
  inviteeDisplayName: string | null;
  /** Defaults to now(). Test seam. */
  now?: Date;
};

export const dispatchAmbassadorRewardNotification = async ({
  rewards,
  inviteeDisplayName,
  now = new Date(),
}: DispatchArgs): Promise<{ dispatched: boolean; priority: 'high' | 'normal' }> => {
  // Nothing to say if this claim didn't award the inviter anything.
  // `inviterXpAwarded=null` happens on already-claimed replays and monthly-cap
  // hits; in both cases the sharer shouldn't get a push.
  if (rewards.inviterXpAwarded == null && rewards.inviterNewBadges.length === 0) {
    return { dispatched: false, priority: 'normal' };
  }
  if (!rewards.inviterUserId) {
    return { dispatched: false, priority: 'normal' };
  }

  // Count today's prior referral notifications to decide whether to bypass
  // the stock 1/24h daily budget.
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const priorCount = await countReferralNotificationsToday({
    userId: rewards.inviterUserId,
    sinceIso: startOfDay.toISOString(),
  });

  const priority: 'high' | 'normal' =
    priorCount < REFERRAL_HIGH_PRIORITY_BUDGET ? 'high' : 'normal';

  const who = inviteeDisplayName ?? 'Someone';
  const xpSuffix =
    rewards.inviterXpAwarded != null ? ` — you earned ${rewards.inviterXpAwarded} XP` : '';
  const badgeSuffix =
    rewards.inviterNewBadges.length > 0
      ? ` + ${rewards.inviterNewBadges[0].name} badge`
      : '';

  await dispatchNotification(
    rewards.inviterUserId,
    'community',
    {
      title: 'Someone joined via your share!',
      body: `${who} just signed up${xpSuffix}${badgeSuffix}.`,
      data: {
        kind: 'referral',
        inviterUserId: rewards.inviterUserId,
        xpAwarded: rewards.inviterXpAwarded ?? 0,
        newBadgeKeys: rewards.inviterNewBadges.map((b) => b.badgeKey),
        deepLink: '/my-shares',
      },
    },
    { priority },
  );

  return { dispatched: true, priority };
};

// ---------------------------------------------------------------------------
// Slice 8 — First-view push notification
//
// Fired when record_route_share_view RPC reports the 0→1 transition. Uses
// the same 3/day high-priority bypass as the conversion push, and tags the
// notification_log row with `kind: 'referral_view'` so the bypass counts
// don't collide with conversion pushes — a sharer can still receive up to 3
// first-view pushes AND up to 3 conversion pushes in a single day.
// ---------------------------------------------------------------------------

type FirstViewDispatchArgs = {
  sharerUserId: string;
  shortCode: string;
  now?: Date;
};

const FIRST_VIEW_HIGH_PRIORITY_BUDGET = 3;

const countFirstViewNotificationsToday = async ({
  userId,
  sinceIso,
}: CountArgs): Promise<number> => {
  if (!supabaseAdmin) return 0;
  const { count, error } = await supabaseAdmin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .eq('category', 'community')
    .gte('created_at', sinceIso)
    .contains('payload', { data: { kind: 'referral_view' } });

  if (error) return 0;
  return count ?? 0;
};

export const dispatchFirstViewNotification = async ({
  sharerUserId,
  shortCode,
  now = new Date(),
}: FirstViewDispatchArgs): Promise<{ dispatched: boolean; priority: 'high' | 'normal' }> => {
  if (!sharerUserId) {
    return { dispatched: false, priority: 'normal' };
  }

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const priorCount = await countFirstViewNotificationsToday({
    userId: sharerUserId,
    sinceIso: startOfDay.toISOString(),
  });

  const priority: 'high' | 'normal' =
    priorCount < FIRST_VIEW_HIGH_PRIORITY_BUDGET ? 'high' : 'normal';

  await dispatchNotification(
    sharerUserId,
    'community',
    {
      title: 'Someone just opened your shared route',
      body: 'Tap to see how your shares are performing.',
      data: {
        kind: 'referral_view',
        shortCode,
        deepLink: '/my-shares',
      },
    },
    { priority },
  );

  return { dispatched: true, priority };
};
