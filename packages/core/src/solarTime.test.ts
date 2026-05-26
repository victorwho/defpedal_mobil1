import { describe, expect, it } from 'vitest';
import {
  computeSolarTimes,
  isAfterSunset,
  isBeforeSunrise,
  isDark,
} from './solarTime';

/**
 * Reference times for known dates. Tolerance is +/- 5 minutes since the
 * NOAA algorithm is good to ~1 min and the test fixtures are taken from
 * timeanddate.com.
 */
const FIVE_MIN_MS = 5 * 60 * 1000;

describe('computeSolarTimes — Bucharest (44.43°N, 26.10°E)', () => {
  // Reference: 2026-06-21 (summer solstice). Local sunrise ~05:32 EEST,
  // local sunset ~21:04 EEST. EEST = UTC+3 → UTC 02:32 / 18:04.
  it('summer solstice: returns sunrise around 02:30-02:35 UTC', () => {
    const { sunrise } = computeSolarTimes(44.43, 26.10, new Date('2026-06-21T12:00:00Z'));
    const expected = Date.UTC(2026, 5, 21, 2, 32, 0);
    expect(Math.abs(sunrise.getTime() - expected)).toBeLessThan(FIVE_MIN_MS);
  });

  it('summer solstice: returns sunset around 18:00-18:10 UTC', () => {
    const { sunset } = computeSolarTimes(44.43, 26.10, new Date('2026-06-21T12:00:00Z'));
    const expected = Date.UTC(2026, 5, 21, 18, 4, 0);
    expect(Math.abs(sunset.getTime() - expected)).toBeLessThan(FIVE_MIN_MS);
  });

  // Winter solstice. Bucharest local sunrise ~07:46 EET (UTC+2 in winter),
  // local sunset ~16:38 EET → UTC 05:46 / 14:38.
  it('winter solstice: returns sunrise around 05:45-05:50 UTC', () => {
    const { sunrise } = computeSolarTimes(44.43, 26.10, new Date('2026-12-21T12:00:00Z'));
    const expected = Date.UTC(2026, 11, 21, 5, 46, 0);
    expect(Math.abs(sunrise.getTime() - expected)).toBeLessThan(FIVE_MIN_MS);
  });

  it('winter solstice: returns sunset around 14:35-14:42 UTC', () => {
    const { sunset } = computeSolarTimes(44.43, 26.10, new Date('2026-12-21T12:00:00Z'));
    const expected = Date.UTC(2026, 11, 21, 14, 38, 0);
    expect(Math.abs(sunset.getTime() - expected)).toBeLessThan(FIVE_MIN_MS);
  });
});

describe('computeSolarTimes — defensive', () => {
  it('returns NaN times for invalid lat/lon', () => {
    const { sunrise, sunset } = computeSolarTimes(
      Number.NaN,
      Number.NaN,
      new Date('2026-06-21T12:00:00Z'),
    );
    expect(Number.isNaN(sunrise.getTime())).toBe(true);
    expect(Number.isNaN(sunset.getTime())).toBe(true);
  });

  it('returns NaN times for polar latitude at solstice', () => {
    // 80°N at winter solstice — polar night, no sunrise.
    const { sunrise, sunset } = computeSolarTimes(
      80,
      0,
      new Date('2026-12-21T12:00:00Z'),
    );
    expect(Number.isNaN(sunrise.getTime())).toBe(true);
    expect(Number.isNaN(sunset.getTime())).toBe(true);
  });
});

describe('isAfterSunset', () => {
  // 2026-06-21 sunset in Bucharest ~18:04 UTC.
  it('returns true after sunset on the summer solstice', () => {
    expect(isAfterSunset(44.43, 26.10, new Date('2026-06-21T20:00:00Z'))).toBe(true);
  });

  it('returns false midday on the summer solstice', () => {
    expect(isAfterSunset(44.43, 26.10, new Date('2026-06-21T12:00:00Z'))).toBe(false);
  });

  it('fails closed (returns true) for polar conditions', () => {
    expect(isAfterSunset(80, 0, new Date('2026-12-21T12:00:00Z'))).toBe(true);
  });

  it('fails closed (returns true) for invalid coords', () => {
    expect(isAfterSunset(Number.NaN, Number.NaN, new Date('2026-06-21T12:00:00Z'))).toBe(true);
  });
});

describe('isBeforeSunrise', () => {
  // 2026-06-21 sunrise in Bucharest ~02:32 UTC.
  it('returns true before sunrise on the summer solstice', () => {
    expect(isBeforeSunrise(44.43, 26.10, new Date('2026-06-21T01:00:00Z'))).toBe(true);
  });

  it('returns false midday', () => {
    expect(isBeforeSunrise(44.43, 26.10, new Date('2026-06-21T12:00:00Z'))).toBe(false);
  });
});

describe('isDark — composite', () => {
  it('returns true between sunset and midnight', () => {
    expect(isDark(44.43, 26.10, new Date('2026-06-21T20:00:00Z'))).toBe(true);
  });

  it('returns true between midnight and sunrise', () => {
    expect(isDark(44.43, 26.10, new Date('2026-06-21T01:00:00Z'))).toBe(true);
  });

  it('returns false at solar noon', () => {
    expect(isDark(44.43, 26.10, new Date('2026-06-21T11:00:00Z'))).toBe(false);
  });
});
