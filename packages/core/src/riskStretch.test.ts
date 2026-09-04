import { describe, expect, it } from 'vitest';

import type { RiskSegment } from './contracts';
import { findHighRiskStretches, longestHighRiskStretchMeters } from './riskStretch';

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

describe('findHighRiskStretches', () => {
  it('returns nothing for an empty list', () => {
    expect(findHighRiskStretches([])).toEqual([]);
  });

  it('returns nothing when the route never enters the busy tier', () => {
    const segments = [
      makeSegment('Safer', 0.002, 44.4, 'a'),
      makeSegment('Typical', 0.002, 44.402, 'b'),
    ];

    expect(findHighRiskStretches(segments)).toEqual([]);
  });

  it('groups a contiguous run into ONE stretch', () => {
    const segments = [
      makeSegment('Safer', 0.002, 44.4, 'a'),
      makeSegment('High risk', 0.002, 44.402, 'b'),
      makeSegment('High risk', 0.003, 44.404, 'c'),
      makeSegment('Safer', 0.002, 44.407, 'd'),
    ];

    const stretches = findHighRiskStretches(segments);

    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.startIndex).toBe(1);
    expect(stretches[0]!.endIndex).toBe(2);
    expect(stretches[0]!.lengthMeters).toBeGreaterThan(
      5 * METERS_PER_MILLIDEG_LAT * 0.95,
    );
    expect(stretches[0]!.lengthMeters).toBeLessThan(
      5 * METERS_PER_MILLIDEG_LAT * 1.05,
    );
  });

  it('separates runs split by a calm segment', () => {
    const segments = [
      makeSegment('High risk', 0.002, 44.4, 'a'),
      makeSegment('Safer', 0.002, 44.402, 'b'),
      makeSegment('High risk', 0.002, 44.404, 'c'),
    ];

    const stretches = findHighRiskStretches(segments);

    expect(stretches).toHaveLength(2);
    expect(stretches[0]!.startIndex).toBe(0);
    expect(stretches[1]!.startIndex).toBe(2);
  });

  it('closes a run that reaches the end of the route', () => {
    const segments = [
      makeSegment('Safer', 0.002, 44.4, 'a'),
      makeSegment('High risk', 0.002, 44.402, 'b'),
    ];

    const stretches = findHighRiskStretches(segments);

    expect(stretches).toHaveLength(1);
    expect(stretches[0]!.endIndex).toBe(1);
  });

  it('reports where along the route each stretch begins', () => {
    const segments = [
      makeSegment('Safer', 0.002, 44.4, 'a'),
      makeSegment('High risk', 0.002, 44.402, 'b'),
    ];

    const [stretch] = findHighRiskStretches(segments);

    // Preceded by one ~222 m calm segment.
    expect(stretch!.distanceFromStartMeters).toBeGreaterThan(
      2 * METERS_PER_MILLIDEG_LAT * 0.95,
    );
    expect(stretch!.distanceFromStartMeters).toBeLessThan(
      2 * METERS_PER_MILLIDEG_LAT * 1.05,
    );
  });

  it('exposes a focus point on the stretch for the map to fly to', () => {
    const segments = [makeSegment('High risk', 0.002, 44.402, 'a')];
    const [stretch] = findHighRiskStretches(segments);

    expect(stretch!.focus).toEqual({ lat: 44.402, lon: 26.1 });
  });

  it('agrees with longestHighRiskStretchMeters', () => {
    const segments = [
      makeSegment('High risk', 0.002, 44.4, 'a'),
      makeSegment('Safer', 0.001, 44.402, 'b'),
      makeSegment('High risk', 0.002, 44.403, 'c'),
      makeSegment('High risk', 0.002, 44.405, 'd'),
    ];

    const longest = Math.max(
      ...findHighRiskStretches(segments).map((s) => s.lengthMeters),
    );

    expect(longest).toBeCloseTo(longestHighRiskStretchMeters(segments), 6);
  });
});
