/**
 * Pedal Plus catalog — the single source of truth for free-tier limits,
 * store product identifiers, and the grandfathering cutoff.
 *
 * Pure data plus trivial lookups. No I/O, no clock, no platform APIs.
 *
 * Why a catalog module rather than literals at the call sites: error-log #20
 * (a per-feature gate that lived as a function-local const in the routing
 * client was invisible to every other surface and outlived the limitation it
 * encoded by 12 days). Every Plus gate reads its numbers from here, so tuning
 * the free tier is a one-line change in one file.
 */

// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------

/** The only two tiers. `plus` is the EUR 3/month subscription. */
export type PremiumTier = 'free' | 'plus';

// ---------------------------------------------------------------------------
// Store identifiers
// ---------------------------------------------------------------------------

/**
 * RevenueCat entitlement identifier. One entitlement covers both plans and
 * both stores — the plan a rider bought is a billing detail, not a
 * capability difference.
 */
export const PLUS_ENTITLEMENT_ID = 'pedal_plus';

/** Store product id for the EUR 3/month plan (identical on Play + App Store). */
export const PLUS_MONTHLY_PRODUCT_ID = 'pedal_plus_monthly';

/** Store product id for the discounted annual plan. */
export const PLUS_ANNUAL_PRODUCT_ID = 'pedal_plus_annual';

/** Every product id that grants Plus. Used to validate webhook payloads. */
export const PLUS_PRODUCT_IDS: readonly string[] = [
  PLUS_MONTHLY_PRODUCT_ID,
  PLUS_ANNUAL_PRODUCT_ID,
];

// ---------------------------------------------------------------------------
// Tier limits
// ---------------------------------------------------------------------------

/**
 * A tier's ceilings. `null` always means "no limit" — never 0, never
 * Infinity, so the unlimited case is impossible to confuse with a zero
 * allowance in a numeric comparison.
 */
export interface TierLimits {
  /** Max saved routes. */
  readonly savedRoutes: number | null;
  /**
   * Max imported GPX courses kept on the device.
   *
   * Lower than the saved-route ceiling on purpose: a course is bulkier
   * (full geometry on disk, not an endpoint pair) and importing one is a
   * deliberate power-user act, so a small free allowance still lets every
   * rider feel the risk X-ray before the wall.
   */
  readonly importedCourses: number | null;
  /** Max offline map packs held at once. */
  readonly offlinePacks: number | null;
  /**
   * Days before an unused offline pack is auto-deleted by the cleanup pass.
   * `null` = packs persist until the rider deletes them or LRU eviction
   * reclaims space.
   */
  readonly offlinePackExpiryDays: number | null;
  /** Total offline-pack storage budget before LRU eviction kicks in. */
  readonly offlinePackStorageBudgetBytes: number;
  /**
   * How far back ride history is visible. `null` = the rider's full history.
   * Rows are never deleted on account of this — it is a read filter only.
   */
  readonly historyWindowDays: number | null;
  /** Flat-profile rides that may be *started* per calendar month. */
  readonly flatRidesPerMonth: number | null;
  /**
   * Loop-finding *sessions* per calendar month.
   *
   * A session, not a search: the first loop drawn opens a 30-minute window in
   * which trying another, changing the distance and re-spinning the heading
   * are all free (`loopSessionMeter`). Metering individual presses at a limit
   * this small would meter the exploration that sells the feature.
   *
   * Note this is a *second* meter a flat loop touches: Flat terrain routes
   * through the flat OSRM instance, so starting one also charges
   * `flatRidesPerMonth`. Surface both counts before generating, never at the
   * Start button.
   */
  readonly loopSessionsPerMonth: number | null;
}

/**
 * Free tier. The expiry and storage numbers restate today's shipped
 * behaviour (5-day auto-delete, 200 MB budget) so free riders see no change.
 */
export const FREE_LIMITS: TierLimits = {
  savedRoutes: 5,
  importedCourses: 2,
  offlinePacks: 1,
  offlinePackExpiryDays: 5,
  offlinePackStorageBudgetBytes: 200 * 1024 * 1024,
  historyWindowDays: 90,
  /*
   * Flat routing is FREE AND UNLIMITED, deliberately.
   *
   * This was 3/month, and it never worked: `canStartFlatRoute` was called from
   * nowhere, `consumeFlatRouteLocally` was called from nowhere, so the meter
   * never moved. Its only surface was a loop-planner label reading
   * "3 left this month" — a quota that did not exist, permanently reading 3,
   * announcing a paywall that was dark. It was invisible only because the
   * 2099 launch sentinel made every account grandfathered; setting a real
   * launch date would have shown it to every new rider.
   *
   * Metering it properly would also have meant taking away a routing mode
   * that has shipped free for months, which is the thing grandfathering
   * exists to prevent. Flat loops are already covered: loop SEARCHES are
   * metered below, and a flat loop is a loop.
   *
   * The meter machinery (`flatRouteMeter.ts`, the store slice, the sync) is
   * now dead and should be deleted — left in place here only because that is
   * a ten-file refactor and this is a behaviour fix.
   */
  flatRidesPerMonth: null,
  loopSessionsPerMonth: 3,
};

/**
 * Pedal Plus. Pack *count* is unbounded; real-world usage is bounded by the
 * storage budget, which is the honest constraint on a phone.
 */
export const PLUS_LIMITS: TierLimits = {
  savedRoutes: null,
  importedCourses: null,
  offlinePacks: null,
  offlinePackExpiryDays: null,
  offlinePackStorageBudgetBytes: 2 * 1024 * 1024 * 1024,
  historyWindowDays: null,
  flatRidesPerMonth: null,
  loopSessionsPerMonth: null,
};

export const limitsForTier = (tier: PremiumTier): TierLimits =>
  tier === 'plus' ? PLUS_LIMITS : FREE_LIMITS;

// ---------------------------------------------------------------------------
// Grandfathering
// ---------------------------------------------------------------------------

/**
 * Accounts created strictly before this instant are permanently exempt from
 * limits that would otherwise be a takeaway — today that is Flat-route
 * metering, which shipped free and unlimited long before Plus existed.
 *
 * It does NOT exempt them from the saved-route or pack ceilings: those
 * grandfather *content* (nothing is deleted, everything stays usable) while
 * still capping new additions, which is a different promise.
 *
 * PLACEHOLDER — set to the real production reveal timestamp before Phase 5.
 * Deliberately far in the future so that shipping it unset grandfathers
 * EVERY account and nobody loses a feature. Failing safe in this direction
 * costs revenue; failing the other way costs rider trust.
 */
/**
 * When Pedal Plus starts applying to NEW accounts.
 *
 * Accounts created before this instant are grandfathered: they keep every
 * limit they have today, forever. Accounts created after it are subject to
 * the free-tier ceilings once the paywall is switched on.
 *
 * Was a `2099-01-01` sentinel while the tier was built, which grandfathered
 * everybody — the state the app is still in at the time of writing, because
 * `profiles.premium_ui_enabled` is false for every account.
 *
 * ⚠️ This date is a COMMITMENT, not a default. Set to 2026-10-01 on
 * 2026-09-18, which means the paywall must be switched on by then: a rider
 * who signs up after this instant while the paywall is still dark would be
 * capped retroactively the day it is flipped, which is precisely what
 * grandfathering exists to prevent. If the paywall is not ready, move this
 * date forward in the same change that extends `PLUS_MODES_FREE_UNTIL`.
 */
export const PLUS_LAUNCH_AT_ISO = '2026-10-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Offline entitlement grace
// ---------------------------------------------------------------------------

/**
 * How long a cached entitlement is honoured when the server cannot be
 * reached. A paying rider on a multi-day tour with no signal keeps what they
 * paid for; the abuse window is small and bounded.
 */
export const PLUS_OFFLINE_GRACE_DAYS = 7;

/**
 * How recently the server must have confirmed an entitlement for the client to
 * treat it as a live answer rather than a cached one.
 *
 * Both are honoured — the grace window above decides whether a snapshot counts
 * at all — but this is what lets the UI distinguish "confirmed just now" from
 * "running on yesterday's answer" without a second network call.
 */
export const PLUS_SNAPSHOT_FRESH_MINUTES = 15;
