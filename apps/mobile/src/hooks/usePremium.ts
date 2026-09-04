/**
 * The single read path for Pedal Plus state in the app.
 *
 * Every gate decision comes from `@defensivepedal/core` predicates — this hook
 * only supplies them with the cached snapshot and the clock. No screen should
 * ever compare a tier or a limit itself (error-log #20): if a surface needs a
 * new gate, add a named predicate to core and expose it here.
 *
 * Offline behaviour is inherited from `resolveEntitlement`: the cached snapshot
 * is honoured for `PLUS_OFFLINE_GRACE_DAYS`, so a paying rider out of coverage
 * keeps what they paid for, and a snapshot older than that decays to free.
 */
import { useMemo } from 'react';

import type { SupportedCountry } from '@defensivepedal/core';
import {
  canDownloadAnotherPack,
  canImportAnotherCourse,
  canSaveAnotherRoute,
  canStartFlatRoute,
  flatRoutePeriodKey,
  flatRoutesRemaining,
  FREE_ENTITLEMENT,
  historyRetentionCutoff,
  limitsFor,
  offlinePackPolicy,
  PLUS_SNAPSHOT_FRESH_MINUTES,
  resolveCoolRoutingAvailability,
  resolveEntitlement,
  type CoolRoutingAvailability,
  type EntitlementSnapshot,
  type FlatRouteDecision,
  type ResolvedEntitlement,
  type TierLimits,
} from '@defensivepedal/core';

import { useAppStore } from '../store/appStore';
import type { PremiumSnapshot } from '../store/premiumSlice';

const MS_PER_MINUTE = 60 * 1000;

/**
 * Rebuilds a core snapshot from the persisted one.
 *
 * The wire format carries a resolved tier rather than a raw store status, so
 * the status is reconstructed from the flags. `grace` is checked before
 * `trialing` because a trial in billing retry is still a billing retry — the
 * distinction that decides whether an expiry in the past still grants access.
 */
export const toEntitlementSnapshot = (cached: PremiumSnapshot): EntitlementSnapshot => ({
  status:
    cached.tier !== 'plus'
      ? 'none'
      : cached.isInBillingRetry
        ? 'grace'
        : cached.isTrial
          ? 'trialing'
          : 'active',
  expiresAt: cached.expiresAt,
  productId: null,
  store: null,
  observedAt: cached.observedAt,
});

const isFresh = (observedAt: string, now: number): boolean => {
  const seen = Date.parse(observedAt);
  if (Number.isNaN(seen)) return false;
  return now - seen <= PLUS_SNAPSHOT_FRESH_MINUTES * MS_PER_MINUTE;
};

export interface UsePremiumResult {
  readonly entitlement: ResolvedEntitlement;
  readonly isPlus: boolean;
  /** Whether paywall and upgrade UI may render. Never gates entitlement. */
  readonly uiEnabled: boolean;
  readonly limits: TierLimits;
  /** True when running on a cached answer rather than a recent confirmation. */
  readonly isStale: boolean;

  /**
   * Whether limits are ENFORCED, not merely computed. False during the dark
   * launch, which is what makes the rollout behaviour-neutral.
   */
  readonly enforcementEnabled: boolean;

  /**
   * The three enforcement decisions screens actually make. They fold in the
   * dark-launch gate so no call site repeats it — a screen that wrote
   * `uiEnabled && !canSaveRoute(n)` itself would be the call-site gate
   * error-log #20 exists to prevent, and forgetting the first half would
   * start refusing saves that work today.
   */
  readonly blockSaveRoute: (currentCount: number) => boolean;
  readonly blockImportCourse: (currentCount: number) => boolean;
  readonly blockDownloadPack: (currentCount: number) => boolean;
  /** Period key to charge a starting flat ride against, or null to charge nothing. */
  readonly flatRideToCharge: () => string | null;

  readonly canSaveRoute: (currentCount: number) => boolean;
  readonly canImportCourse: (currentCount: number) => boolean;
  readonly canDownloadPack: (currentCount: number) => boolean;
  readonly coolRouting: (country: SupportedCountry | null | undefined) => CoolRoutingAvailability;
  readonly flatRoute: () => FlatRouteDecision;
  readonly flatRoutesLeft: () => number;
  readonly historyCutoff: () => string | null;
  readonly packPolicy: ReturnType<typeof offlinePackPolicy>;
}

export const usePremium = (): UsePremiumResult => {
  const snapshot = useAppStore((s) => s.premiumSnapshot);
  const meter = useAppStore((s) => s.flatRouteMeter);

  return useMemo(() => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const timeZone = resolveTimeZone();

    const core = snapshot ? toEntitlementSnapshot(snapshot) : null;
    const entitlement: ResolvedEntitlement = core
      ? resolveEntitlement({
          // A recently-confirmed snapshot counts as the server's live answer;
          // an older one falls back to the cache path, where the grace window
          // decides whether it still counts at all.
          server: isFresh(snapshot!.observedAt, now) ? core : null,
          cached: core,
          // Grandfathering is decided server-side and carried on the snapshot,
          // so the client never needs the account creation date.
          accountCreatedAt: snapshot!.isGrandfathered ? null : GRANDFATHER_SENTINEL,
          nowIso,
        })
      : FREE_ENTITLEMENT;

    const limits = limitsFor(entitlement);

    return {
      entitlement,
      isPlus: entitlement.tier === 'plus',
      uiEnabled: snapshot?.uiEnabled === true,
      limits,
      isStale: entitlement.isStale,

      enforcementEnabled: snapshot?.uiEnabled === true,

      blockSaveRoute: (currentCount: number) =>
        snapshot?.uiEnabled === true && !canSaveAnotherRoute(entitlement, currentCount),
      blockDownloadPack: (currentCount: number) =>
        snapshot?.uiEnabled === true && !canDownloadAnotherPack(entitlement, currentCount),
      blockImportCourse: (currentCount: number) =>
        snapshot?.uiEnabled === true && !canImportAnotherCourse(entitlement, currentCount),
      flatRideToCharge: () => {
        if (snapshot?.uiEnabled !== true) return null;
        const decision = canStartFlatRoute({ entitlement, meter, nowIso, timeZone });
        // Only a metered ride is charged: Plus and grandfathered riders are
        // unlimited, and charging them would corrupt a counter nobody reads.
        return decision.allowed && decision.reason === 'within_quota'
          ? decision.periodKey
          : null;
      },

      canSaveRoute: (currentCount: number) => canSaveAnotherRoute(entitlement, currentCount),
      canDownloadPack: (currentCount: number) => canDownloadAnotherPack(entitlement, currentCount),
      canImportCourse: (currentCount: number) => canImportAnotherCourse(entitlement, currentCount),
      coolRouting: (country) => resolveCoolRoutingAvailability(entitlement, country),
      flatRoute: () => canStartFlatRoute({ entitlement, meter, nowIso, timeZone }),
      flatRoutesLeft: () =>
        flatRoutesRemaining(meter, flatRoutePeriodKey(nowIso, timeZone), limits.flatRidesPerMonth),
      historyCutoff: () => historyRetentionCutoff(entitlement, nowIso),
      packPolicy: offlinePackPolicy(entitlement),
    };
  }, [snapshot, meter]);
};

/**
 * A timestamp guaranteed to be at/after the launch constant, used to express
 * "the server said this account is NOT grandfathered" without shipping the
 * account's real creation date to the client. `null` means the opposite —
 * `isGrandfatheredAccount` treats an unknown date as grandfathered, which is
 * the fail-safe direction.
 */
const GRANDFATHER_SENTINEL = '9999-12-31T23:59:59.999Z';

/** Device timezone, falling back to UTC exactly like the server does. */
const resolveTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
