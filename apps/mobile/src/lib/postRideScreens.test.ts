import { describe, expect, it } from 'vitest';

import {
  QUIET_FIRST_RIDES,
  isEarlyEndReasonDue,
  isNearDestination,
  isQuietRide,
  isRatingDue,
} from './postRideScreens';

describe('isQuietRide', () => {
  it('keeps the first three rides free of post-ride screens', () => {
    expect(isQuietRide(0)).toBe(true);
    expect(isQuietRide(1)).toBe(true);
    expect(isQuietRide(QUIET_FIRST_RIDES - 1)).toBe(true);
  });

  it('shows the screens from the fourth ride on', () => {
    expect(isQuietRide(QUIET_FIRST_RIDES)).toBe(false);
    expect(isQuietRide(20)).toBe(false);
  });

  it('is pinned at three rides', () => {
    expect(QUIET_FIRST_RIDES).toBe(3);
  });
});

describe('isRatingDue', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-10-09T12:00:00Z');
  const never = { lastRide: null, lastAt: null };

  it('never asks during the quiet first rides', () => {
    expect(isRatingDue(1, never, now)).toBe(false);
    expect(isRatingDue(3, never, now)).toBe(false);
  });

  it('asks first on ride 4, or on the first ride after it for a rider never asked', () => {
    expect(isRatingDue(4, never, now)).toBe(true);
    expect(isRatingDue(12, never, now)).toBe(true);
  });

  it('then needs BOTH five more rides and fourteen days', () => {
    const asked = { lastRide: 4, lastAt: new Date(now - 20 * DAY).toISOString() };
    expect(isRatingDue(8, asked, now)).toBe(false);
    expect(isRatingDue(9, asked, now)).toBe(true);
    const recent = { lastRide: 4, lastAt: new Date(now - 10 * DAY).toISOString() };
    expect(isRatingDue(20, recent, now)).toBe(false);
  });
});

describe('isEarlyEndReasonDue', () => {
  it('asks on every third early stop, starting with the first', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(isEarlyEndReasonDue)).toEqual([
      true, false, false, true, false, false, true,
    ]);
  });
});

describe('isNearDestination', () => {
  const dest = { lat: 44.4268, lon: 26.1025 };

  it('treats a stop within 150 m of the destination as arrived', () => {
    expect(isNearDestination({ lat: 44.4277, lon: 26.1025 }, dest)).toBe(true); // ~100 m
    expect(isNearDestination({ lat: 44.4290, lon: 26.1025 }, dest)).toBe(false); // ~245 m
  });

  it('is false with no position or no destination (the 0,0 placeholder)', () => {
    expect(isNearDestination(null, dest)).toBe(false);
    expect(isNearDestination(dest, { lat: 0, lon: 0 })).toBe(false);
  });
});
