/**
 * Community visibility ladder — pure decision logic for how wide a time
 * window / geographic scope the community surfaces (City Heartbeat,
 * Community Feed) should show.
 *
 * Why: with ~2.4 rides/day nationally, a "today + 15 km" slice is almost
 * always empty even though real activity exists. Instead of fabricating
 * content, we WIDEN what we show — and label it honestly. Every number the
 * app renders is still computed from real rows; these helpers only decide
 * which (window, scope) rung has enough real content to feel alive.
 *
 * The thresholds are named constants so product can tune them in one place;
 * the pickers are pure so both the API server and tests exercise the exact
 * same ladder.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Time window a community surface is currently showing. */
export type CommunityWindow = 'today' | 'week' | 'month';

/** Geographic scope a community surface is currently showing. */
export type CommunityScope = 'nearby' | 'region' | 'community';

/** Ride counts per (window × scope) rung, computed from real trip_shares rows. */
export interface CommunityPulseCounts {
  readonly today: Readonly<Record<CommunityScope, number>>;
  readonly week: Readonly<Record<CommunityScope, number>>;
  readonly month: Readonly<Record<CommunityScope, number>>;
}

export interface CommunityPulseRung {
  readonly window: CommunityWindow;
  readonly scope: CommunityScope;
}

// ---------------------------------------------------------------------------
// Thresholds & radii (named constants — no magic numbers inline)
// ---------------------------------------------------------------------------

/**
 * Minimum rides a (window, scope) rung must contain before the City
 * Heartbeat pulse settles on it.
 */
export const COMMUNITY_MIN_RIDES_PER_WINDOW = 3;

/** Minimum feed items a scope must contain before the feed settles on it. */
export const COMMUNITY_MIN_FEED_ITEMS = 3;

/** "Nearby" scope radius for the City Heartbeat (current behavior). */
export const COMMUNITY_NEARBY_RADIUS_KM = 15;

/** "Region" scope radius — the middle rung of the ladder. */
export const COMMUNITY_REGION_RADIUS_KM = 100;

/**
 * "Nearby" rung for the ranked activity feed. Deliberately wider than the
 * heartbeat's 15 km: the ranked feed has ALWAYS queried at 50 km (with
 * distance down-weighting in the score), so 50 km is the no-regression
 * floor — the ladder must only ever widen what users already saw.
 */
export const COMMUNITY_FEED_NEARBY_RADIUS_KM = 50;

/**
 * Below this many rides in the last 7 days (at the resolved scope), the
 * activity chart switches from a 7-day daily view to a 4-week weekly view.
 */
export const COMMUNITY_CHART_MIN_WEEKLY_RIDES = 7;

/** Days of history the 4-week chart covers (4 buckets × 7 days). */
export const COMMUNITY_CHART_WEEKS = 4;

/**
 * Maximum age of activity-feed items. Replaces the old hard 30-day cutoff —
 * the feed shows the latest N items regardless of "today", and this only
 * exists as a sanity bound (score decay makes year-old items sort last
 * anyway; beyond ~1 year the exponential decay underflows to 0).
 */
export const COMMUNITY_FEED_MAX_AGE_DAYS = 365;

/** Days back the "N new riders joined" aggregate card looks. */
export const COMMUNITY_NEW_RIDERS_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Ladder pickers
// ---------------------------------------------------------------------------

const WINDOW_ORDER: readonly CommunityWindow[] = ['today', 'week', 'month'];
const SCOPE_ORDER: readonly CommunityScope[] = ['nearby', 'region', 'community'];

/**
 * Resolve which (window, scope) rung the City Heartbeat pulse should show.
 *
 * THE LADDER (exact order — window widens first, then radius, composing
 * per the product spec "try (today, nearby) → widen window first, then
 * radius"):
 *
 *   1. (today, nearby)    4. (today, region)    7. (today, community)
 *   2. (week,  nearby)    5. (week,  region)    8. (week,  community)
 *   3. (month, nearby)    6. (month, region)    9. (month, community)
 *
 * The first rung with at least `minRides` real rides wins. If no rung
 * qualifies, the widest honest rung — (month, community) — is returned so
 * the surface renders whatever real data exists (possibly zero, which the
 * UI treats as the true empty state).
 */
export const pickCommunityPulseRung = (
  counts: CommunityPulseCounts,
  minRides: number = COMMUNITY_MIN_RIDES_PER_WINDOW,
): CommunityPulseRung => {
  for (const scope of SCOPE_ORDER) {
    for (const window of WINDOW_ORDER) {
      if ((counts[window]?.[scope] ?? 0) >= minRides) {
        return { window, scope };
      }
    }
  }
  return { window: 'month', scope: 'community' };
};

/**
 * Resolve which scope the feed should query: first scope (nearby → region
 * → community) with at least `minItems` candidate items; falls back to
 * 'community' (no spatial filter) so a rider far from all activity still
 * sees the latest real items, honestly labeled.
 */
export const pickCommunityFeedScope = (
  counts: Readonly<Record<CommunityScope, number>>,
  minItems: number = COMMUNITY_MIN_FEED_ITEMS,
): CommunityScope => {
  for (const scope of SCOPE_ORDER) {
    if ((counts[scope] ?? 0) >= minItems) return scope;
  }
  return 'community';
};

/**
 * Chart mode for the resolved scope: daily 7-day view when the last week
 * has enough rides to look alive, otherwise a 4-week weekly view.
 */
export const pickCommunityChartMode = (
  weekRidesAtScope: number,
  minRides: number = COMMUNITY_CHART_MIN_WEEKLY_RIDES,
): 'daily' | 'weekly' => (weekRidesAtScope >= minRides ? 'daily' : 'weekly');

/** km → meters for the RPC params (which speak meters). */
export const kmToMeters = (km: number): number => km * 1000;
