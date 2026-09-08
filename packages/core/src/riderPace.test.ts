import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PACE_KMH,
  MIN_RIDES_FOR_PACE,
  rideMinutes,
  riderPace,
} from './riderPace';

/** A ride of `km` covered in `minutes`. */
const ride = (km: number, minutes: number, startedAt = '2026-09-01T08:00:00Z') => ({
  distanceMeters: km * 1000,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
});

describe('riderPace', () => {
  it('falls back to the default with no history', () => {
    const pace = riderPace([]);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
    expect(pace.personal).toBe(false);
  });

  it('waits for enough rides before trusting them', () => {
    // One ride is an anecdote. An estimate that lurches after each ride reads
    // as broken rather than personal.
    const pace = riderPace([ride(20, 40), ride(20, 40)]);
    expect(pace.personal).toBe(false);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
    expect(MIN_RIDES_FOR_PACE).toBe(3);
  });

  it('uses the rider’s own speed once there are enough rides', () => {
    // Three rides at 30 km/h.
    const pace = riderPace([ride(15, 30), ride(20, 40), ride(10, 20)]);
    expect(pace.personal).toBe(true);
    expect(pace.kmh).toBeCloseTo(30, 5);
    expect(pace.rideCount).toBe(3);
  });

  it('is not dragged down by one ride that sat paused', () => {
    // The reason this is a median. A 90-minute coffee stop on a 20 km ride
    // reads as 13 km/h; pooling distance over time would apply that to every
    // future estimate.
    const median = riderPace([ride(20, 40), ride(20, 40), ride(20, 40), ride(20, 130)]);
    expect(median.kmh).toBeCloseTo(30, 1);
  });

  it('drops rides that cannot be bicycle rides', () => {
    // A stopped clock reads as an absurd speed and would otherwise become the
    // middle value on a short history.
    const pace = riderPace([
      ride(20, 40),
      ride(20, 40),
      ride(20, 40),
      ride(50, 3), // 1000 km/h
      ride(1, 600), // 0.1 km/h
    ]);
    expect(pace.kmh).toBeCloseTo(30, 1);
    expect(pace.rideCount).toBe(3);
  });

  it('ignores rides that never ended, and trivial ones', () => {
    const pace = riderPace([
      { distanceMeters: 20_000, startedAt: '2026-09-01T08:00:00Z', endedAt: null },
      ride(0.2, 5),
      { distanceMeters: undefined, startedAt: '2026-09-01T08:00:00Z', endedAt: '2026-09-01T09:00:00Z' },
    ]);
    expect(pace.personal).toBe(false);
  });

  it('survives unparseable timestamps', () => {
    const pace = riderPace([
      { distanceMeters: 20_000, startedAt: 'not-a-date', endedAt: 'nor-this' },
    ]);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
  });
});

describe('rideMinutes', () => {
  it('is distance over pace on the flat', () => {
    expect(rideMinutes(30_000, 0, 15)).toBe(120);
    expect(rideMinutes(30_000, null, 15)).toBe(120);
  });

  it('costs time for climbing', () => {
    // Wrong in the direction that leaves someone out after dark is the failure
    // that matters, so a hilly loop must not be quoted at flat-ground pace.
    const flat = rideMinutes(30_000, 0, 15);
    const hilly = rideMinutes(30_000, 600, 15);
    expect(hilly).toBeGreaterThan(flat);
  });

  it('never returns zero or a negative', () => {
    expect(rideMinutes(0, null, 15)).toBe(1);
    expect(rideMinutes(-100, null, 15)).toBe(1);
    expect(rideMinutes(10_000, null, 0)).toBeGreaterThan(0);
  });
});
