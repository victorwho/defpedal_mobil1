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
  isLoopSessionActive,
  loopSessionPeriodKey,
  loopSessionsRemaining,
  type LoopSessionMeterState,
} from './loopSessionMeter';
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
 * Is this rider exempt from the free-tier CEILINGS (counts, storage, history)?
 *
 * True for Plus, and true for grandfathered accounts — riders who were using
 * the app before Pedal Plus existed.
 *
 * WHY GRANDFATHERING WAS WIDENED TO THE CEILINGS (2026-09-18)
 * ----------------------------------------------------------
 * It used to cover only the two METERS, on the reasoning that existing content
 * stays usable so nothing is taken away. That reasoning does not survive
 * contact with the case: a rider with twelve saved routes keeps all twelve and
 * then cannot save a thirteenth. Their app got worse on an ordinary Tuesday,
 * because we introduced a price. Plus is now sold to new riders on the
 * ceilings, and to everyone on features that did not exist before it.
 *
 * ⚠️ DELIBERATELY NOT APPLIED TO COOL ROUTING. Cool is a distinct feature
 * gate, not a ceiling, and it is the one thing Plus has to offer the existing
 * base — the in-app notice told those riders, in three languages, that it
 * becomes part of Plus. `resolveCoolRoutingAvailability` does not consult this
 * predicate, and a test pins that, so widening this function can never
 * silently give Cool away.
 *
 * Note this is NOT the same as `limitsFor`, which still reports the free
 * numbers for a grandfathered rider — the paywall renders those as the
 * description of the free tier, and must keep saying "5 saved routes".
 */
export const isExemptFromCeilings = (entitlement: ResolvedEntitlement): boolean =>
  entitlement.tier === 'plus' || entitlement.isGrandfathered;

/**
 * Can the rider save one more route?
 *
 * Existing routes above the cap are kept and stay usable — nothing is ever
 * deleted for tier reasons. A free rider who joined after the Plus launch and
 * is at the ceiling must delete one or subscribe before adding another;
 * a grandfathered rider is exempt entirely (`isExemptFromCeilings`).
 */
export const canSaveAnotherRoute = (
  entitlement: ResolvedEntitlement,
  currentCount: number,
): boolean => {
  if (isExemptFromCeilings(entitlement)) return true;
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
  if (isExemptFromCeilings(entitlement)) return true;
  const limit = limitsFor(entitlement).importedCourses;
  if (limit === null) return true;
  return currentCount < limit;
};

/** Same shape and same reasoning as saved routes. */
export const canDownloadAnotherPack = (
  entitlement: ResolvedEntitlement,
  currentCount: number,
): boolean => {
  if (isExemptFromCeilings(entitlement)) return true;
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
  if (isExemptFromCeilings(entitlement)) {
    // A grandfathered rider keeps the unmetered behaviour they already had:
    // no pack count cap and no age expiry. The storage budget still applies —
    // it is a property of the handset, not of the price list.
    return {
      maxPacks: null,
      expiryDays: null,
      storageBudgetBytes: limits.offlinePackStorageBudgetBytes,
    };
  }
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
  if (isExemptFromCeilings(entitlement)) return null;
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
 * The Plus routing modes — Cool and E-bike — are free to every rider until
 * this instant, then Plus-only.
 *
 * Exclusive: free THROUGH 2026-09-30, chargeable from 2026-10-01. UTC because
 * a device clock in another zone must not move the boundary by a day, in
 * either direction — a rider in Auckland should not lose the promotion a day
 * early, and one in Honolulu should not keep it a day late.
 *
 * Announced in-app by a one-time notice naming BOTH modes. The date lives
 * here, once, so the notice copy, the entitlement gates and the paywall
 * cannot disagree about when it ends.
 *
 * E-bike joined this promotion on 2026-09-19, three days after it shipped
 * free. Taking a shipped feature back needs the same warning Cool got, and
 * sharing one date means there is one thing to move if the launch slips.
 *
 * ⚠️ TWO THINGS THIS DOES NOT DO.
 *  - It does not enforce anything on the routing REQUEST. Nothing checks this
 *    entitlement before dispatching to the shade graph; `usePremium().coolRouting`
 *    is read only for paywall copy. So on 2026-10-01 a free rider whose stored
 *    `avoidHeat` is already true keeps getting shade routes. Closing that is
 *    separate work and must land before the date, or the promise lapses in
 *    name only.
 *  - It does not migrate anyone. A rider who turned Cool on during the promo
 *    keeps the preference; what changes is whether the product is willing to
 *    keep serving it.
 */
export const PLUS_MODES_FREE_UNTIL = new Date('2026-10-01T00:00:00Z');

/** True while cool routing is free to everyone regardless of tier. */
export const isPlusModesPromoActive = (now: Date = new Date()): boolean =>
  now.getTime() < PLUS_MODES_FREE_UNTIL.getTime();

/**
 * Country availability is checked FIRST and wins. Showing an upgrade prompt
 * to a rider whose country has no shade graph would sell them something
 * they cannot use — the paywall must never imply coverage that does not
 * exist.
 */
export const resolveCoolRoutingAvailability = (
  entitlement: ResolvedEntitlement,
  country: SupportedCountry | null | undefined,
  now: Date = new Date(),
): CoolRoutingAvailability => {
  if (!isHeatRoutingAvailable(country)) return 'country_unavailable';
  if (isPlusModesPromoActive(now)) return 'available';
  if (entitlement.tier !== 'plus') return 'requires_plus';
  return 'available';
};

/** Convenience for call sites that only need a boolean. */
export const isCoolRoutingEntitled = (
  entitlement: ResolvedEntitlement,
  country: SupportedCountry | null | undefined,
  now: Date = new Date(),
): boolean =>
  resolveCoolRoutingAvailability(entitlement, country, now) === 'available';


// ---------------------------------------------------------------------------
// Gate — e-bike routing
// ---------------------------------------------------------------------------

/**
 * Why e-bike routing is or is not offered.
 *
 * Two states rather than Cool's three: the e-bike graph is ONE hostname
 * covering every supported country, so there is no country dimension to
 * report. Never add one by copying the Cool shape — a per-country e-bike host
 * does not exist and a country-suffixed hostname fails TLS in exactly the
 * country that suffix names.
 */
export type EbikeRoutingAvailability = 'available' | 'requires_plus';

/**
 * May this rider use e-bike routing?
 *
 * Free to everyone until `PLUS_MODES_FREE_UNTIL`, then Plus-only.
 *
 * ⚠️ Like Cool, this deliberately does NOT consult `isExemptFromCeilings`.
 * E-bike is a feature gate rather than a ceiling, and Cool plus E-bike are the
 * only things Pedal Plus has to offer riders who predate it. A test pins this,
 * so widening grandfathering can never silently give either mode away.
 */
export const resolveEbikeRoutingAvailability = (
  entitlement: ResolvedEntitlement,
  now: Date = new Date(),
): EbikeRoutingAvailability => {
  if (isPlusModesPromoActive(now)) return 'available';
  return entitlement.tier === 'plus' ? 'available' : 'requires_plus';
};

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

  // Unmetered for everyone since 2026-09-18. Reported as `entitled` rather
  // than an infinite `within_quota`, because `within_quota` is what tells the
  // caller to CHARGE the ride — and charging an unmetered ride increments a
  // counter no one reads, forever.
  if (limit === null) {
    return {
      allowed: true,
      reason: 'entitled',
      remaining: Number.POSITIVE_INFINITY,
      periodKey,
    };
  }

  const remaining = flatRoutesRemaining(meter, periodKey, limit);

  return remaining > 0
    ? { allowed: true, reason: 'within_quota', remaining, periodKey }
    : { allowed: false, reason: 'quota_exhausted', remaining: 0, periodKey };
};

// ---------------------------------------------------------------------------
// Loop generator
// ---------------------------------------------------------------------------

export type LoopSessionAllowReason =
  | 'entitled'
  | 'grandfathered'
  | 'active_session'
  | 'within_quota'
  | 'quota_exhausted';

export interface LoopSessionDecision {
  readonly allowed: boolean;
  readonly reason: LoopSessionAllowReason;
  /** Sessions left this month. `Infinity` when unmetered. */
  readonly remaining: number;
  /** True when the rider is inside a window they have already paid for. */
  readonly withinActiveSession: boolean;
  /** The period this decision was made against, for the caller to persist. */
  readonly periodKey: string;
}

export interface LoopSessionGateInput {
  readonly entitlement: ResolvedEntitlement;
  readonly meter: LoopSessionMeterState;
  readonly nowIso: string;
  /** Rider's IANA timezone. Unknown zones fall back to UTC downstream. */
  readonly timeZone: string;
}

/**
 * May the rider search for loops right now?
 *
 * Order matters, and differs from `canStartFlatRoute` in one important way:
 * the open-session check sits ahead of the quota. A rider who has already paid
 * for the current 30-minute window must never be told they are out — that
 * would charge them twice for one sitting, which is exactly the injustice the
 * session model exists to prevent.
 *
 * `withinActiveSession` is what the caller reads to decide whether to charge.
 * `allowed` alone is not enough: a Plus rider is always allowed and never
 * charged, while a free rider mid-window is allowed and also not charged.
 *
 * Grandfathering applies for the same reason it applies to flat routing —
 * an account that predates Plus keeps what it has always had.
 */
export const canFindLoops = (input: LoopSessionGateInput): LoopSessionDecision => {
  const { entitlement, meter, nowIso, timeZone } = input;
  const periodKey = loopSessionPeriodKey(nowIso, timeZone);
  const withinActiveSession = isLoopSessionActive(meter, nowIso, periodKey);

  if (entitlement.tier === 'plus') {
    return {
      allowed: true,
      reason: 'entitled',
      remaining: Number.POSITIVE_INFINITY,
      withinActiveSession,
      periodKey,
    };
  }

  if (entitlement.isGrandfathered) {
    return {
      allowed: true,
      reason: 'grandfathered',
      remaining: Number.POSITIVE_INFINITY,
      withinActiveSession,
      periodKey,
    };
  }

  const limit = limitsFor(entitlement).loopSessionsPerMonth;
  const remaining = loopSessionsRemaining(meter, periodKey, limit);

  // An open window is already paid for — never re-charge, never refuse.
  if (withinActiveSession) {
    return {
      allowed: true,
      reason: 'active_session',
      remaining,
      withinActiveSession: true,
      periodKey,
    };
  }

  return remaining > 0
    ? {
        allowed: true,
        reason: 'within_quota',
        remaining,
        withinActiveSession: false,
        periodKey,
      }
    : {
        allowed: false,
        reason: 'quota_exhausted',
        remaining: 0,
        withinActiveSession: false,
        periodKey,
      };
};
