/**
 * Flat-route monthly quota math for the free tier.
 *
 * Pure functions only — no I/O, no clock side effects. The caller injects
 * `nowIso` and the rider's IANA timezone; every function is total and
 * returns a new state rather than mutating.
 *
 * What counts as a use: *starting navigation* on a flat route. Previewing,
 * comparing, and cycling the route-preview mode pill never consume quota —
 * that pill refetches on every tap, so metering computation would drain a
 * rider's month in seconds through idle exploration.
 *
 * Why two counters: rides start with no signal all the time. The device
 * counts locally (`pendingCount`) and the server is the eventual source of
 * truth (`syncedCount`), mirroring the offline-mutation-queue pattern. A
 * rider is never blocked mid-ride waiting on a network round-trip.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlatRouteMeterState {
  /**
   * Calendar month this tally belongs to, as `YYYY-MM` in the rider's
   * timezone. Lexicographic order is chronological order, which the merge
   * relies on.
   */
  readonly periodKey: string;
  /** Rides the server has acknowledged for this period. */
  readonly syncedCount: number;
  /** Rides started on this device that the server has not yet absorbed. */
  readonly pendingCount: number;
}

export const DEFAULT_FLAT_ROUTE_METER: FlatRouteMeterState = {
  periodKey: '',
  syncedCount: 0,
  pendingCount: 0,
};

// ---------------------------------------------------------------------------
// Period keys
// ---------------------------------------------------------------------------

/**
 * `YYYY-MM` for an instant, in the rider's timezone.
 *
 * Timezone matters: a rider in Bucharest starting a ride at 01:30 local on
 * the 1st is in the new month, while UTC still says the old one. Quota that
 * resets on the wrong day looks like a bug to the only person who can see it.
 *
 * An unknown or malformed timezone falls back to UTC rather than throwing,
 * matching the `?? 'UTC'` convention used across the nudge and quiet-hours
 * stacks. Returns `''` for an unparseable timestamp so callers can treat it
 * as "no period" instead of silently bucketing into a wrong month.
 */
export const flatRoutePeriodKey = (nowIso: string, timeZone: string): string => {
  const at = new Date(nowIso);
  if (Number.isNaN(at.getTime())) return '';

  const parts = formatInZone(at, timeZone) ?? formatInZone(at, 'UTC');
  if (!parts) return '';
  return parts;
};

/**
 * Formats an instant as `YYYY-MM` in a timezone, or `null` if the timezone
 * is rejected by Intl. `formatToParts` rather than string slicing so this
 * cannot be broken by a locale that reorders or re-punctuates the output.
 */
const formatInZone = (at: Date, timeZone: string): string | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      timeZone,
    }).formatToParts(at);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    if (!year || !month) return null;
    return `${year}-${month}`;
  } catch {
    // RangeError for an unknown IANA zone.
    return null;
  }
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Rides used in `periodKey`. A state belonging to any other period has
 * already rolled over, so it counts as zero — the quota resets by being
 * ignored, never by a scheduled job.
 */
export const flatRoutesUsed = (
  state: FlatRouteMeterState,
  periodKey: string,
): number => {
  if (state.periodKey !== periodKey) return 0;
  return Math.max(0, state.syncedCount) + Math.max(0, state.pendingCount);
};

/**
 * Rides left in `periodKey`. `null` limit (Plus, or a grandfathered rider)
 * returns `Number.POSITIVE_INFINITY` so callers can compare numerically
 * without special-casing unlimited.
 */
export const flatRoutesRemaining = (
  state: FlatRouteMeterState,
  periodKey: string,
  limit: number | null,
): number => {
  if (limit === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - flatRoutesUsed(state, periodKey));
};

// ---------------------------------------------------------------------------
// Writes — all return new state
// ---------------------------------------------------------------------------

/**
 * Rolls the state into `periodKey`, zeroing the counters when the month has
 * changed. Safe to call on every read path.
 */
export const normalizeMeterForPeriod = (
  state: FlatRouteMeterState,
  periodKey: string,
): FlatRouteMeterState => {
  if (state.periodKey === periodKey) return state;
  return { periodKey, syncedCount: 0, pendingCount: 0 };
};

/**
 * Records one started flat ride. Always increments `pendingCount` — even
 * when online — so the server reconciliation has a single, uniform path to
 * absorb. Rolls the period over first.
 */
export const consumeFlatRoute = (
  state: FlatRouteMeterState,
  periodKey: string,
): FlatRouteMeterState => {
  const rolled = normalizeMeterForPeriod(state, periodKey);
  return { ...rolled, pendingCount: rolled.pendingCount + 1 };
};

/**
 * Absorbs a successful server reconciliation: `acknowledged` pending rides
 * are now counted server-side. Clamped so a double-ack cannot drive
 * `pendingCount` negative and hand the rider free quota.
 */
export const acknowledgeFlatRoutes = (
  state: FlatRouteMeterState,
  acknowledged: number,
): FlatRouteMeterState => {
  if (acknowledged <= 0) return state;
  const moved = Math.min(acknowledged, Math.max(0, state.pendingCount));
  return {
    ...state,
    syncedCount: Math.max(0, state.syncedCount) + moved,
    pendingCount: Math.max(0, state.pendingCount) - moved,
  };
};

/**
 * Merges a server snapshot into local state.
 *
 * Same period: the server owns `syncedCount`, but we take the max so a
 * lagging read can never *lower* a count — quota is monotonic within a
 * month. Local `pendingCount` survives, because those rides are exactly the
 * ones the server has not seen yet.
 *
 * Different periods: the later month wins (keys sort chronologically).
 * Pending rides from a month that has already rolled over are dropped rather
 * than carried forward — charging a rider in August for an unsynced July
 * ride would be indistinguishable from a bug.
 */
export const mergeFlatRouteMeters = (
  local: FlatRouteMeterState,
  remote: FlatRouteMeterState,
): FlatRouteMeterState => {
  if (local.periodKey === remote.periodKey) {
    return {
      periodKey: local.periodKey,
      syncedCount: Math.max(
        Math.max(0, local.syncedCount),
        Math.max(0, remote.syncedCount),
      ),
      pendingCount: Math.max(0, local.pendingCount),
    };
  }

  if (remote.periodKey > local.periodKey) {
    return {
      periodKey: remote.periodKey,
      syncedCount: Math.max(0, remote.syncedCount),
      pendingCount: 0,
    };
  }

  // Local is ahead: the device has already rolled into a newer month.
  return {
    periodKey: local.periodKey,
    syncedCount: Math.max(0, local.syncedCount),
    pendingCount: Math.max(0, local.pendingCount),
  };
};
