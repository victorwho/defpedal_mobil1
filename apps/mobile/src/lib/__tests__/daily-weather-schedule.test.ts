// @vitest-environment node
/**
 * Tests for the randomized weather-notification cadence.
 *
 * Axes pinned here:
 *   1. drawIntervalHours — bounds (12h..120h) + defensive clamping of a
 *      misbehaving PRNG.
 *   2. clampToWakingWindow — fires only land in [08:30, 21:00), forward-only.
 *   3. advanceWeatherChain — persistence semantics: future entries survive a
 *      pass untouched (no re-roll on app open), past entries drop, the chain
 *      extends to the 7-day horizon with >=12h spacing.
 *   4. buildEscalationFires — daily fires starting exactly 3 days after the
 *      last app open, inside the waking window, within the horizon.
 *   5. buildWeatherSchedule — baseline fires only within [now+60s, now+72h),
 *      escalation beyond, sorted, min-gap enforced, capped.
 *   6. forecastDayIndex — maps fire times onto Open-Meteo daily rows.
 */
import { describe, expect, it } from 'vitest';

import {
  CHAIN_HORIZON_DAYS,
  ESCALATION_AFTER_DAYS,
  MAX_INTERVAL_HOURS,
  MAX_SCHEDULED_FIRES,
  MIN_GAP_HOURS,
  MIN_INTERVAL_HOURS,
  QUIET_START_HOUR,
  advanceWeatherChain,
  buildEscalationFires,
  buildWeatherSchedule,
  clampToWakingWindow,
  drawIntervalHours,
  forecastDayIndex,
} from '../daily-weather-schedule';

const HOUR_MS = 60 * 60 * 1000;

/** Deterministic PRNG that replays a fixed sequence, then repeats the last. */
const seqRandom = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const inWakingWindow = (d: Date): boolean => {
  const afterStart =
    d.getHours() > 8 || (d.getHours() === 8 && d.getMinutes() >= 30);
  return afterStart && d.getHours() < QUIET_START_HOUR;
};

// ---------------------------------------------------------------------------
// 1. drawIntervalHours
// ---------------------------------------------------------------------------

describe('drawIntervalHours', () => {
  it('maps random=0 to the 12h floor (2x/day)', () => {
    expect(drawIntervalHours(() => 0)).toBe(MIN_INTERVAL_HOURS);
  });

  it('maps random=1 to the 120h ceiling (once per 5 days)', () => {
    expect(drawIntervalHours(() => 1)).toBe(MAX_INTERVAL_HOURS);
  });

  it('maps random=0.5 to the midpoint (66h)', () => {
    expect(drawIntervalHours(() => 0.5)).toBe(66);
  });

  it('clamps a misbehaving PRNG into bounds', () => {
    expect(drawIntervalHours(() => -3)).toBe(MIN_INTERVAL_HOURS);
    expect(drawIntervalHours(() => 42)).toBe(MAX_INTERVAL_HOURS);
  });
});

// ---------------------------------------------------------------------------
// 2. clampToWakingWindow
// ---------------------------------------------------------------------------

describe('clampToWakingWindow', () => {
  it('leaves an in-window time unchanged', () => {
    const t = new Date(2026, 6, 20, 14, 45, 12);
    expect(clampToWakingWindow(t).getTime()).toBe(t.getTime());
  });

  it('snaps a pre-dawn time forward to the same-day 08:30', () => {
    const snapped = clampToWakingWindow(new Date(2026, 6, 20, 3, 15));
    expect(snapped).toEqual(new Date(2026, 6, 20, 8, 30, 0, 0));
  });

  it('snaps 08:29 forward to 08:30 but keeps 08:30 as-is', () => {
    expect(clampToWakingWindow(new Date(2026, 6, 20, 8, 29))).toEqual(
      new Date(2026, 6, 20, 8, 30, 0, 0),
    );
    const exact = new Date(2026, 6, 20, 8, 30, 0, 0);
    expect(clampToWakingWindow(exact).getTime()).toBe(exact.getTime());
  });

  it('snaps a late-evening time to the NEXT day 08:30', () => {
    const snapped = clampToWakingWindow(new Date(2026, 6, 20, 21, 0));
    expect(snapped).toEqual(new Date(2026, 6, 21, 8, 30, 0, 0));
  });

  it('is forward-only (never moves a time earlier)', () => {
    for (const hour of [0, 5, 8, 12, 20, 21, 23]) {
      const t = new Date(2026, 6, 20, hour, 10);
      expect(clampToWakingWindow(t).getTime()).toBeGreaterThanOrEqual(
        t.getTime(),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. advanceWeatherChain
// ---------------------------------------------------------------------------

describe('advanceWeatherChain', () => {
  const now = new Date(2026, 6, 20, 10, 0, 0);

  it('seeds an empty chain from `now` out past the 7-day horizon', () => {
    const chain = advanceWeatherChain([], now, () => 0.5); // 66h draws
    expect(chain.length).toBeGreaterThan(0);
    const last = chain[chain.length - 1];
    expect(last.getTime()).toBeGreaterThanOrEqual(
      now.getTime() + CHAIN_HORIZON_DAYS * 24 * HOUR_MS,
    );
  });

  it('preserves future entries untouched — an app open never re-rolls them', () => {
    const keeper = new Date(2026, 6, 22, 15, 0, 0);
    const chain = advanceWeatherChain([keeper], now, () => 0.5);
    expect(chain.some((t) => t.getTime() === keeper.getTime())).toBe(true);
  });

  it('drops past entries', () => {
    const past = new Date(2026, 6, 19, 9, 0, 0);
    const chain = advanceWeatherChain([past], now, () => 0.5);
    expect(chain.every((t) => t.getTime() > now.getTime())).toBe(true);
  });

  it('all entries land in the waking window, ascending, >=12h apart pre-clamp', () => {
    const chain = advanceWeatherChain([], now, seqRandom([0, 0, 0, 0.9, 0.1, 0.3]));
    for (const t of chain) expect(inWakingWindow(t)).toBe(true);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].getTime()).toBeGreaterThan(chain[i - 1].getTime());
    }
  });

  it('back-to-back 12h draws yield ~2 fires per day (morning + evening)', () => {
    const chain = advanceWeatherChain([], now, () => 0);
    // 10:00 + 12h = 22:00 → snapped to next-day 08:30, then 20:30, then
    // snapped again… the cadence alternates but never violates the window.
    const firstTwo = chain.slice(0, 2);
    expect(firstTwo[1].getTime() - firstTwo[0].getTime()).toBeGreaterThanOrEqual(
      12 * HOUR_MS,
    );
  });

  it('re-anchors at `now` when every persisted entry is stale (long absence)', () => {
    const stale = [new Date(2026, 6, 1, 8, 30), new Date(2026, 6, 3, 8, 30)];
    const chain = advanceWeatherChain(stale, now, () => 0.5);
    expect(chain[0].getTime()).toBeGreaterThan(now.getTime());
    expect(chain[0].getTime()).toBeLessThanOrEqual(
      now.getTime() + (MAX_INTERVAL_HOURS + 12) * HOUR_MS,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. buildEscalationFires
// ---------------------------------------------------------------------------

describe('buildEscalationFires', () => {
  it('starts exactly 3 days after the app open when that lands in-window', () => {
    const now = new Date(2026, 6, 20, 10, 0, 0); // +72h = 10:00, in window
    const fires = buildEscalationFires(now);
    expect(fires[0]).toEqual(new Date(2026, 6, 23, 10, 0, 0));
  });

  it('snaps an out-of-window day-3 mark to the next morning 08:30', () => {
    const now = new Date(2026, 6, 20, 22, 30, 0); // +72h = 22:30 → next 08:30
    const fires = buildEscalationFires(now);
    expect(fires[0]).toEqual(new Date(2026, 6, 24, 8, 30, 0, 0));
  });

  it('then fires daily, all in the waking window, within the 7-day horizon', () => {
    const now = new Date(2026, 6, 20, 10, 0, 0);
    const fires = buildEscalationFires(now);
    expect(fires).toHaveLength(4); // days 3, 4, 5, 6
    for (const f of fires) {
      expect(inWakingWindow(f)).toBe(true);
      expect(f.getTime()).toBeLessThan(new Date(2026, 6, 27, 10, 0, 0).getTime());
      expect(f.getTime()).toBeGreaterThanOrEqual(
        new Date(2026, 6, 23, 10, 0, 0).getTime(),
      );
    }
    expect(ESCALATION_AFTER_DAYS).toBe(3);
  });

  it('preserves local wall-clock across DST transitions (calendar-day math)', () => {
    // 2026-03-27 10:00 local; +3 days crosses the EU spring-forward night
    // (Mar 29) in timezones that observe it. Calendar-day math lands at
    // 10:00 local on Mar 30 regardless; the raw-millisecond math this
    // replaced (review 2026-07-19, M1) would land at 11:00 in EU timezones.
    // In non-DST timezones (e.g. UTC CI) both agree, so this never flakes.
    const now = new Date(2026, 2, 27, 10, 0, 0);
    const fires = buildEscalationFires(now);
    expect(fires[0].getDate()).toBe(30);
    expect(fires[0].getHours()).toBe(10);
    expect(fires[0].getMinutes()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. buildWeatherSchedule
// ---------------------------------------------------------------------------

describe('buildWeatherSchedule', () => {
  const now = new Date(2026, 6, 20, 10, 0, 0);

  it('baseline fires stay inside [now+60s, now+3d); escalation beyond', () => {
    const { fires } = buildWeatherSchedule([], now, () => 0.5);
    const escalationStart = new Date(2026, 6, 23, 10, 0, 0).getTime();
    for (const f of fires) {
      expect(f.getTime()).toBeGreaterThanOrEqual(now.getTime() + 60 * 1000);
    }
    // Escalation guarantees at least daily coverage after day 3.
    const afterDay3 = fires.filter((f) => f.getTime() >= escalationStart);
    expect(afterDay3.length).toBeGreaterThanOrEqual(3);
  });

  it('a 5-day draw still produces escalation fires from day 3 (the whole point)', () => {
    const { fires } = buildWeatherSchedule([], now, () => 1); // 120h draws
    // Baseline contributes nothing before day 3; the inactive user still
    // hears from us daily starting day 3.
    const escalationStart = new Date(2026, 6, 23, 10, 0, 0).getTime();
    expect(fires.length).toBeGreaterThanOrEqual(4);
    expect(fires[0].getTime()).toBeGreaterThanOrEqual(escalationStart);
  });

  it('fires are ascending and respect the minimum gap', () => {
    const { fires } = buildWeatherSchedule([], now, seqRandom([0, 0, 0, 0, 0.2]));
    for (let i = 1; i < fires.length; i += 1) {
      expect(fires[i].getTime() - fires[i - 1].getTime()).toBeGreaterThanOrEqual(
        MIN_GAP_HOURS * HOUR_MS,
      );
    }
  });

  it('never schedules more than the cap', () => {
    const { fires } = buildWeatherSchedule([], now, () => 0);
    expect(fires.length).toBeLessThanOrEqual(MAX_SCHEDULED_FIRES);
  });

  it('cap truncation drops baseline draws, never the escalation fires', () => {
    // A dense persisted chain: 10 future entries 6h apart inside the 3-day
    // baseline window. With 4 escalation fires that's 14 candidates > the
    // cap of 12 — the 4 escalation fires must ALL survive.
    const dense = Array.from(
      { length: 10 },
      (_, k) => new Date(now.getTime() + (12 + 6 * k) * HOUR_MS),
    );
    const { fires } = buildWeatherSchedule(dense, now, () => 0.5);
    expect(fires.length).toBeLessThanOrEqual(MAX_SCHEDULED_FIRES);
    const escalationStart = new Date(2026, 6, 23, 10, 0, 0).getTime();
    const survivingEscalation = fires.filter((f) => f.getTime() >= escalationStart);
    expect(survivingEscalation.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < fires.length; i += 1) {
      expect(fires[i].getTime()).toBeGreaterThan(fires[i - 1].getTime());
    }
  });

  it('returns the horizon-extended chain for persistence (superset window of fires)', () => {
    const { chain } = buildWeatherSchedule([], now, () => 0.5);
    expect(chain[chain.length - 1].getTime()).toBeGreaterThanOrEqual(
      now.getTime() + CHAIN_HORIZON_DAYS * 24 * HOUR_MS,
    );
  });

  it('a persisted future entry within 72h is scheduled at its original time', () => {
    const keeper = new Date(2026, 6, 21, 15, 0, 0);
    const { fires } = buildWeatherSchedule([keeper], now, () => 1);
    expect(fires.some((f) => f.getTime() === keeper.getTime())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. forecastDayIndex
// ---------------------------------------------------------------------------

describe('forecastDayIndex', () => {
  const now = new Date(2026, 6, 20, 10, 0, 0);

  it('same calendar day → 0', () => {
    expect(forecastDayIndex(new Date(2026, 6, 20, 20, 30), now)).toBe(0);
  });

  it('tomorrow morning → 1', () => {
    expect(forecastDayIndex(new Date(2026, 6, 21, 8, 30), now)).toBe(1);
  });

  it('six days out → 6', () => {
    expect(forecastDayIndex(new Date(2026, 6, 26, 8, 30), now)).toBe(6);
  });

  it('late-night now vs early fire still counts whole calendar days', () => {
    const lateNow = new Date(2026, 6, 20, 23, 50, 0);
    expect(forecastDayIndex(new Date(2026, 6, 21, 8, 30), lateNow)).toBe(1);
  });

  it('never returns a negative index', () => {
    expect(forecastDayIndex(new Date(2026, 6, 19, 8, 30), now)).toBe(0);
  });
});
