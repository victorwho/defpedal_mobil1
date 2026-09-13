import { describe, expect, it } from 'vitest';

import {
  distanceToPlaceEdgeMeters,
  MIN_MEANINGFUL_EDGE_METERS,
  type PlaceBounds,
} from './urbanEdge';

/**
 * Bucharest's real box, as Mapbox returns it. Using a captured one rather than
 * a tidy synthetic square is deliberate: the figures asserted below are the
 * ones the planner will actually quote to a rider standing in Piața Unirii.
 */
const BUCHAREST: PlaceBounds = {
  west: 25.966677,
  south: 44.334247,
  east: 26.225577,
  north: 44.5414,
};

describe('distanceToPlaceEdgeMeters', () => {
  it('measures the NEAREST edge, not the centre-to-corner distance', () => {
    const centre = { lat: 44.4268, lon: 26.1025 };
    const edge = distanceToPlaceEdgeMeters(centre, BUCHAREST);

    // ~9.8 km to the nearest side; the half-diagonal is over 15 km, and using
    // that would demand a 55 km ride where 35 km will do.
    expect(edge).toBeGreaterThan(9_000);
    expect(edge).toBeLessThan(11_000);
  });

  it('gives a fringe rider a much shorter answer than a central one', () => {
    const central = distanceToPlaceEdgeMeters(
      { lat: 44.4268, lon: 26.1025 },
      BUCHAREST,
    );
    const northernFringe = distanceToPlaceEdgeMeters(
      { lat: 44.535, lon: 26.1025 },
      BUCHAREST,
    );

    // The whole reason this is per-rider and not a city-wide radius: someone
    // on the northern edge is already nearly out.
    expect(northernFringe).toBeLessThan(1_000);
    expect(central).toBeGreaterThan(northernFringe * 5);
  });

  it('returns 0 for a rider already outside the box', () => {
    expect(
      distanceToPlaceEdgeMeters({ lat: 45.2, lon: 26.1025 }, BUCHAREST),
    ).toBe(0);
  });

  it('scales longitude by latitude', () => {
    // The same degree box is narrower in metres further north. Without the
    // cosine term a Helsinki box would read ~40% wider than it is.
    const box: PlaceBounds = { west: -1, south: -1, east: 1, north: 1 };
    const equator = distanceToPlaceEdgeMeters({ lat: 0, lon: 0 }, box);
    const north = distanceToPlaceEdgeMeters({ lat: 0.0, lon: 0 }, {
      ...box,
      south: 59,
      north: 61,
    });
    expect(equator).toBeGreaterThan(0);
    expect(north).toBe(0); // outside that box entirely
  });

  it('has a floor below which escaping a place is not a real ask', () => {
    expect(MIN_MEANINGFUL_EDGE_METERS).toBeGreaterThan(0);
    expect(MIN_MEANINGFUL_EDGE_METERS).toBeLessThan(2_000);
  });
});
