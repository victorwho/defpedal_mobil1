import { describe, expect, it } from 'vitest';

import type { RiskSegment } from './contracts';
import {
  RISK_CATEGORY_ORDER,
  computeRiskDistribution,
} from './riskDistribution';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal RiskSegment with a LineString geometry. */
const makeSegment = (
  riskCategory: string,
  coords: [number, number][],
  id = 'seg',
  color = '#000',
): RiskSegment => ({
  id,
  riskScore: 0,
  riskCategory,
  color,
  geometry: {
    type: 'LineString',
    coordinates: coords,
  },
});

/** Build a RiskSegment with a MultiLineString geometry. */
const makeMultiSegment = (
  riskCategory: string,
  lines: [number, number][][],
  id = 'mseg',
  color = '#000',
): RiskSegment => ({
  id,
  riskScore: 0,
  riskCategory,
  color,
  geometry: {
    type: 'MultiLineString',
    coordinates: lines,
  },
});

// ---------------------------------------------------------------------------
// RISK_CATEGORY_ORDER constant
// ---------------------------------------------------------------------------

describe('RISK_CATEGORY_ORDER', () => {
  it('has exactly 8 categories (including No data)', () => {
    expect(RISK_CATEGORY_ORDER).toHaveLength(8);
  });

  it('starts with "No data" and ends with "Extreme"', () => {
    expect(RISK_CATEGORY_ORDER[0]).toBe('No data');
    expect(RISK_CATEGORY_ORDER[RISK_CATEGORY_ORDER.length - 1]).toBe('Extreme');
  });

  it('contains all expected labels in safest-to-most-dangerous order', () => {
    expect(RISK_CATEGORY_ORDER).toEqual([
      'No data',
      'Very safe',
      'Safe',
      'Average',
      'Elevated',
      'Risky',
      'Very risky',
      'Extreme',
    ]);
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
    const seg = makeSegment('Very safe', [[26.1025, 44.4268]]);
    expect(computeRiskDistribution([seg])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — uses server-provided riskCategory
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — classification', () => {
  it('uses the riskCategory field from the segment', () => {
    const seg = makeSegment('Risky', [[0, 0], [0, 0.001]]);
    const result = computeRiskDistribution([seg]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].category.label).toBe('Risky');
  });

  it('preserves the color from the segment', () => {
    const seg = makeSegment('Safe', [[0, 0], [0, 0.001]], 'seg', '#8BC34A');
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.color).toBe('#8BC34A');
  });

  it('falls back to "No data" when riskCategory is missing', () => {
    // Simulate a segment without riskCategory (e.g., from old API)
    const seg: RiskSegment = {
      id: 'legacy',
      riskScore: 20,
      riskCategory: undefined as unknown as string,
      color: '#4CAF50',
      geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0.001]] },
    };
    const result = computeRiskDistribution([seg]);
    expect(result[0].category.label).toBe('No data');
  });

  it('handles all 7 standard categories', () => {
    const categories = ['Very safe', 'Safe', 'Average', 'Elevated', 'Risky', 'Very risky', 'Extreme'];
    for (const cat of categories) {
      const seg = makeSegment(cat, [[0, 0], [0, 0.001]]);
      const result = computeRiskDistribution([seg]);
      expect(result[0].category.label).toBe(cat);
    }
  });
});

// ---------------------------------------------------------------------------
// computeRiskDistribution — percentage accuracy
// ---------------------------------------------------------------------------

describe('computeRiskDistribution — percentage and distance', () => {
  it('returns 100% for a single-category route', () => {
    const seg = makeSegment('Very safe', [[0, 0], [0, 1]]);
    const result = computeRiskDistribution([seg]);
    expect(result).toHaveLength(1);
    expect(result[0].percentage).toBe(100);
  });

  it('percentages of all returned entries sum to approximately 100', () => {
    const segments = [
      makeSegment('Very safe', [[0, 0], [0, 1]], 'safe'),
      makeSegment('Risky', [[0, 1], [1, 1]], 'risky'),
    ];
    const result = computeRiskDistribution(segments);
    const total = result.reduce((sum, e) => sum + e.percentage, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('returns only categories with non-zero distance', () => {
    const seg = makeSegment('Very safe', [[0, 0], [0, 1]]);
    const result = computeRiskDistribution([seg]);
    for (const entry of result) {
      expect(entry.distanceMeters).toBeGreaterThan(0);
    }
  });

  it('distanceMeters is positive for each returned entry', () => {
    const seg = makeSegment('Average', [[26.1025, 44.4268], [26.11, 44.43]]);
    const result = computeRiskDistribution([seg]);
    expect(result[0].distanceMeters).toBeGreaterThan(0);
  });

  it('merges two segments of the same category into one entry', () => {
    const segments = [
      makeSegment('Very safe', [[0, 0], [0, 0.01]], 'a'),
      makeSegment('Very safe', [[0, 0.01], [0, 0.02]], 'b'),
    ];
    const result = computeRiskDistribution(segments);
    expect(result.filter((e) => e.category.label === 'Very safe')).toHaveLength(1);
  });

  it('handles three distinct categories and returns one entry per category', () => {
    const segments = [
      makeSegment('Very safe', [[0, 0], [0, 1]], 'a'),
      makeSegment('Safe', [[1, 0], [1, 1]], 'b'),
      makeSegment('Very risky', [[2, 0], [2, 1]], 'c'),
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
      makeSegment('Very risky', [[0, 0], [0, 1]], 'risky'),
      makeSegment('Very safe', [[1, 0], [1, 1]], 'safe'),
    ];
    const result = computeRiskDistribution(segments);
    const indices = result.map((e) =>
      RISK_CATEGORY_ORDER.indexOf(e.category.label),
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
    const seg = makeMultiSegment('Very safe', [
      [[0, 0], [0, 0.5]],
      [[1, 0], [1, 0.5]],
    ]);
    const result = computeRiskDistribution([seg]);
    expect(result).toHaveLength(1);
    expect(result[0].distanceMeters).toBeGreaterThan(0);
    expect(result[0].category.label).toBe('Very safe');
  });

  it('mixes LineString and MultiLineString in the same distribution', () => {
    const lineSegment = makeSegment('Very safe', [[0, 0], [0, 1]], 'line');
    const multiSegment = makeMultiSegment('Risky', [[[1, 0], [1, 1]]], 'multi');
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
      makeSegment('Very safe', [[0, 0], [0, 1]], 'a'),
      makeSegment('Risky', [[1, 0], [1, 1]], 'b'),
    ];
    const originalLength = segments.length;
    const originalIds = segments.map((s) => s.id);
    computeRiskDistribution(segments);
    expect(segments).toHaveLength(originalLength);
    expect(segments.map((s) => s.id)).toEqual(originalIds);
  });
});
