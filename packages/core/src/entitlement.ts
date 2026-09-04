/**
 * Pedal Plus entitlement resolution and the per-feature gates.
 *
 * Pure functions only — no I/O, no platform APIs, no clock side effects.
 * The caller feeds in a server snapshot, the last cached snapshot, and the
 * current time; it gets back a resolved tier and a decision per feature.
 *
 * Two rules shape everything here:
 *
 *  1. **The server owns entitlement, the client caches it.** The device
 *     never derives Plus from a receipt. This is the same server-owns-it /
 *     client-hydrates split that quiet hours and notification prefs use
 *     (error-log #81), for the same reason: a client that computes its own
 *     answer eventually overwrites the truth.
 *
 *  2. **Fail open, in the rider's favour.** A cached entitlement is honoured
 *     for a grace window when the server cannot be reached. An offline-first
 *     cycling app must not revoke offline maps at the exact moment a rider
 *     is out of coverage.
 *
 * Every gate is a single named predicate exported from here — never a local
 * const at a call site (error-log #20).
 */
import { isHeatRoutingAvailable, type SupportedCountry } from './countryCoverage';
import {
  flatRoutePeriodKey,
  flatRoutesRemaining,
  type FlatRouteMeterState,
} from './flatRouteMeter';
import {
  limitsForTier,
  PLUS_LAUNCH_AT_ISO,
  PLUS_OFFLINE_GRACE_DAYS,
  type PremiumTier,
  type TierLimits,
} from './premiumCatalog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Subscription lifecycle, normalised across both stores so no Play or
 * StoreKit vocabulary leaks into the domain model.
 *
 * `grace` is the store's billing-retry window: payment failed, the store is
 * retrying, and access is still granted. `cancelled` means auto-renew is off
 * but the paid period has not ended yet.
 */
export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'grace'
  | 'cancelled'
  | 'expired';

/** Where an entitlement came from. `manual` is a support or giveaway grant. */
export type EntitlementStore = 'play' | 'app_store' | 'manual';

/**
 * One observation of a rider's subscription. `observedAt` is when the
 * *server* produced it, which is what the offline grace window measures
 * against — not when the device happened to persist it.
 */
export interface EntitlementSnapshot {
  readonly status: SubscriptionStatus;
  /** End of the paid period, ISO. `null` when there has never been one. */
  readonly expiresAt: string | null;
  readonly productId: string | null;
  readonly store: EntitlementStore | null;
  readonly observedAt: string;
}

/** A rider who has never subscribed. */
export const freeSnapshot = (observedAt: string): EntitlementSnapshot => ({
  status: 'none',
  expiresAt: null,
  productId: null,
  store: null,
  observedAt,
});

export interface EntitlementResolutionInput {
  /** Fresh from the API this session, or `null` when unreachable. */
  readonly server: EntitlementSnapshot | null;
  /** Last known snapshot persisted on the device, if any. */
  readonly cached: EntitlementSnapshot | null;
  /** Account creation timestamp, ISO. Drives grandfathering. */
  readonly accountCreatedAt: string | null;
  readonly nowIso: string;
}

export interface ResolvedEntitlement {
  readonly tier: PremiumTier;
  /** True while the rider is inside a store-native free trial. */
  readonly isTrial: boolean;
  /** True while the store is retrying a failed payment. */
  readonly isInBillingRetry: boolean;
  /**
   * True for accounts that predate the Plus launch. Exempts them from
   * metering that would otherwise take away a shipped free feature.
   */
  readonly isGrandfathered: boolean;
  readonly source: 'server' | 'cache' | 'none';
  /** True when we are honouring a cached snapshot, not a fresh one. */
  readonly isStale: boolean;
  readonly expiresAt: string | null;
}

/** Everything free, nothing grandfathered. The safe default. */
export const FREE_ENTITLEMENT: ResolvedEntitlement = {
  tier: 'free',
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: false,
  source: 'none',
  isStale: false,
  expiresAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Elapsed days between two ISO timestamps. `Infinity` when `from` is absent
 * or unparseable so "we have no idea how old this is" always fails a
 * freshness gate. Never negative — a rewound device clock must not make a
 * stale cache look fresh.
 */
export const daysSince = (fromIso: string | null, nowIso: string): number => {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return Number.POSITIVE_INFINITY;
  const diff = now - from;
  return diff <= 0 ? 0 : diff / MS_PER_DAY;
};

/** True when `expiresAt` is absent or still in the future. */
const isUnexpired = (expiresAt: string | null, nowIso: string): boolean => {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(expires) || Number.isNaN(now)) return false;
  return expires > now;
};

/**
 * Does this snapshot grant Plus right now?
 *
 * `grace` deliberately skips the expiry check: during billing retry the paid
 * period has already lapsed by definition, and the store is still granting
 * access. Everything else must be unexpired — a stale row left `active` past
 * its end date must not keep granting Plus forever.
 */
const snapshotGrantsPlus = (
  snapshot: EntitlementSnapshot,
  nowIso: string,
): boolean => {
  switch (snapshot.status) {
    case 'grace':
      return true;
    case 'active':
    case 'trialing':
    case 'cancelled':
      return isUnexpired(snapshot.expiresAt, nowIso);
    case 'none':
    case 'expired':
      return false;
    default:
      return false;
  }
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the rider's effective entitlement.
 *
 * A present server snapshot always wins, including when it says free — a
 * cancellation must take effect the moment we hear about it. The cache is
 * consulted only when the server is unreachable, and only inside the grace
 * window.
 */
export const resolveEntitlement = (
  input: EntitlementResolutionInput,
): ResolvedEntitlement => {
  const { server, cached, accountCreatedAt, nowIso } = input;

  const isGrandfathered = isGrandfatheredAccount(accountCreatedAt);

  if (server) {
    return buildResolved(server, 'server', false, isGrandfathered, nowIso);
  }

  if (cached && daysSince(cached.observedAt, nowIso) <= PLUS_OFFLINE_GRACE_DAYS) {
    return buildResolved(cached, 'cache', true, isGrandfathered, nowIso);
  }

  // No server answer and no usable cache. Free, but still grandfathered if
  // the account predates launch — that fact comes from the account itself,
  // not from any subscription, so an offline rider never loses it.
  return { ...FREE_ENTITLEMENT, isGrandfathered };
};

const buildResolved = (
  snapshot: EntitlementSnapshot,
  source: 'server' | 'cache',
  isStale: boolean,
  isGrandfathered: boolean,
  nowIso: string,
): ResolvedEntitlement => {
  const grants = snapshotGrantsPlus(snapshot, nowIso);
  return {
    tier: grants ? 'plus' : 'free',
    isTrial: grants && snapshot.status === 'trialing',
    isInBillingRetry: grants && snapshot.status === 'grace',
    isGrandfathered,
    source,
    isStale,
    expiresAt: snapshot.expiresAt,
  };
};

/**
 * Accounts created strictly before the launch instant are grandfathered.
 * An unparseable or missing creation date is treated as grandfathered: we
 * would rather over-grant than take a shipped feature from a rider because
 * a timestamp was malformed.
 */
export const isGrandfatheredAccount = (accountCreatedAt: string | null): boolean => {
  if (!accountCreatedAt) return true;
  const created = Date.parse(accountCreatedAt);
  const launch = Date.parse(PLUS_LAUNCH_AT_ISO);
  if (Number.isNaN(created) || Number.isNaN(launch)) return true;
  return created < launch;
};

/** The limits in force for a resolved entitlement. */
export const limitsFor = (entitlement: ResolvedEntitlement): TierLimits =>
  limitsForTier(entitlement.tier);

// ---------------------------------------------------------------------------
// Gates — saved routes and offline packs
// ---------------------------------------------------------------------------

/**
 * Can the rider save one more route?
 *
 * Grandfathering deliberately does NOT apply. Existing routes above the cap
 * are kept and stay usable — nothing is deleted — but a free rider at the
 * ceiling must delete one or subscribe before adding another. That is the
 * "grandfather content, cap new additions" promise; exempting old accounts
 * entirely would be a different, unshipped promise.
 */
export const canSaveAnotherRoute = (
  entitlement: ResolvedEntitlement,
  currentCount: number,
): boolean => {
  const limit = limitsFor(entitlement).savedRoutes;
  if (limit === null) return true;
  return currentCount < limit;
};

/**
 * Can the rider import one more GPX course?
 *
 * Same shape and same promise as saved routes: courses already on the
 * device stay usable above the cap — nothing is deleted — but adding
 * another needs a deletion or a subscription.
 */
export const canImportAnotherCourse = (
  entitlement: ResolvedEntitlement,
  currentCount: number,
): boolean => {
  const limit = limitsFor(entitlement).importedCourses;
  if (limit === null) return true;
  return currentCount < limit;
};

/** Same shape and same reasoning as saved routes. */
export const canDownloadAnotherPack = (
  entitlement: ResolvedEntitlement,
  currentCount: number,
): boolean => {
  const limit = limitsFor(entitlement).offlinePacks;
  if (limit === null) return true;
  return currentCount < limit;
};

export interface OfflinePackPolicy {
  readonly maxPacks: number | null;
  /** `null` = packs are never auto-deleted for age. */
  readonly expiryDays: number | null;
  readonly storageBudgetBytes: number;
}

/** Retention policy the offline-pack cleanup pass should apply. */
export const offlinePackPolicy = (
  entitlement: ResolvedEntitlement,
): OfflinePackPolicy => {
  const limits = limitsFor(entitlement);
  return {
    maxPacks: limits.offlinePacks,
    expiryDays: limits.offlinePackExpiryDays,
    storageBudgetBytes: limits.offlinePackStorageBudgetBytes,
  };
};

// ---------------------------------------------------------------------------
// Gate — ride history
// ---------------------------------------------------------------------------

/**
 * Oldest ride timestamp a rider may *see*, or `null` for the full history.
 *
 * This is a read filter and nothing else. Rows are never deleted on account
 * of the tier, so subscribing reveals everything again instantly, and
 * lifetime totals, badges, XP and leaderboard snapshots continue to be
 * computed over the complete history regardless of tier.
 */
export const historyRetentionCutoff = (
  entitlement: ResolvedEntitlement,
  nowIso: string,
): string | null => {
  const days = limitsFor(entitlement).historyWindowDays;
  if (days === null) return null;
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return null;
  return new Date(now - days * MS_PER_DAY).toISOString();
};

// ---------------------------------------------------------------------------
// Gate — cool routing
// ---------------------------------------------------------------------------

/**
 * Why cool routing is or is not offered. Three distinct states, because
 * they need three distinct messages: an unentitled rider in Romania should
 * see an upgrade path, and a Plus rider in Spain should be told the truth
 * rather than sold something that will not work for them.
 */
export type CoolRoutingAvailability =
  | 'available'
  | 'requires_plus'
  | 'country_unavailable';

/**
 * Country availability is checked FIRST and wins. Showing an upgrade prompt
 * to a rider whose country has no shade graph would sell them something
 * they cannot use — the paywall must never imply coverage that does not
 * exist.
 */
export const resolveCoolRoutingAvailability = (
  entitlement: ResolvedEntitlement,
  country: SupportedCountry | null | undefined,
): CoolRoutingAvailability => {
  if (!isHeatRoutingAvailable(country)) return 'country_unavailable';
  if (entitlement.tier !== 'plus') return 'requires_plus';
  return 'available';
};

/** Convenience for call sites that only need a boolean. */
export const isCoolRoutingEntitled = (
  entitlement: ResolvedEntitlement,
  country: SupportedCountry | null | undefined,
): boolean => resolveCoolRoutingAvailability(entitlement, country) === 'available';

// ---------------------------------------------------------------------------
// Gate — flat routing
// ---------------------------------------------------------------------------

export type FlatRouteAllowReason =
  | 'entitled'
  | 'grandfathered'
  | 'within_quota'
  | 'quota_exhausted';

export interface FlatRouteDecision {
  readonly allowed: boolean;
  readonly reason: FlatRouteAllowReason;
  /** Rides left this month. `Infinity` when unmetered. */
  readonly remaining: number;
  /** The period this decision was made against, for the caller to persist. */
  readonly periodKey: string;
}

export interface FlatRouteGateInput {
  readonly entitlement: ResolvedEntitlement;
  readonly meter: FlatRouteMeterState;
  readonly nowIso: string;
  /** Rider's IANA timezone. Unknown zones fall back to UTC downstream. */
  readonly timeZone: string;
}

/**
 * May the rider start a flat-profile ride now?
 *
 * Order matters. Plus is checked first, then grandfathering — an account
 * that predates launch keeps unlimited flat routing permanently, because it
 * has had that for months and metering it would be a takeaway. Only
 * post-launch free accounts consult the quota.
 *
 * A refusal is never the end of the road: the caller falls back to Safe
 * routing with an explanation. `quota_exhausted` is a prompt to upgrade, not
 * a denial of navigation.
 */
export const canStartFlatRoute = (input: FlatRouteGateInput): FlatRouteDecision => {
  const { entitlement, meter, nowIso, timeZone } = input;
  const periodKey = flatRoutePeriodKey(nowIso, timeZone);

  if (entitlement.tier === 'plus') {
    return {
      allowed: true,
      reason: 'entitled',
      remaining: Number.POSITIVE_INFINITY,
      periodKey,
    };
  }

  if (entitlement.isGrandfathered) {
    return {
      allowed: true,
      reason: 'grandfathered',
      remaining: Number.POSITIVE_INFINITY,
      periodKey,
    };
  }

  const limit = limitsFor(entitlement).flatRidesPerMonth;
  const remaining = flatRoutesRemaining(meter, periodKey, limit);

  return remaining > 0
    ? { allowed: true, reason: 'within_quota', remaining, periodKey }
    : { allowed: false, reason: 'quota_exhausted', remaining: 0, periodKey };
};
