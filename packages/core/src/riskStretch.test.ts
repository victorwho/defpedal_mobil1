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

  it('returns 0 when no segment is in the High risk tier', () => {
    const segments = [
      makeSegment('Safer', 0.001),
      makeSegment('Typical', 0.002),
      makeSegment('Safer', 0.001),
      makeSegment('Typical', 0.003),
      makeSegment('Typical', 0.002),
      makeSegment('No data', 0.001),
    ];
    expect(longestHighRiskStretchMeters(segments)).toBe(0);
  });

  it('measures a single High risk segment', () => {
    const segments = [
      makeSegment('Typical', 0.002),
      makeSegment('High risk', 0.002),
      makeSegment('Typical', 0.001),
    ];
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(2 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(2 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('sums contiguous High risk runs', () => {
    const segments = [
      makeSegment('High risk', 0.002),
      makeSegment('High risk', 0.003),
      makeSegment('Typical', 0.001),
    ];
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(5 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(5 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('resets the run when a calm segment interrupts, keeping the longest', () => {
    const segments = [
      makeSegment('High risk', 0.001),
      makeSegment('Typical', 0.001),
      makeSegment('High risk', 0.002),
      makeSegment('High risk', 0.002),
      makeSegment('Typical', 0.001),
      makeSegment('High risk', 0.001),
    ];
    // Longest run is the middle one: 0.004° ≈ 444.8 m
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeGreaterThan(4 * METERS_PER_MILLIDEG_LAT * 0.95);
    expect(result).toBeLessThan(4 * METERS_PER_MILLIDEG_LAT * 1.05);
  });

  it('does not count the Typical tier as a busy-road stretch', () => {
    const segments = [
      makeSegment('High risk', 0.001),
      makeSegment('Typical', 0.005),
      makeSegment('High risk', 0.001),
    ];
    // Typical breaks contiguity — each High risk run is ~111 m on its own.
    const result = longestHighRiskStretchMeters(segments);
    expect(result).toBeLessThan(2 * METERS_PER_MILLIDEG_LAT);
  });
});
