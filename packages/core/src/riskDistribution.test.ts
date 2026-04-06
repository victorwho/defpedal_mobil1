import { describe, expect, it } from 'vitest';

import type { RiskSegment } from './contracts';
import {
  RISK_CATEGORIES,
  computeRiskDistribution,
} from './riskDistribution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal RiskSegment with a LineString geometry. */
const makeSegment = (
  riskScore: number,
  coords: [number, number][],
  id = 'seg',
): RiskSegment => ({
  id,
  riskScore,
  color: '#000',
  geometry: {
    type: 'LineString',
    coordinates: coords,
  },
});

/** Build a RiskSegment with a MultiLineString geometry. */
const makeMultiSegment = (
  riskScore: number,
  lines: [number, number][][],
  id = 'mseg',
): RiskSegment => ({
  id,
  riskScore,
  color: '#000',
  geometry: {
    type: 'MultiLineString',
    coordinates: lines,
  },
});

// ---------------------------------------------------------------------------
// RISK_CATEGORIES constant
// ---------------------------------------------------------------------------

describe('RISK_CATEGORIES', () => {
  it('has exactly 7 categories', () => {
    expect(RISK_CATEGORIES).toHaveLength(7);
  });

  it('starts with "Very safe" and ends with "Extreme"', () => {
    expect(RISK_CATEGORIES[0].label).toBe('Very safe');
    expect(RISK_CATEGORIES[RISK_CATEGORIES.length - 1].label).toBe('Extreme');
  });

  it('covers the full score range from -Infinity to Infinity without gaps', () => {
    for (let i = 1; i < RISK_CATEGORIES.length; i++) {
      expect(RISK_CATEGORIES[i].minScore).toBe(RISK_CATEGORIES[i - 1].maxScore);
    }
    expect(RISK_CATEGORIES[0].minScore).toBe(-Infinity);
    expect(RISK_CATEGORIES[RISK_CATEGORIES.length - 1].maxScore).toBe(Infinity);
  });

  it('each category has a valid hex color string', () => {
    for (const cat of RISK_CATEGORIES) {
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
    }
  });

  it('has minScore < maxScore for every category', () => {
    for (const cat of RISK_CATEGORIES) {
      expect(cat.minScore).toBeLessThan(cat.maxScore);
    }
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — empty / trivial inputs
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — empty inputs', () => {
  it('returns an empty array for an empty segment list', () => {
    expect(computeRiskDistribution([])).toEqual([]);
  });

  it('returns an empty array when a segment has zero-length geometry', () => {
    // A segment with one coordinate has no edges to sum
    const seg = makeSegment(20, [[26.1025, 44.4268]]);
    expect(computeRiskDistribution([seg])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — classification
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — classification', () => {
  it('classifies score 0 as "Very safe"', () => {
    const seg = makeSegment(0, [[0, 0], [0, 0.001]], 's1');
    const result = computeRiskDistribution([seg]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].category.label).toBe('Very safe');
  });

  it('classifies score 29.9 as "Very safe"', () => {
    const seg = makeSegment(29.9, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Very safe');
  });

  it('classifies score 30 as "Very safe"', () => {
    const seg = makeSegment(30, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Very safe');
  });

  it('classifies score 43.5 as "Average"', () => {
    const seg = makeSegment(43.5, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Average');
  });

  it('classifies score 51.8 as "Elevated"', () => {
    const seg = makeSegment(51.8, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Elevated');
  });

  it('classifies score 57.6 as "Risky"', () => {
    const seg = makeSegment(57.6, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Risky');
  });

  it('classifies score 69 as "Very risky"', () => {
    const seg = makeSegment(69, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Very risky');
  });

  it('classifies score 101.8 as "Extreme"', () => {
    const seg = makeSegment(101.8, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Extreme');
  });

  it('classifies a very large score as "Extreme"', () => {
    const seg = makeSegment(9999, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Extreme');
  });

  it('classifies a very negative score as "Very safe"', () => {
    const seg = makeSegment(-100, [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('Very safe');
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — percentage accuracy
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — percentage and distance', () => {
  it('returns 100% for a single-category route', () => {
    const seg = makeSegment(20, [[0, 0], [0, 1]]);
    const result = computeRiskDistribution([seg]);
    expect(result).toHaveLength(1);
    expect(result[0].percentage).toBe(100);
  });

  it('percentages of all returned entries sum to approximately 100', () => {
    const segments = [
      makeSegment(20, [[0, 0], [0, 1]], 'safe'),      // Very safe
      makeSegment(60, [[0, 1], [1, 1]], 'risky'),     // Risky
    ];
    const result = computeRiskDistribution(segments);
    const total = result.reduce((sum, e) => sum + e.percentage, 0);
    // Rounding may cause 99 or 101
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('returns only categories with non-zero distance', () => {
    const seg = makeSegment(20, [[0, 0], [0, 1]]);
    const result = computeRiskDistribution([seg]);
    for (const entry of result) {
      expect(entry.distanceMeters).toBeGreaterThan(0);
    }
  });

  it('distanceMeters is positive for each returned entry', () => {
    const seg = makeSegment(45, [[26.1025, 44.4268], [26.11, 44.43]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].distanceMeters).toBeGreaterThan(0);
  });

  it('merges two segments of the same category into one entry', () => {
    const segments = [
      makeSegment(20, [[0, 0], [0, 0.01]], 'a'),
      makeSegment(25, [[0, 0.01], [0, 0.02]], 'b'),
    ];
    const result = computeRiskDistribution(segments);
    // Both score < 30 → "Very safe" → should appear once
    const entry = result.find((e) => e.category.label === 'Very safe');
    expect(entry).toBeDefined();
    expect(result.filter((e) => e.category.label === 'Very safe')).toHaveLength(1);
  });

  it('handles three distinct categories and returns one entry per category', () => {
    const segments = [
      makeSegment(20, [[0, 0], [0, 1]], 'a'),       // Very safe
      makeSegment(40, [[1, 0], [1, 1]], 'b'),       // Safe
      makeSegment(70, [[2, 0], [2, 1]], 'c'),       // Very risky
    ];
    const result = computeRiskDistribution(segments);
    const labels = result.map((e) => e.category.label);
    expect(labels).toContain('Very safe');
    expect(labels).toContain('Safe');
    expect(labels).toContain('Very risky');
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — result ordering
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — ordering', () => {
  it('returns entries ordered from safest to most dangerous', () => {
    const segments = [
      makeSegment(70, [[0, 0], [0, 1]], 'risky'),
      makeSegment(20, [[1, 0], [1, 1]], 'safe'),
    ];
    const result = computeRiskDistribution(segments);
    // Find the positions of each result in RISK_CATEGORIES
    const indices = result.map((e) =>
      RISK_CATEGORIES.findIndex((cat) => cat.label === e.category.label),
    );
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — MultiLineString geometry
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — MultiLineString support', () => {
  it('computes distance correctly for MultiLineString segments', () => {
    const seg = makeMultiSegment(20, [
      [[0, 0], [0, 0.5]],
      [[1, 0], [1, 0.5]],
    ]);
    const result = computeRiskDistribution([seg]);
    expect(result).toHaveLength(1);
    expect(result[0].distanceMeters).toBeGreaterThan(0);
    expect(result[0].category.label).toBe('Very safe');
  });

  it('mixes LineString and MultiLineString in the same distribution', () => {
    const lineSegment = makeSegment(20, [[0, 0], [0, 1]], 'line');
    const multiSegment = makeMultiSegment(60, [[[1, 0], [1, 1]]], 'multi');
    const result = computeRiskDistribution([lineSegment, multiSegment]);
    expect(result).toHaveLength(2);
    const total = result.reduce((sum, e) => sum + e.percentage, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — immutability
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — immutability', () => {
  it('does not mutate the input segments array', () => {
    const segments: RiskSegment[] = [
      makeSegment(20, [[0, 0], [0, 1]], 'a'),
      makeSegment(60, [[1, 0], [1, 1]], 'b'),
    ];
    const originalLength = segments.length;
    const originalIds = segments.map((s) => s.id);
    computeRiskDistribution(segments);
    expect(segments).toHaveLength(originalLength);
    expect(segments.map((s) => s.id)).toEqual(originalIds);
  });
});
