/**
 * loopSessionMeter — monthly quota for the loop generator's free tier.
 *
 * Pure functions, no clock and no I/O: the caller injects `nowIso` and the
 * rider's IANA timezone, exactly as `flatRouteMeter` does.
 *
 * **What counts as a use.** Not a button press — a *session*. The first loop
 * that actually draws on screen opens a 30-minute window, and everything
 * inside it is free: trying another, changing the distance, spinning the
 * heading dial, leaving the screen and coming back. Three loop-finding
 * sessions a month, not three taps.
 *
 * That rule exists because the alternative fails badly at a limit this small.
 * Charging per press means a rider spends the month learning what the controls
 * do; charging per parameter change means comparing 15 against 20 km costs two
 * thirds of the allowance. Exploring the controls IS the feature, so metering
 * it would meter the thing that sells it.
 *
 * Two more rules follow from the same principle, and both are enforced here by
 * the caller only ever charging on a real result:
 *   - a cancelled search costs nothing, because nothing was delivered;
 *   - a search that finds no loop costs nothing, because charging for a
 *     failure is the fastest way to make a limit feel hostile.
 *
 * Counters mirror `flatRouteMeter`: the device counts locally and the server
 * is the eventual source of truth, so a rider with no signal is never blocked.
 */
import { flatRoutePeriodKey } from './flatRouteMeter';

// ---------------------------------------------------------------------------
// Period key
// ---------------------------------------------------------------------------

/**
 * `YYYY-MM` in the rider's timezone.
 *
 * Deliberately the same function the flat-route meter uses rather than a
 * second implementation — both quotas reset on the rider's own calendar month
 * and must agree about when that is. Re-exported under a loop-specific name so
 * call sites read honestly; there is exactly one implementation.
 */
export const loopSessionPeriodKey = flatRoutePeriodKey;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoopSessionMeterState {
  /** Calendar month this tally belongs to, `YYYY-MM` in the rider's timezone. */
  readonly periodKey: string;
  /** Sessions the server has acknowledged for this period. */
  readonly syncedCount: number;
  /** Sessions opened on this device that the server has not yet absorbed. */
  readonly pendingCount: number;
  /**
   * When the current session opened, or null if none is open.
   *
   * Persisted, not held in memory: the window has to survive leaving the
   * screen and even killing the app, or a back-swipe would silently cost a
   * third of the month.
   */
  readonly sessionStartedAt: string | null;
}

export const DEFAULT_LOOP_SESSION_METER: LoopSessionMeterState = {
  periodKey: '',
  syncedCount: 0,
  pendingCount: 0,
  sessionStartedAt: null,
};

/**
 * How long one charge buys.
 *
 * Long enough to compare loops, change your mind about the distance and walk
 * to the bike; short enough that tomorrow's ride is a new session. Thirty
 * minutes is also comfortably longer than the slowest plausible search, so a
 * rider on bad signal never pays twice for one sitting.
 */
export const LOOP_SESSION_WINDOW_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Is a paid-for session still open?
 *
 * False for an unparseable or absent stamp, and false once the month has
 * rolled — a session cannot straddle a quota reset, because the charge that
 * opened it belongs to the month that is over.
 *
 * A stamp in the future returns true rather than false. Device clocks drift
 * and get corrected; treating that as "no session" would charge a rider a
 * second time for the sitting they are already in, which is the failure that
 * actually costs trust.
 */
export const isLoopSessionActive = (
  state: LoopSessionMeterState,
  nowIso: string,
  periodKey: string,
): boolean => {
  if (!state.sessionStartedAt) return false;
  if (state.periodKey !== periodKey) return false;

  const startedAt = new Date(state.sessionStartedAt).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(startedAt) || Number.isNaN(now)) return false;

  if (now < startedAt) return true;
  return now - startedAt < LOOP_SESSION_WINDOW_MS;
};

/** Milliseconds left in the open session, or 0 when none is open. */
export const loopSessionRemainingMs = (
  state: LoopSessionMeterState,
  nowIso: string,
  periodKey: string,
): number => {
  if (!isLoopSessionActive(state, nowIso, periodKey)) return 0;

  const startedAt = new Date(state.sessionStartedAt!).getTime();
  const now = new Date(nowIso).getTime();
  return Math.max(0, LOOP_SESSION_WINDOW_MS - (now - startedAt));
};

/** Sessions opened in `periodKey`. Any other period has already reset. */
export const loopSessionsUsed = (
  state: LoopSessionMeterState,
  periodKey: string,
): number => {
  if (state.periodKey !== periodKey) return 0;
  return Math.max(0, state.syncedCount) + Math.max(0, state.pendingCount);
};

/** Sessions left. A `null` limit reads as `Number.POSITIVE_INFINITY`. */
export const loopSessionsRemaining = (
  state: LoopSessionMeterState,
  periodKey: string,
  limit: number | null,
): number => {
  if (limit === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - loopSessionsUsed(state, periodKey));
};

// ---------------------------------------------------------------------------
// Writes — all return new state
// ---------------------------------------------------------------------------

/** Rolls into `periodKey`, clearing the tally and any open session. */
export const normalizeLoopMeterForPeriod = (
  state: LoopSessionMeterState,
  periodKey: string,
): LoopSessionMeterState => {
  if (state.periodKey === periodKey) return state;
  return {
    periodKey,
    syncedCount: 0,
    pendingCount: 0,
    sessionStartedAt: null,
  };
};

/**
 * Records the first loop drawn.
 *
 * Idempotent within an open window: calling it again while a session is live
 * returns the state untouched, so the caller can invoke it on every result
 * without tracking whether it has already charged. That is the point — the
 * charge decision lives here, not at each of the several places a loop can
 * appear.
 */
export const beginLoopSession = (
  state: LoopSessionMeterState,
  periodKey: string,
  nowIso: string,
): LoopSessionMeterState => {
  const rolled = normalizeLoopMeterForPeriod(state, periodKey);
  if (isLoopSessionActive(rolled, nowIso, periodKey)) return rolled;

  return {
    ...rolled,
    pendingCount: rolled.pendingCount + 1,
    sessionStartedAt: nowIso,
  };
};

/** Absorbs a server reconciliation, clamped so a double-ack cannot free quota. */
export const acknowledgeLoopSessions = (
  state: LoopSessionMeterState,
  acknowledged: number,
): LoopSessionMeterState => {
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
 * Same period: the server owns `syncedCount` but we take the max, because
 * quota is monotonic within a month and a lagging read must never hand back
 * allowance. Local `pendingCount` survives — those are the sessions the server
 * has not seen. The open-session stamp is always local: it is device state
 * about a sitting in progress, and the server has no opinion on it.
 *
 * Different periods: the later month wins. Pending sessions from a month that
 * has rolled are dropped rather than carried forward, because charging a rider
 * in October for an unsynced September session is indistinguishable from a bug.
 */
export const mergeLoopSessionMeters = (
  local: LoopSessionMeterState,
  remote: LoopSessionMeterState,
): LoopSessionMeterState => {
  if (local.periodKey === remote.periodKey) {
    return {
      periodKey: local.periodKey,
      syncedCount: Math.max(
        Math.max(0, local.syncedCount),
        Math.max(0, remote.syncedCount),
      ),
      pendingCount: Math.max(0, local.pendingCount),
      sessionStartedAt: local.sessionStartedAt,
    };
  }

  if (remote.periodKey > local.periodKey) {
    return {
      periodKey: remote.periodKey,
      syncedCount: Math.max(0, remote.syncedCount),
      pendingCount: 0,
      sessionStartedAt: null,
    };
  }

  return {
    periodKey: local.periodKey,
    syncedCount: Math.max(0, local.syncedCount),
    pendingCount: Math.max(0, local.pendingCount),
    sessionStartedAt: local.sessionStartedAt,
  };
};
