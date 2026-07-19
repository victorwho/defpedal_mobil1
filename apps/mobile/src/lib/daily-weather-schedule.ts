/**
 * Randomized cadence for the cycling-weather notification.
 *
 * The old system fired every morning at 8:30. This module replaces the fixed
 * daily anchor with:
 *
 *   1. A persisted "chain" of fire times separated by random intervals drawn
 *      uniformly from 12h (2x/day) to 120h (once per 5 days). The chain lives
 *      in the Zustand store so reopening the app does NOT re-roll the dice —
 *      without persistence, frequent openers would keep cancelling long draws
 *      and the delivered cadence would collapse well below the intended one.
 *   2. An inactivity escalation: every scheduling pass ALSO pre-schedules
 *      daily fires starting 3 days after `now` (= the current app open).
 *      Opening the app cancels and recomputes everything, so those escalation
 *      fires only ever reach users who genuinely haven't used the app for
 *      3+ consecutive days.
 *
 * All fire times are snapped forward into a waking window (08:30–21:00 local)
 * so a random draw can never ping someone at 3am.
 *
 * Pure functions — no native modules, no IO, injectable `random` — so this is
 * trivially testable in Node-env Vitest.
 */

import { TRIGGER_HOUR, TRIGGER_MINUTE } from './daily-weather-messages';

/** 2x per day. */
export const MIN_INTERVAL_HOURS = 12;
/** Once every 5 days. */
export const MAX_INTERVAL_HOURS = 120;
/** After 3 consecutive days without an app open, escalate (daily fires). */
export const ESCALATION_AFTER_DAYS = 3;
/** How far past `now` the persisted chain is kept extended. */
export const CHAIN_HORIZON_DAYS = 7;
/** No fires at or after this local hour — snap to next morning instead. */
export const QUIET_START_HOUR = 21;
/** Never schedule two fires closer together than this. */
export const MIN_GAP_HOURS = 6;
/** Defensive ceiling on scheduled one-shots (iOS caps pending at 64). */
export const MAX_SCHEDULED_FIRES = 12;

const HOUR_MS = 60 * 60 * 1000;

const addHours = (d: Date, hours: number): Date =>
  new Date(d.getTime() + hours * HOUR_MS);

/**
 * Calendar-day addition preserving local wall-clock time (setDate-based).
 * "N days later" must survive DST transitions — raw-millisecond addition
 * drifts by the DST offset twice a year (review 2026-07-19, finding M1).
 * Chain draws deliberately keep millisecond math: they are elapsed-time
 * intervals, not calendar anchors.
 */
const addDays = (d: Date, days: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
};

/** Uniform draw in [MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS]. */
export const drawIntervalHours = (
  random: () => number = Math.random,
): number => {
  // Clamp defensively — a misbehaving PRNG outside [0,1) must not escape the
  // interval bounds.
  const r = Math.min(1, Math.max(0, random()));
  return MIN_INTERVAL_HOURS + r * (MAX_INTERVAL_HOURS - MIN_INTERVAL_HOURS);
};

/**
 * Snap a candidate fire time forward into the waking window:
 *   - before 08:30 → same day 08:30
 *   - at/after 21:00 → next day 08:30
 *   - otherwise unchanged
 * Forward-only, so snapping preserves the ordering of an increasing sequence.
 */
export const clampToWakingWindow = (candidate: Date): Date => {
  const clamped = new Date(candidate);
  const beforeWindow =
    candidate.getHours() < TRIGGER_HOUR ||
    (candidate.getHours() === TRIGGER_HOUR && candidate.getMinutes() < TRIGGER_MINUTE);
  if (beforeWindow) {
    clamped.setHours(TRIGGER_HOUR, TRIGGER_MINUTE, 0, 0);
    return clamped;
  }
  if (candidate.getHours() >= QUIET_START_HOUR) {
    clamped.setDate(clamped.getDate() + 1);
    clamped.setHours(TRIGGER_HOUR, TRIGGER_MINUTE, 0, 0);
    return clamped;
  }
  return clamped;
};

/**
 * Advance the persisted chain: drop past entries, keep future ones untouched
 * (this is what preserves the cadence across app opens), and extend with
 * fresh random draws until the chain reaches `now + CHAIN_HORIZON_DAYS`.
 */
export const advanceWeatherChain = (
  chain: readonly Date[],
  now: Date,
  random: () => number = Math.random,
): Date[] => {
  const horizonEnd = addDays(now, CHAIN_HORIZON_DAYS);
  const future = chain
    .filter((t) => t.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  let last = future.length > 0 ? future[future.length - 1] : now;
  const extended = [...future];
  while (last.getTime() < horizonEnd.getTime()) {
    last = clampToWakingWindow(addHours(last, drawIntervalHours(random)));
    extended.push(last);
  }
  return extended;
};

/**
 * Escalation fires for a user who stays away: one per calendar day starting
 * exactly 3 days after the current app open (same local wall-clock time,
 * DST-safe), snapped to the waking window.
 */
export const buildEscalationFires = (now: Date): Date[] => {
  const fires: Date[] = [];
  const horizonEnd = addDays(now, CHAIN_HORIZON_DAYS);
  for (let day = ESCALATION_AFTER_DAYS; ; day += 1) {
    const raw = addDays(now, day);
    if (raw.getTime() >= horizonEnd.getTime()) break;
    fires.push(clampToWakingWindow(raw));
  }
  return fires;
};

/** Drop any fire closer than MIN_GAP_HOURS after the previously kept one. */
const enforceMinGap = (sorted: readonly Date[]): Date[] => {
  const kept: Date[] = [];
  for (const fire of sorted) {
    const prev = kept[kept.length - 1];
    if (!prev || fire.getTime() - prev.getTime() >= MIN_GAP_HOURS * HOUR_MS) {
      kept.push(fire);
    }
  }
  return kept;
};

export interface WeatherScheduleResult {
  /** Updated chain to persist (future entries only, horizon-extended). */
  readonly chain: readonly Date[];
  /** Fire times to actually schedule as one-shot notifications, ascending. */
  readonly fires: readonly Date[];
}

/**
 * One scheduling pass. Materializes:
 *   - chain entries within [now+60s, now+3 calendar days) — the random
 *     baseline cadence
 *   - daily escalation fires in [now+3d, now+7d) (calendar days)
 * merged, min-gap-enforced, capped. The returned `chain` (NOT the same thing
 * as `fires`) is what must be persisted for the next pass.
 */
export const buildWeatherSchedule = (
  persistedChain: readonly Date[],
  now: Date,
  random: () => number = Math.random,
): WeatherScheduleResult => {
  const chain = advanceWeatherChain(persistedChain, now, random);
  const escalationStart = addDays(now, ESCALATION_AFTER_DAYS);
  const minFireTime = new Date(now.getTime() + 60 * 1000);
  const baseline = chain.filter(
    (t) =>
      t.getTime() >= minFireTime.getTime() &&
      t.getTime() < escalationStart.getTime(),
  );
  const merged = enforceMinGap(
    [...baseline, ...buildEscalationFires(now)].sort(
      (a, b) => a.getTime() - b.getTime(),
    ),
  );
  if (merged.length <= MAX_SCHEDULED_FIRES) {
    return { chain, fires: merged };
  }
  // Over the cap: a plain tail-slice would drop the LATEST fires first —
  // which are exactly the escalation fires guaranteeing inactivity coverage.
  // Instead keep every escalation fire and trim the newest baseline draws
  // (review 2026-07-19, LOW). Escalation fires all sit at/after
  // escalationStart (clamp is forward-only); baseline all before it.
  const escalation = merged.filter((t) => t.getTime() >= escalationStart.getTime());
  const keptBaseline = merged
    .filter((t) => t.getTime() < escalationStart.getTime())
    .slice(0, Math.max(0, MAX_SCHEDULED_FIRES - escalation.length));
  return { chain, fires: [...keptBaseline, ...escalation] };
};

/**
 * Which Open-Meteo daily row (local calendar day offset from `now`) a fire
 * time falls on. `Math.round` absorbs DST hour shifts.
 */
export const forecastDayIndex = (fire: Date, now: Date): number => {
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(
    0,
    Math.round((startOfDay(fire) - startOfDay(now)) / (24 * HOUR_MS)),
  );
};
