import { describe, expect, it } from 'vitest';

import type { RiskSegment } from './contracts';
import { longestHighRiskStretchMeters } from './riskStretch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal RiskSegment with a LineString geometry running north from
 * `startLat` for `lengthDegLat` degrees of latitude. 0.001° lat ≈ 111.2 m,
 * so segment lengths are predictable for assertions.
 */
const makeSegment = (
  riskCategory: string,
  lengthDegLat: number,
  startLat = 44.4,
  id = 'seg',
): RiskSegment => ({
  id,
  riskScore: 0,
  riskCategory,
  color: '#000',
  geometry: {
    type: 'LineString',
    coordinates: [
      [26.1, startLat],
      [26.1, startLat + lengthDegLat],
    ],
  },
});

/** ~111.2 m per 0.001° latitude. */
const METERS_PER_MILLIDEG_LAT = 111.19;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('longestHighRiskStretchMeters', () => {
  it('returns 0 for an empty segment list', () => {
    expect(longestHighRiskStretchMeters([])).toBe(0);
  });

  it('returns 0 when no segment is in a busy-road band', () => {
    const segments = [
      makeSegment('Very safe', 0.001),
      makeSegment('Safe', 0.002),
      makeSegment('Average', 0.001),
      makeSegment('Elevated', 0.003),
      makeSegment('Risky', 0.002),
      makeSegment('No data', 0.001),
    ];
    expect(longestHighRiskStretchMeters(segments)).toBe(0);
  });

  it('measures a single Very risky segment', () => {
    const segments = [
      makeSegment('Safe', 0.002),
      makeSegment('Very risky', 0.002),
      makeSegment('Safe', 0.001),
    ];
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(2 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(2 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('sums contiguous Very risky + Extreme runs', () => {
    const segments = [
      makeSegment('Very risky', 0.002),
      makeSegment('Extreme', 0.003),
      makeSegment('Safe', 0.001),
    ];
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(5 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(5 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('resets the run when a calm segment interrupts, keeping the longest', () => {
    const segments = [
      makeSegment('Very risky', 0.001),
      makeSegment('Safe', 0.001),
      makeSegment('Very risky', 0.002),
      makeSegment('Extreme', 0.002),
      makeSegment('Average', 0.001),
      makeSegment('Very risky', 0.001),
    ];
    // Longest run is the middle one: 0.004° ≈ 444.8 m
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(4 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(4 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('does not count the Risky band as a busy-road stretch', () => {
    const segments = [
      makeSegment('Very risky', 0.001),
      makeSegment('Risky', 0.005),
      makeSegment('Very risky', 0.001),
    ];
    // Risky breaks contiguity — each Very risky run is ~111 m on its own.
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeLessThan(2 * METERS_PER_MILLIDEG_LAT);
  });
});
