import { describe, expect, it } from 'vitest';

import {
  climbBetweenFractions,
  computeNextStopProgress,
} from './navigation';
import type { Coordinate } from './contracts';

// A straight north-bound route: lon 0, lat 0 → 0.06 in 0.01 steps.
// 7 vertices, 6 segments, each ~1112 m (lat degrees are ~111195 m), total ~6672 m.
// 6 segments keep the stops at fraction 2/6 ≈ 0.33 and 4/6 ≈ 0.67 — comfortably
// mid-bucket for the 5-bucket elevation profile, so climb windows are stable.
// Coordinates are [lon, lat] (GeoJSON order), matching what the app decodes.
const ROUTE_COORDS: [number, number][] = [
  [0, 0.0],
  [0, 0.01],
  [0, 0.02],
  [0, 0.03],
  [0, 0.04],
  [0, 0.05],
  [0, 0.06],
];

const SEGMENT_M = 1112; // approx
const TOTAL_M = SEGMENT_M * 6;

// Two intermediate stops at lat 0.02 and 0.04.
const WAYPOINTS: Coordinate[] = [
  { lat: 0.02, lon: 0 },
  { lat: 0.04, lon: 0 },
];

const route = {
  distanceMeters: TOTAL_M,
  durationSeconds: TOTAL_M, // pace = 1 s/m → duration mirrors distance for easy asserts
  elevationProfile: [0, 10, 20, 15, 25, 30],
};

describe('computeNextStopProgress', () => {
  it('reports no next stop when the route has no waypoints', () => {
    const result = computeNextStopProgress(route, ROUTE_COORDS, [], { lat: 0, lon: 0 });
    expect(result.hasNextStop).toBe(false);
    expect(result.stopCount).toBe(0);
    expect(result.nextWaypointIndex).toBeNull();
    expect(result.distanceToNextStopMeters).toBe(0);
  });

  it('targets the first stop from the route start ("Stop 1 of 2")', () => {
    const result = computeNextStopProgress(route, ROUTE_COORDS, WAYPOINTS, { lat: 0, lon: 0 });
    expect(result.hasNextStop).toBe(true);
    expect(result.stopCount).toBe(2);
    expect(result.stopIndex).toBe(1);
    expect(result.nextWaypointIndex).toBe(0);
    // 2 segments to the first stop (~2224 m)
    expect(result.distanceToNextStopMeters).toBeGreaterThan(2150);
    expect(result.distanceToNextStopMeters).toBeLessThan(2300);
    // pace = 1 s/m → duration ≈ distance
    expect(result.durationToNextStopSeconds).toBeCloseTo(result.distanceToNextStopMeters, -1);
  });

  it('advances to the second stop once the rider passes the first ("Stop 2 of 2")', () => {
    // lat 0.026 is closest to vertex 3 (0.03), so waypoint 0 (vertex 2) is behind.
    const result = computeNextStopProgress(route, ROUTE_COORDS, WAYPOINTS, { lat: 0.026, lon: 0 });
    expect(result.hasNextStop).toBe(true);
    expect(result.stopIndex).toBe(2);
    expect(result.nextWaypointIndex).toBe(1);
  });

  it('reports no next stop once every stop is behind the rider', () => {
    // lat 0.052 is past both stops; heading to the destination.
    const result = computeNextStopProgress(route, ROUTE_COORDS, WAYPOINTS, { lat: 0.052, lon: 0 });
    expect(result.hasNextStop).toBe(false);
    expect(result.stopCount).toBe(2);
    expect(result.stopIndex).toBe(2); // keeps "of 2" context
    expect(result.nextWaypointIndex).toBeNull();
  });

  it('sums only the climb between the rider and the next stop', () => {
    // Start → first stop ≈ fraction 0.33 of a 5-bucket profile → window [idx0, idx1):
    // just +10 (0→10). Later climbs (toward the destination) are excluded.
    const result = computeNextStopProgress(route, ROUTE_COORDS, WAYPOINTS, { lat: 0, lon: 0 });
    expect(result.climbToNextStopMeters).toBe(10);
  });

  it('degrades gracefully when geometry is missing', () => {
    const result = computeNextStopProgress(route, [], WAYPOINTS, { lat: 0, lon: 0 });
    expect(result.hasNextStop).toBe(false);
  });
});

describe('climbBetweenFractions', () => {
  const profile = [0, 10, 20, 15, 25, 30]; // deltas: +10 +10 -5 +10 +5

  it('sums all positive deltas across the full route', () => {
    expect(climbBetweenFractions(profile, 0, 1)).toBe(35);
  });

  it('measures only the requested window', () => {
    expect(climbBetweenFractions(profile, 0, 0.4)).toBe(20); // idx [0,2)
    expect(climbBetweenFractions(profile, 0.4, 1)).toBe(15); // idx [2,5): -5 skipped, +10 +5
  });

  it('returns 0 for a degenerate window or empty profile', () => {
    expect(climbBetweenFractions(profile, 0.5, 0.5)).toBe(0);
    expect(climbBetweenFractions([], 0, 1)).toBe(0);
    expect(climbBetweenFractions([42], 0, 1)).toBe(0);
  });

  it('clamps out-of-range fractions', () => {
    expect(climbBetweenFractions(profile, -1, 2)).toBe(35);
  });
});
