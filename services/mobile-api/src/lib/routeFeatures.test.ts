import { describe, expect, it } from 'vitest';
import type { Route } from '@defensivepedal/core';

import { extractRouteFeatures } from './routeFeatures';

const lineString = (coords: [number, number][]): Route['geometry'] => ({
  type: 'LineString',
  coordinates: coords,
});

const makeStep = (overrides: Partial<Route['legs'][number]['steps'][number]> = {}): Route['legs'][number]['steps'][number] => ({
  intersections: [],
  maneuver: { bearing_after: 0, bearing_before: 0, location: [0, 0], type: 'turn' },
  name: '',
  duration: 0,
  distance: 0,
  driving_side: 'right',
  weight: 0,
  mode: 'cycling',
  geometry: lineString([[0, 0], [0.001, 0]]),
  ...overrides,
});

const makeRoute = (overrides: {
  coordinates: [number, number][];
  classes?: string[];
  distances?: number[];
  steps?: Route['legs'][number]['steps'];
}): Route => {
  const coords = overrides.coordinates;
  const edgeCount = Math.max(0, coords.length - 1);
  return {
    geometry: lineString(coords),
    distance: 0,
    duration: 0,
    weight: 0,
    weight_name: 'cyclability',
    legs: [
      {
        steps: overrides.steps ?? [],
        summary: '',
        weight: 0,
        duration: 0,
        distance: 0,
        annotation: {
          distance: overrides.distances ?? Array.from({ length: edgeCount }, () => 100),
          duration: Array.from({ length: edgeCount }, () => 30),
          datasources: Array.from({ length: edgeCount }, () => 0),
          nodes: Array.from({ length: edgeCount + 1 }, (_, i) => i),
          weight: Array.from({ length: edgeCount }, () => 100),
          speed: Array.from({ length: edgeCount }, () => 5),
          ...(overrides.classes ? { classes: overrides.classes } : {}),
        },
      },
    ],
  };
};

// Coordinates along a roughly straight east-bound line for predictable ordering.
const COORDS: [number, number][] = Array.from({ length: 8 }, (_, i) => [
  26.1 + i * 0.001,
  44.43,
]);

describe('extractRouteFeatures — zone features (tunnel / bridge)', () => {
  it('returns no features for a route with no class annotations', () => {
    const route = makeRoute({ coordinates: COORDS });
    expect(extractRouteFeatures(route, 0)).toEqual([]);
  });

  it('extracts a single tunnel run with cumulative length', () => {
    // Edges: [tunnel, tunnel, tunnel, plain, plain, plain, plain]
    const route = makeRoute({
      coordinates: COORDS,
      classes: ['tunnel', 'tunnel', 'tunnel', '', '', '', ''],
      distances: [100, 100, 100, 50, 50, 50, 50],
    });

    const features = extractRouteFeatures(route, 1);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'tunnel',
      tier: 'info',
      distanceAlongRouteMeters: 0,
      lengthMeters: 300,
      lon: COORDS[0][0],
      lat: COORDS[0][1],
      id: 'route-1-feature-tunnel-0',
    });
  });

  it('classifies bridges as caution tier', () => {
    const route = makeRoute({
      coordinates: COORDS,
      classes: ['', '', 'bridge', 'bridge', '', '', ''],
      distances: [50, 50, 100, 100, 50, 50, 50],
    });

    const features = extractRouteFeatures(route, 0);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'bridge',
      tier: 'caution',
      // Bridge starts after the first two non-bridge edges (50 + 50 = 100m).
      distanceAlongRouteMeters: 100,
      lengthMeters: 200,
    });
  });

  it('emits separate features for non-contiguous tunnel runs', () => {
    const route = makeRoute({
      coordinates: COORDS,
      classes: ['tunnel', 'tunnel', '', '', 'tunnel', 'tunnel', ''],
      distances: [100, 100, 100, 100, 100, 100, 100],
    });

    const features = extractRouteFeatures(route, 0);
    expect(features).toHaveLength(2);
    expect(features[0]).toMatchObject({
      type: 'tunnel',
      distanceAlongRouteMeters: 0,
      lengthMeters: 200,
      id: 'route-0-feature-tunnel-0',
    });
    expect(features[1]).toMatchObject({
      type: 'tunnel',
      distanceAlongRouteMeters: 400,
      lengthMeters: 200,
      id: 'route-0-feature-tunnel-1',
    });
  });

  it('sorts mixed feature types by distance ascending', () => {
    const route = makeRoute({
      coordinates: COORDS,
      classes: ['', 'bridge', 'bridge', '', 'tunnel', 'tunnel', ''],
      distances: [100, 100, 100, 100, 100, 100, 100],
    });

    const features = extractRouteFeatures(route, 0);
    expect(features.map((f) => f.type)).toEqual(['bridge', 'tunnel']);
    expect(features[0].distanceAlongRouteMeters).toBeLessThan(
      features[1].distanceAlongRouteMeters,
    );
  });
});

describe('extractRouteFeatures — left turns', () => {
  it('flags a left turn at a T-junction (3 bearings)', () => {
    const route = makeRoute({
      coordinates: COORDS,
      steps: [
        makeStep({
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [COORDS[3][0], COORDS[3][1]],
            type: 'turn',
            modifier: 'left',
          },
          intersections: [
            { entry: [true, true, false], bearings: [0, 90, 180], location: [COORDS[3][0], COORDS[3][1]] },
          ],
        }),
      ],
    });

    const features = extractRouteFeatures(route, 0);
    const leftTurns = features.filter((f) => f.type === 'left_turn_no_intersection');
    expect(leftTurns).toHaveLength(1);
    expect(leftTurns[0]).toMatchObject({
      type: 'left_turn_no_intersection',
      tier: 'warning',
      lengthMeters: null,
    });
  });

  it('does not flag a left turn at a 4-way intersection', () => {
    const route = makeRoute({
      coordinates: COORDS,
      steps: [
        makeStep({
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [COORDS[3][0], COORDS[3][1]],
            type: 'turn',
            modifier: 'left',
          },
          intersections: [
            { entry: [true, true, true, true], bearings: [0, 90, 180, 270], location: [COORDS[3][0], COORDS[3][1]] },
          ],
        }),
      ],
    });

    const features = extractRouteFeatures(route, 0);
    expect(features.filter((f) => f.type === 'left_turn_no_intersection')).toEqual([]);
  });

  it('ignores right turns', () => {
    const route = makeRoute({
      coordinates: COORDS,
      steps: [
        makeStep({
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [COORDS[3][0], COORDS[3][1]],
            type: 'turn',
            modifier: 'right',
          },
          intersections: [
            { entry: [true, true, false], bearings: [0, 90, 180], location: [COORDS[3][0], COORDS[3][1]] },
          ],
        }),
      ],
    });

    expect(extractRouteFeatures(route, 0)).toEqual([]);
  });

  it('also flags sharp-left and slight-left modifiers', () => {
    const route = makeRoute({
      coordinates: COORDS,
      steps: [
        makeStep({
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [COORDS[2][0], COORDS[2][1]],
            type: 'turn',
            modifier: 'sharp left',
          },
          intersections: [
            { entry: [true, true], bearings: [0, 90], location: [COORDS[2][0], COORDS[2][1]] },
          ],
        }),
        makeStep({
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [COORDS[5][0], COORDS[5][1]],
            type: 'turn',
            modifier: 'slight left',
          },
          intersections: [
            { entry: [true, true, true], bearings: [0, 45, 90], location: [COORDS[5][0], COORDS[5][1]] },
          ],
        }),
      ],
    });

    const lefts = extractRouteFeatures(route, 0).filter(
      (f) => f.type === 'left_turn_no_intersection',
    );
    expect(lefts).toHaveLength(2);
    expect(lefts[0].distanceAlongRouteMeters).toBeLessThan(
      lefts[1].distanceAlongRouteMeters,
    );
  });
});

describe('extractRouteFeatures — defensive', () => {
  it('returns empty array for a route with no geometry', () => {
    const route = {
      geometry: { type: 'LineString' as const, coordinates: [] as [number, number][] },
      distance: 0,
      duration: 0,
      weight: 0,
      weight_name: 'cyclability',
      legs: [],
    };
    expect(extractRouteFeatures(route, 0)).toEqual([]);
  });
});
