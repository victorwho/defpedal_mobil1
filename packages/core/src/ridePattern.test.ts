import { describe, expect, it } from 'vitest';
import { computeRidePattern } from './ridePattern';

const ISO = (utcHourOffset: number, day = 1) => {
  // Build an ISO string for 2026-05-{day}T{utcHourOffset:02d}:00:00Z
  return new Date(Date.UTC(2026, 4, day, utcHourOffset, 0, 0)).toISOString();
};

describe('computeRidePattern', () => {
  it('returns null when no timestamps are provided', () => {
    expect(computeRidePattern([], 'Europe/Bucharest')).toBeNull();
  });

  it('returns null when sample size is below MIN_SAMPLES (3)', () => {
    expect(computeRidePattern([ISO(7), ISO(7)], 'Europe/Bucharest')).toBeNull();
  });

  it('identifies the modal hour with high confidence on perfect signal', () => {
    // 10 rides, all at the same UTC hour. In Bucharest (UTC+3 in May), that's
    // the modal hour + 3.
    const utcHour = 5; // -> 08:00 Bucharest summer
    const trips = Array.from({ length: 10 }, (_, i) => ISO(utcHour, i + 1));
    const result = computeRidePattern(trips, 'Europe/Bucharest');
    expect(result).not.toBeNull();
    expect(result!.typicalStartHour).toBe(8); // 5 UTC + 3h CEST offset
    expect(result!.sampleCount).toBe(10);
    expect(result!.confidence).toBe(1); // 10/10 * 10/10
  });

  it('uses tie-break: earliest modal hour wins', () => {
    // 3 rides at 06:00 UTC, 3 rides at 17:00 UTC. Both are modal.
    const trips = [
      ISO(6, 1), ISO(6, 2), ISO(6, 3),
      ISO(17, 4), ISO(17, 5), ISO(17, 6),
    ];
    const result = computeRidePattern(trips, 'UTC');
    expect(result).not.toBeNull();
    expect(result!.typicalStartHour).toBe(6);
  });

  it('lowers confidence on diffuse signal', () => {
    // 5 different hours, one ride each → modal share 0.2, sample bonus 0.5 → confidence ~0.10
    const trips = [ISO(6, 1), ISO(7, 2), ISO(8, 3), ISO(9, 4), ISO(10, 5)];
    const result = computeRidePattern(trips, 'UTC');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThan(0.3);
    expect(result!.sampleCount).toBe(5);
  });

  it('caps confidence at 1 when both modal share and sample count are high', () => {
    const trips = Array.from({ length: 12 }, () => ISO(7, 1));
    const result = computeRidePattern(trips, 'UTC');
    expect(result!.confidence).toBeLessThanOrEqual(1);
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('handles different timezones (typical hour is local, not UTC)', () => {
    // 10 rides at 18:00 UTC. New York in May is UTC-4 (EDT) → 14:00 local.
    const trips = Array.from({ length: 10 }, (_, i) => ISO(18, i + 1));
    const result = computeRidePattern(trips, 'America/New_York');
    expect(result!.typicalStartHour).toBe(14);
  });

  it('ignores malformed timestamps without crashing', () => {
    const trips = [
      ISO(7), ISO(7), ISO(7),
      'not-a-timestamp',
      'also bad',
    ];
    const result = computeRidePattern(trips, 'UTC');
    expect(result).not.toBeNull();
    expect(result!.typicalStartHour).toBe(7);
    expect(result!.sampleCount).toBe(3); // 3 valid trips counted
  });
});
