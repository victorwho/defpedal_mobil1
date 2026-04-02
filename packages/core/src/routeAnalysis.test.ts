import { describe, expect, it } from 'vitest';

import type { Route } from './types';
import { analyzeRoute, getAdjustedDuration } from './routeAnalysis';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRoute = (overrides: Partial<Route> = {}): Route => ({
  geometry: { type: 'LineString', coordinates: [] },
  legs: [],
  distance: 1000,
  duration: 300,
  weight_name: 'duration',
  weight: 300,
  ...overrides,
});

const makeStep = (
  mode: string,
  name: string,
  distance = 100,
): Route['legs'][number]['steps'][number] => ({
  intersections: [],
  maneuver: {
    bearing_after: 0,
    bearing_before: 0,
    location: [0, 0],
    type: 'depart',
  },
  name,
  duration: 30,
  distance,
  driving_side: 'right',
  weight: 30,
  mode,
  geometry: { type: 'LineString', coordinates: [] },
});

// ---------------------------------------------------------------------------
// getAdjustedDuration
// ---------------------------------------------------------------------------

describe('getAdjustedDuration', () => {
  it('returns the flat duration unchanged with no elevation profile', () => {
    const result = getAdjustedDuration(300, null);
    expect(result.adjustedDuration).toBe(300);
    expect(result.elevationGain).toBe(0);
    expect(result.numberOfClimbs).toBe(0);
  });

  it('returns flat duration unchanged for a single-element profile', () => {
    const result = getAdjustedDuration(300, [100]);
    expect(result.adjustedDuration).toBe(300);
    expect(result.elevationGain).toBe(0);
  });

  it('returns flat duration unchanged for a flat profile', () => {
    const result = getAdjustedDuration(300, [100, 100, 100]);
    expect(result.adjustedDuration).toBe(300);
    expect(result.elevationGain).toBe(0);
    expect(result.numberOfClimbs).toBe(0);
  });

  it('calculates elevation gain and adjusted duration for a simple climb', () => {
    // Profile: 100 → 110 → 120 → 100 (gain 20m, 1 climb)
    const result = getAdjustedDuration(300, [100, 110, 120, 100]);
    expect(result.elevationGain).toBe(20);
    expect(result.numberOfClimbs).toBe(1);
    // adjustedDuration = 300 + 20 * 0.75 + 1 * 10 = 325
    expect(result.adjustedDuration).toBeCloseTo(325, 1);
  });

  it('counts multiple separate climbs', () => {
    // Profile: 100 → 103 → 100 → 103 → 100 (two climbs > 2m threshold)
    const result = getAdjustedDuration(300, [100, 103, 100, 103, 100]);
    expect(result.numberOfClimbs).toBe(2);
    expect(result.elevationGain).toBe(6);
  });

  it('ignores micro-climbs below the 2m threshold', () => {
    // Profile: 100 → 101 → 100 (1m gain — below threshold)
    const result = getAdjustedDuration(300, [100, 101, 100]);
    expect(result.numberOfClimbs).toBe(0);
    expect(result.elevationGain).toBe(1);
  });

  it('counts a climb that ends at the last sample', () => {
    // Profile: 100 → 103 → 106 (ends on uphill — still a climb)
    const result = getAdjustedDuration(300, [100, 103, 106]);
    expect(result.numberOfClimbs).toBe(1);
    expect(result.elevationGain).toBe(6);
  });

  it('does not count descents as negative gain', () => {
    const result = getAdjustedDuration(300, [120, 110, 100]);
    expect(result.elevationGain).toBe(0);
    expect(result.numberOfClimbs).toBe(0);
  });

  it('does not mutate the elevation profile array', () => {
    const profile = [100, 110, 120, 100];
    const copy = [...profile];
    getAdjustedDuration(300, profile);
    expect(profile).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// analyzeRoute — elevation gain/loss
// ---------------------------------------------------------------------------

describe('analyzeRoute — elevation gain and loss', () => {
  it('computes elevation gain from a climbing profile', () => {
    const route = makeRoute({ distance: 500, duration: 180 });
    const result = analyzeRoute(route, [100, 110, 120]);
    expect(result.elevationGain).toBe(20);
    expect(result.elevationLoss).toBe(0);
  });

  it('computes elevation loss from a descending profile', () => {
    const route = makeRoute({ distance: 500, duration: 180 });
    const result = analyzeRoute(route, [120, 110, 100]);
    expect(result.elevationGain).toBe(0);
    expect(result.elevationLoss).toBe(20);
  });

  it('computes both gain and loss for a mixed profile', () => {
    const route = makeRoute({ distance: 1000, duration: 300 });
    const result = analyzeRoute(route, [100, 110, 105, 115, 108]);
    expect(result.elevationGain).toBeGreaterThan(0);
    expect(result.elevationLoss).toBeGreaterThan(0);
  });

  it('returns zero gain and loss for null elevation profile', () => {
    const route = makeRoute();
    const result = analyzeRoute(route, null);
    expect(result.elevationGain).toBe(0);
    expect(result.elevationLoss).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeRoute — route composition from annotation classes
// ---------------------------------------------------------------------------

describe('analyzeRoute — composition from annotation classes', () => {
  it('classifies cycleway annotation segments', () => {
    const route = makeRoute({
      distance: 200,
      duration: 60,
      legs: [
        {
          steps: [],
          summary: '',
          weight: 60,
          duration: 60,
          distance: 200,
          annotation: {
            distance: [100, 100],
            duration: [30, 30],
            datasources: [0, 0],
            nodes: [1, 2, 3],
            weight: [30, 30],
            speed: [3, 3],
            classes: ['cycleway', 'cycleway'],
          },
        },
      ],
    });
    const result = analyzeRoute(route, null);
    const cyclewayEntry = result.composition.find((c) => c.label === 'Cycleway');
    expect(cyclewayEntry).toBeDefined();
  });

  it('classifies residential annotation segments', () => {
    const route = makeRoute({
      distance: 200,
      duration: 60,
      legs: [
        {
          steps: [],
          summary: '',
          weight: 60,
          duration: 60,
          distance: 200,
          annotation: {
            distance: [200],
            duration: [60],
            datasources: [0],
            nodes: [1, 2],
            weight: [60],
            speed: [3],
            classes: ['residential'],
          },
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Residential')).toBeDefined();
  });

  it('percentages sum to ~100 when using annotation classes', () => {
    const route = makeRoute({
      distance: 300,
      duration: 90,
      legs: [
        {
          steps: [],
          summary: '',
          weight: 90,
          duration: 90,
          distance: 300,
          annotation: {
            distance: [100, 100, 100],
            duration: [30, 30, 30],
            datasources: [0, 0, 0],
            nodes: [1, 2, 3, 4],
            weight: [30, 30, 30],
            speed: [3, 3, 3],
            classes: ['cycleway', 'residential', 'path'],
          },
        },
      ],
    });
    const result = analyzeRoute(route, null);
    const total = result.composition.reduce((s, c) => s + c.percentage, 0);
    expect(total).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// analyzeRoute — route composition from step modes
// ---------------------------------------------------------------------------

describe('analyzeRoute — composition from step modes', () => {
  it('classifies cycling steps with no special name as Residential', () => {
    const route = makeRoute({
      distance: 100,
      duration: 30,
      legs: [
        {
          steps: [makeStep('cycling', 'some street', 100)],
          summary: '',
          weight: 30,
          duration: 30,
          distance: 100,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Residential')).toBeDefined();
  });

  it('classifies "pushing bike" mode as Pushing', () => {
    const route = makeRoute({
      distance: 50,
      duration: 30,
      legs: [
        {
          steps: [makeStep('pushing bike', '', 50)],
          summary: '',
          weight: 30,
          duration: 30,
          distance: 50,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Pushing')).toBeDefined();
  });

  it('classifies ferry mode as Ferry', () => {
    const route = makeRoute({
      distance: 1000,
      duration: 300,
      legs: [
        {
          steps: [makeStep('ferry', '', 1000)],
          summary: '',
          weight: 300,
          duration: 300,
          distance: 1000,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Ferry')).toBeDefined();
  });

  it('classifies cycling steps named "pista ciclabila" as Cycleway', () => {
    // "pista" triggers the cycleway branch (before the path check)
    const route = makeRoute({
      distance: 200,
      duration: 60,
      legs: [
        {
          steps: [makeStep('cycling', 'pista ciclabila', 200)],
          summary: '',
          weight: 60,
          duration: 60,
          distance: 200,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Cycleway')).toBeDefined();
  });

  it('classifies cycling steps named "cycle path" as Path (path check takes priority)', () => {
    // "cycle path" contains "path" which is checked before "cycle" in the source
    const route = makeRoute({
      distance: 200,
      duration: 60,
      legs: [
        {
          steps: [makeStep('cycling', 'cycle path', 200)],
          summary: '',
          weight: 60,
          duration: 60,
          distance: 200,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition.find((c) => c.label === 'Path')).toBeDefined();
  });

  it('returns composition sorted by distance descending', () => {
    const route = makeRoute({
      distance: 300,
      duration: 90,
      legs: [
        {
          steps: [
            makeStep('cycling', '', 50),     // Residential 50m
            makeStep('ferry', '', 250),      // Ferry 250m
          ],
          summary: '',
          weight: 90,
          duration: 90,
          distance: 300,
        },
      ],
    });
    const result = analyzeRoute(route, null);
    expect(result.composition[0].distance).toBeGreaterThanOrEqual(result.composition[1].distance);
  });
});

// ---------------------------------------------------------------------------
// analyzeRoute — basic output shape
// ---------------------------------------------------------------------------

describe('analyzeRoute — output shape', () => {
  it('always includes distance, riskScore, numberOfClimbs, adjustedDuration', () => {
    const route = makeRoute({ distance: 500, weight: 42 });
    const result = analyzeRoute(route, null);
    expect(typeof result.distance).toBe('number');
    expect(typeof result.riskScore).toBe('number');
    expect(typeof result.numberOfClimbs).toBe('number');
    expect(typeof result.adjustedDuration).toBe('number');
  });

  it('exposes the route weight as riskScore', () => {
    const route = makeRoute({ weight: 42 });
    const result = analyzeRoute(route, null);
    expect(result.riskScore).toBe(42);
  });

  it('returns distance equal to route.distance', () => {
    const route = makeRoute({ distance: 12345 });
    const result = analyzeRoute(route, null);
    expect(result.distance).toBe(12345);
  });

  it('returns an empty composition array for a route with no legs', () => {
    const route = makeRoute({ legs: [], distance: 0 });
    const result = analyzeRoute(route, null);
    expect(result.composition).toEqual([]);
  });
});
