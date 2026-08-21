/**
 * Pulls entitlement from the server on demand.
 *
 * WHY THIS EXISTS: the only other hydration point is `ProfileDeviceSyncManager`,
 * which is keyed on `userId|timezone|locale` and therefore does NOT re-run when
 * a rider buys something. Without an explicit refresh, someone completes a
 * purchase and the app shows no change until the next cold start — the classic
 * "I paid and nothing happened" report, and the fastest way to earn a refund
 * request and a one-star review.
 *
 * The retry loop matters just as much. A store purchase returns as soon as
 * Google takes the payment, but our entitlement comes from RevenueCat's
 * server-to-server webhook, which lands a moment later. A single immediate
 * fetch usually races that webhook and reports the rider as still free.
 */
import type { PremiumTier } from '@defensivepedal/core';

import { mobileApi } from './api';
import { useAppStore } from '../store/appStore';

/**
 * Backoff for post-purchase polling, in delays BETWEEN attempts.
 *
 * Sized from a measured production purchase (2026-08-21): the webhook landed
 * ~10s after the store returned, and the original four-step schedule expired at
 * 13.5s — it caught it with 3.5s to spare, which is not a margin worth relying
 * on. This covers ~58s, so a slow webhook still resolves while the rider is
 * looking at the app rather than on their next cold start.
 *
 * Nothing blocks on this: it is fire-and-forget, so a longer tail costs a
 * handful of cheap profile GETs after a purchase, which is rare by definition.
 */
export const PREMIUM_ACTIVATION_DELAYS_MS: readonly number[] = [
  0, 1_500, 4_000, 8_000, 15_000, 30_000,
];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetches the profile and stores the premium block. Returns the resolved tier,
 * or `null` when the request failed — callers must not treat a failed refresh
 * as "free", which would revoke a rider's features over one bad request.
 */
export const refreshPremiumEntitlement = async (): Promise<PremiumTier | null> => {
  try {
    const profile = await mobileApi.getProfile();
    if (!profile?.premium) return null;
    useAppStore.getState().setPremiumFromProfile(profile.premium, new Date().toISOString());
    return profile.premium.tier;
  } catch {
    return null;
  }
};

/**
 * Polls until entitlement turns to `plus`, for use immediately after a
 * successful purchase or restore.
 *
 * Returns true once the server confirms Plus. Returning false does NOT mean the
 * purchase failed — only that it had not propagated yet; the next profile sync
 * will pick it up. Callers should therefore never show a failure on false.
 */
export const awaitPremiumActivation = async (
  delays: readonly number[] = PREMIUM_ACTIVATION_DELAYS_MS,
): Promise<boolean> => {
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    if ((await refreshPremiumEntitlement()) === 'plus') return true;
  }
  return false;
};
