/**
 * Client-side throttle for planned-route recording.
 *
 * Pure, and separate from the caller, because the interesting part is a
 * decision rather than a network call — the same split as
 * [appOpenTelemetry.ts].
 *
 * The problem this solves: `route-preview.tsx` refetches whenever the rider
 * cycles Safe/Fast/Flat, because the query key carries `mode` and `avoidHills`.
 * Recording per fetch would count one rider comparing three modes on one
 * destination as three planned routes, inflating the figure by however many
 * riders happen to touch the toggle. A planned route is an INTENT — one origin,
 * one destination — not a routing request.
 *
 * ⚠️ This is the first of two guards, not the only one. It lives in memory and
 * is therefore lost on every app restart, and absent entirely on older builds,
 * so the server dedupes as well (`lib/plannedRoutes.ts`). Do not remove the
 * server half on the strength of this one.
 */

/** Coordinate precision used to build a plan key. */
const KEY_PRECISION_DP = 4;

/**
 * Minimum gap before the SAME plan is recorded again.
 *
 * Matches the server's `PLAN_DEDUPE_WINDOW_MS`. Keep the two in step: a client
 * window shorter than the server's just wastes requests the server discards; a
 * longer one hides genuine re-plans the server would have accepted.
 */
export const PLAN_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** How many distinct plan keys to remember before evicting the oldest. */
const MAX_TRACKED_PLANS = 32;

export type PlanKeyInput = {
  readonly originLat: number;
  readonly originLon: number;
  readonly destLat: number;
  readonly destLon: number;
};

/**
 * Stable key for one planning intent.
 *
 * Deliberately mode-independent — switching Safe to Flat is the same intent —
 * and rounded to ~11 m so GPS jitter on the origin does not mint a new plan
 * each time the preview remounts.
 *
 * Note the destination is used to BUILD the key but is never transmitted: the
 * key is sent as an opaque string and the destination itself never leaves the
 * device (see the privacy note in lib/plannedRoutes.ts).
 */
export const buildPlanKey = ({
  originLat,
  originLon,
  destLat,
  destLon,
}: PlanKeyInput): string => {
  const r = (n: number): string => n.toFixed(KEY_PRECISION_DP);
  return `${r(originLat)},${r(originLon)}>${r(destLat)},${r(destLon)}`;
};

export type PlanMemory = Readonly<Record<string, number>>;

export const shouldRecordPlan = (
  key: string,
  seen: PlanMemory,
  nowMs: number,
  minIntervalMs: number = PLAN_MIN_INTERVAL_MS,
): boolean => {
  const last = seen[key];
  if (last === undefined) return true;
  // A clock that jumped backwards (NTP correction, manual change) must not lock
  // recording out until it catches up.
  if (nowMs < last) return true;
  return nowMs - last >= minIntervalMs;
};

/**
 * Remember that `key` was recorded at `nowMs`, evicting the oldest entries past
 * the cap so a long session cannot grow this without bound.
 */
export const rememberPlan = (
  key: string,
  seen: PlanMemory,
  nowMs: number,
  maxTracked: number = MAX_TRACKED_PLANS,
): PlanMemory => {
  const next: Record<string, number> = { ...seen, [key]: nowMs };
  const keys = Object.keys(next);
  if (keys.length <= maxTracked) return next;

  // Oldest-first; drop the overflow. Evicting an entry only risks one duplicate
  // request, which the server then dedupes.
  const byAge = keys.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
  for (const stale of byAge.slice(0, keys.length - maxTracked)) {
    delete next[stale];
  }
  return next;
};
