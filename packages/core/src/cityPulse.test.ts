import { describe, expect, it } from 'vitest';

import {
  CITY_PULSE_GUARANTEE_DAYS,
  CITY_PULSE_MIN_N,
  CITY_PULSE_RATE_MAX,
  CITY_PULSE_SMALL_TOWN_RATE_CAP,
  CITY_PULSE_WINDOW_END_MINUTES,
  CITY_PULSE_WINDOW_START_MINUTES,
  COUNTRY_CYCLING_SHARE,
  computeCityRiderCount,
  drawInitialFireAt,
  drawNextFireAt,
  getCityPulseWeatherFactor,
  isGuaranteeBreached,
  localDateISO,
  type Rng,
} from './cityPulse';
import type { CyclingForecast } from './cyclingWeather';

const DAY_MS = 24 * 60 * 60 * 1000;

const GOOD_FORECAST: CyclingForecast = {
  tempMin: 14,
  tempMax: 24,
  precipitationProbability: 10,
  windSpeedMax: 12,
  weatherCode: 1,
};

// Cool-but-dry: outside the happy window (tempMin < 10) but not safety-bad.
const MEDIOCRE_FORECAST: CyclingForecast = {
  ...GOOD_FORECAST,
  tempMin: 5,
};

const STORM_FORECAST: CyclingForecast = {
  ...GOOD_FORECAST,
  weatherCode: 95,
};

/** rng stub cycling through the given values. */
const rngOf = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('COUNTRY_CYCLING_SHARE', () => {
  it('covers all 31 supported countries with the documented anchors', () => {
    expect(Object.keys(COUNTRY_CYCLING_SHARE)).toHaveLength(31);
    expect(COUNTRY_CYCLING_SHARE.NL).toEqual({ share: 0.41, measured: true });
    expect(COUNTRY_CYCLING_SHARE.SE).toEqual({ share: 0.21, measured: true });
    expect(COUNTRY_CYCLING_SHARE.DE).toEqual({ share: 0.15, measured: true });
    expect(COUNTRY_CYCLING_SHARE.HU).toEqual({ share: 0.14, measured: true });
    expect(COUNTRY_CYCLING_SHARE.FI).toEqual({ share: 0.13, measured: true });
    expect(COUNTRY_CYCLING_SHARE.DK).toEqual({ share: 0.12, measured: true });
    expect(COUNTRY_CYCLING_SHARE.BE).toEqual({ share: 0.12, measured: true });
    expect(COUNTRY_CYCLING_SHARE.FR).toEqual({ share: 0.03, measured: true });
    // Estimated countries default to the 8% EU average.
    for (const code of ['RO', 'ES', 'NO', 'IS', 'LI', 'CH', 'IT', 'PL'] as const) {
      expect(COUNTRY_CYCLING_SHARE[code]).toEqual({ share: 0.08, measured: false });
    }
  });
});

describe('computeCityRiderCount — determinism', () => {
  it('same city + date always produces the same N', () => {
    const a = computeCityRiderCount('RO|Bucharest|44.43', 1_877_155, 'RO', '2026-07-17', 1.0);
    const b = computeCityRiderCount('RO|Bucharest|44.43', 1_877_155, 'RO', '2026-07-17', 1.0);
    expect(a.n).toBe(b.n);
    expect(a.rate).toBe(b.rate);
  });

  it('a different date changes the seed inputs', () => {
    const days = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'];
    const ns = days.map(
      (d) => computeCityRiderCount('RO|Bucharest|44.43', 1_877_155, 'RO', d, 1.0).n,
    );
    // At least one weekday-pair must differ — five identical draws would mean
    // the date is not feeding the seed at all.
    expect(new Set(ns).size).toBeGreaterThan(1);
  });
});

describe('computeCityRiderCount — rate clamps', () => {
  it('caps NL at the 40% ceiling (3 × 41% > 100%)', () => {
    const r = computeCityRiderCount('NL|Amsterdam|52.37', 741_636, 'NL', '2026-07-17', 1.0);
    expect(r.rate).toBe(CITY_PULSE_RATE_MAX);
  });

  it('caps SE at the 40% ceiling (3 × 21% = 63%)', () => {
    const r = computeCityRiderCount('SE|Stockholm|59.33', 1_515_017, 'SE', '2026-07-17', 1.0);
    expect(r.rate).toBe(CITY_PULSE_RATE_MAX);
  });

  it('caps towns under 50k at 9% regardless of country', () => {
    // Râșnov-sized RO town: 1.5 × 8% × jitter ∈ [10.2%, 13.8%] — always above
    // the small-town cap, so the cap must bind.
    const town = computeCityRiderCount('RO|Râşnov|45.58', 15_253, 'RO', '2026-07-17', 1.0);
    expect(town.rate).toBe(CITY_PULSE_SMALL_TOWN_RATE_CAP);

    // NL small town: would be 40% without the small-town cap.
    const nlTown = computeCityRiderCount('NL|Sneek|53.03', 33_000, 'NL', '2026-07-17', 1.0);
    expect(nlTown.rate).toBe(CITY_PULSE_SMALL_TOWN_RATE_CAP);
  });

  it('leaves mid-range countries between the clamps (FR ≈ 9%)', () => {
    const r = computeCityRiderCount('FR|Paris|48.85', 2_138_551, 'FR', '2026-07-17', 1.0);
    // 3 × 3% × jitter ∈ [7.65%, 10.35%]
    expect(r.rate).toBeGreaterThanOrEqual(0.0765);
    expect(r.rate).toBeLessThanOrEqual(0.1035);
  });

  it('unknown country codes fall back to the estimated default', () => {
    const r = computeCityRiderCount('??|Nowhere|0.00', 200_000, '', '2026-07-17', 1.0);
    // 1.5 × 8% × jitter ∈ [10.2%, 13.8%]
    expect(r.rate).toBeGreaterThanOrEqual(0.102);
    expect(r.rate).toBeLessThanOrEqual(0.138);
  });
});

describe('computeCityRiderCount — factors and presentation', () => {
  it('applies the weekend factor on Sat/Sun only', () => {
    // 2026-07-17 = Friday, 2026-07-18 = Saturday, 2026-07-19 = Sunday.
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-07-17', 1).weekdayFactor).toBe(1.0);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-07-18', 1).weekdayFactor).toBe(1.15);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-07-19', 1).weekdayFactor).toBe(1.15);
  });

  it('applies the seasonal factor by month', () => {
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-07-15', 1).seasonFactor).toBe(1.0);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-04-15', 1).seasonFactor).toBe(1.0);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-03-15', 1).seasonFactor).toBe(0.8);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-10-15', 1).seasonFactor).toBe(0.8);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-01-15', 1).seasonFactor).toBe(0.5);
    expect(computeCityRiderCount('k', 100_000, 'RO', '2026-11-15', 1).seasonFactor).toBe(0.5);
  });

  it('floors N at 40 even for tiny populations', () => {
    const r = computeCityRiderCount('XX|Hamlet|0.00', 100, '', '2026-01-15', 0.6);
    expect(r.n).toBeGreaterThanOrEqual(CITY_PULSE_MIN_N);
    expect(r.n).toBeLessThan(CITY_PULSE_MIN_N + 10); // 40 + seeded 0–9 offset
  });

  it('produces a non-round figure (nearest 10 + seeded 0–9 offset)', () => {
    const r = computeCityRiderCount('RO|Bucharest|44.43', 1_877_155, 'RO', '2026-07-17', 1.0);
    expect(Number.isInteger(r.n)).toBe(true);
    // The offset is deterministic: recomputing yields the identical n.
    expect(computeCityRiderCount('RO|Bucharest|44.43', 1_877_155, 'RO', '2026-07-17', 1.0).n).toBe(r.n);
  });

  it('mediocre weather scales N down versus good weather', () => {
    const good = computeCityRiderCount('k', 500_000, 'RO', '2026-07-17', 1.0);
    const meh = computeCityRiderCount('k', 500_000, 'RO', '2026-07-17', 0.6);
    expect(meh.n).toBeLessThan(good.n);
  });
});

describe('getCityPulseWeatherFactor', () => {
  it('maps good / mediocre / bad / missing correctly', () => {
    expect(getCityPulseWeatherFactor(GOOD_FORECAST)).toBe(1.0);
    expect(getCityPulseWeatherFactor(MEDIOCRE_FORECAST)).toBe(0.6);
    expect(getCityPulseWeatherFactor(STORM_FORECAST)).toBeNull();
    expect(getCityPulseWeatherFactor(null)).toBeNull();
    expect(getCityPulseWeatherFactor(undefined)).toBeNull();
  });
});

describe('scheduling draws — window bounds', () => {
  const localMinuteOf = (fireAt: Date, utcOffsetHours: number): number => {
    const localMs = fireAt.getTime() + utcOffsetHours * 60 * 60 * 1000;
    const dayMs = ((localMs % DAY_MS) + DAY_MS) % DAY_MS;
    return Math.floor(dayMs / 60_000);
  };

  it('drawNextFireAt lands 1–5 days out at a minute inside [07:00, 21:30] local', () => {
    const lastSent = new Date('2026-07-17T12:00:00Z');
    for (let i = 0; i <= 100; i++) {
      const fraction = i / 100;
      const fireAt = drawNextFireAt(lastSent, rngOf(fraction, fraction), 2);
      const minute = localMinuteOf(fireAt, 2);
      expect(minute).toBeGreaterThanOrEqual(CITY_PULSE_WINDOW_START_MINUTES);
      expect(minute).toBeLessThanOrEqual(CITY_PULSE_WINDOW_END_MINUTES);
      const gapDays = (fireAt.getTime() - lastSent.getTime()) / DAY_MS;
      expect(gapDays).toBeGreaterThan(0);
      expect(gapDays).toBeLessThanOrEqual(CITY_PULSE_GUARANTEE_DAYS + 1); // ≤5 days + window shift
    }
  });

  it('drawNextFireAt extremes: rng→0 gives day+1 at 07:00, rng→~1 gives day+5 at 21:30', () => {
    const lastSent = new Date('2026-07-17T12:00:00Z');
    const early = drawNextFireAt(lastSent, rngOf(0, 0), 2);
    expect(localMinuteOf(early, 2)).toBe(CITY_PULSE_WINDOW_START_MINUTES);
    const late = drawNextFireAt(lastSent, rngOf(0.999999, 0.999999), 2);
    expect(localMinuteOf(late, 2)).toBe(CITY_PULSE_WINDOW_END_MINUTES);
    const gapDays = Math.round((late.getTime() - lastSent.getTime()) / DAY_MS);
    expect(gapDays).toBe(5);
  });

  it('drawInitialFireAt is in the window, in the future, and within ~6 days', () => {
    const now = new Date('2026-07-17T20:00:00Z');
    for (let i = 0; i <= 60; i++) {
      const fraction = i / 60.0001;
      const fireAt = drawInitialFireAt(now, rngOf(fraction, fraction), 2);
      const minute = localMinuteOf(fireAt, 2);
      expect(minute).toBeGreaterThanOrEqual(CITY_PULSE_WINDOW_START_MINUTES);
      expect(minute).toBeLessThanOrEqual(CITY_PULSE_WINDOW_END_MINUTES);
      expect(fireAt.getTime()).toBeGreaterThan(now.getTime());
      expect(fireAt.getTime() - now.getTime()).toBeLessThanOrEqual(6 * DAY_MS);
    }
  });

  it('respects the UTC offset when placing the window', () => {
    const lastSent = new Date('2026-07-17T12:00:00Z');
    // Same rng, offsets 0 vs +2: the UTC instants must differ by exactly 2h.
    const utc0 = drawNextFireAt(lastSent, rngOf(0.5, 0.5), 0);
    const utc2 = drawNextFireAt(lastSent, rngOf(0.5, 0.5), 2);
    expect(utc0.getTime() - utc2.getTime()).toBe(2 * 60 * 60 * 1000);
  });
});

describe('isGuaranteeBreached', () => {
  const now = new Date('2026-07-17T12:00:00Z');

  it('is false before the first send (null baseline)', () => {
    expect(isGuaranteeBreached(null, now)).toBe(false);
    expect(isGuaranteeBreached(undefined, now)).toBe(false);
  });

  it('is false within the 5-day guarantee and true past it', () => {
    expect(isGuaranteeBreached(new Date(now.getTime() - 4 * DAY_MS), now)).toBe(false);
    expect(isGuaranteeBreached(new Date(now.getTime() - 5 * DAY_MS), now)).toBe(false);
    expect(isGuaranteeBreached(new Date(now.getTime() - 5 * DAY_MS - 60_000), now)).toBe(true);
    expect(isGuaranteeBreached('2026-07-10T12:00:00Z', now)).toBe(true);
  });

  it('fails closed on malformed timestamps', () => {
    expect(isGuaranteeBreached('not-a-date', now)).toBe(false);
  });
});

describe('localDateISO', () => {
  it('shifts the calendar date across midnight by offset', () => {
    // 23:30 UTC + 2h = 01:30 next day local.
    expect(localDateISO(new Date('2026-07-17T23:30:00Z'), 2)).toBe('2026-07-18');
    expect(localDateISO(new Date('2026-07-17T23:30:00Z'), 0)).toBe('2026-07-17');
  });
});
