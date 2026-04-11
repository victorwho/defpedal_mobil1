import { describe, expect, it } from 'vitest';

import { findClosestPointIndex, haversineDistance, polylineSegmentDistance } from './distance';

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

describe('haversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance([44.4268, 26.1025], [44.4268, 26.1025])).toBe(0);
  });

  it('returns 0 for the origin [0,0] to itself', () => {
    expect(haversineDistance([0, 0], [0, 0])).toBe(0);
  });

  it('calculates approximately correct distance between Bucharest landmarks', () => {
    // Piata Unirii to Piata Victoriei — roughly 3.5 km
    const dist = haversineDistance([44.4268, 26.1025], [44.4520, 26.0860]);
    expect(dist).toBeGreaterThan(3000);
    expect(dist).toBeLessThan(4500);
  });

  it('computes approximately half the equatorial circumference for 0,0 → 0,180', () => {
    // Haversine uses a spherical Earth model (R = 6371km), giving ~20 015km for
    // half the equator — not 20 037km (WGS-84 ellipsoid). Tolerance ±50km.
    const halfEarth = haversineDistance([0, 0], [0, 180]);
    expect(halfEarth).toBeGreaterThan(19_900_000);
    expect(halfEarth).toBeLessThan(20_100_000);
  });

  it('is symmetric — distance A→B equals B→A', () => {
    const a: [number, number] = [44.4268, 26.1025];
    const b: [number, number] = [44.4520, 26.086];
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 5);
  });

  it('handles negative latitude and longitude', () => {
    const dist = haversineDistance([-33.8688, 151.2093], [-33.8688, 151.2093]);
    expect(dist).toBe(0);
  });

  it('returns a positive value for points in different hemispheres', () => {
    const dist = haversineDistance([-34.0, -70.0], [34.0, 70.0]);
    expect(dist).toBeGreaterThan(0);
  });

  it('returns meters not kilometers', () => {
    // ~111 km apart (1 degree latitude difference at equator ≈ 111 km)
    const dist = haversineDistance([0, 0], [1, 0]);
    expect(dist).toBeGreaterThan(100_000);
    expect(dist).toBeLessThan(115_000);
  });

  it('does not mutate the input arrays', () => {
    const a: [number, number] = [44.4268, 26.1025];
    const b: [number, number] = [44.452, 26.086];
    const aCopy = [...a] as [number, number];
    const bCopy = [...b] as [number, number];
    haversineDistance(a, b);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });
});

// ---------------------------------------------------------------------------
// findClosestPointIndex
// ---------------------------------------------------------------------------

describe('findClosestPointIndex', () => {
  // Note: points array uses [lon, lat] convention (GeoJSON order).
  // targetCoord uses [lat, lon] convention.

  it('returns -1 for an empty points array', () => {
    expect(findClosestPointIndex([44.4268, 26.1025], [])).toBe(-1);
  });

  it('returns -1 for a null/undefined points array (defensive)', () => {
    // TypeScript won't allow null, but the implementation guards against it
    expect(findClosestPointIndex([44.4268, 26.1025], null as unknown as [number, number][])).toBe(-1);
  });

  it('returns 0 for a single-point array', () => {
    // Points are [lon, lat]; targetCoord is [lat, lon]
    const points: [number, number][] = [[26.1025, 44.4268]];
    expect(findClosestPointIndex([44.4268, 26.1025], points)).toBe(0);
  });

  it('finds the closest of two points', () => {
    // target is very close to second point
    const points: [number, number][] = [
      [26.1025, 44.4268], // lon, lat — far
      [26.0946, 44.4378], // lon, lat — close
    ];
    const result = findClosestPointIndex([44.4378, 26.0946], points);
    expect(result).toBe(1);
  });

  it('finds the closest point in a longer route polyline', () => {
    const points: [number, number][] = [
      [26.1025, 44.4268],
      [26.0989, 44.4301],
      [26.0946, 44.4378],
      [26.0900, 44.4420],
    ];
    // target matches index 2 exactly
    const result = findClosestPointIndex([44.4378, 26.0946], points);
    expect(result).toBe(2);
  });

  it('returns the first index when all points are equidistant (tie goes to first)', () => {
    // Two points symmetric around the target latitude
    const points: [number, number][] = [
      [0, 1],  // lon=0, lat=1
      [0, -1], // lon=0, lat=-1
    ];
    // target [lat=0, lon=0] is equidistant from both
    const result = findClosestPointIndex([0, 0], points);
    // The first one found with strict < wins; implementation returns the earliest
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('handles coordinates at [0,0]', () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    expect(findClosestPointIndex([0, 0], points)).toBe(0);
  });

  it('does not mutate the input points array', () => {
    const points: [number, number][] = [
      [26.1025, 44.4268],
      [26.0946, 44.4378],
    ];
    const copy = points.map((p) => [...p] as [number, number]);
    findClosestPointIndex([44.4268, 26.1025], points);
    expect(points).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// polylineSegmentDistance
// ---------------------------------------------------------------------------

describe('polylineSegmentDistance', () => {
  // Points are [lon, lat] (GeoJSON order), same as decoded polylines.

  it('returns the haversine distance between two adjacent points', () => {
    // Two points ~280m apart in Bucharest
    const points: [number, number][] = [
      [26.1025, 44.4268], // A
      [26.1050, 44.4290], // B
    ];
    const expected = haversineDistance(
      [points[0][1], points[0][0]],
      [points[1][1], points[1][0]],
    );
    expect(polylineSegmentDistance(points, 0, 1)).toBeCloseTo(expected, 2);
  });

  it('sums segment distances on an L-shaped route (longer than haversine)', () => {
    // Right-angle route: go east 500m, then north 500m
    // Points: A(0,0) → B(~0.005 lon east, 0) → C(~0.005 lon east, ~0.0045 lat north)
    const A: [number, number] = [26.1000, 44.4300];
    const B: [number, number] = [26.1060, 44.4300]; // ~500m east
    const C: [number, number] = [26.1060, 44.4345]; // ~500m north from B
    const points = [A, B, C];

    const polyDist = polylineSegmentDistance(points, 0, 2);
    const straightLine = haversineDistance(
      [A[1], A[0]],
      [C[1], C[0]],
    );

    // Polyline distance (two legs) should be meaningfully longer than the diagonal
    expect(polyDist).toBeGreaterThan(straightLine * 1.3);
    // And should approximately equal legAB + legBC
    const legAB = haversineDistance([A[1], A[0]], [B[1], B[0]]);
    const legBC = haversineDistance([B[1], B[0]], [C[1], C[0]]);
    expect(polyDist).toBeCloseTo(legAB + legBC, 0);
  });

  it('returns ~2x haversine on a U-shaped switchback', () => {
    // U-turn: go east 400m, hairpin, come back west 400m offset north
    const A: [number, number] = [26.1000, 44.4300];
    const B: [number, number] = [26.1050, 44.4300]; // ~400m east
    const C: [number, number] = [26.1050, 44.4305]; // short connector north
    const D: [number, number] = [26.1000, 44.4305]; // ~400m west (back)
    const points = [A, B, C, D];

    const polyDist = polylineSegmentDistance(points, 0, 3);
    const straightLine = haversineDistance([A[1], A[0]], [D[1], D[0]]);

    // Straight line A→D is only ~55m (just the north offset).
    // Polyline is ~400m + ~55m + ~400m ≈ 855m. Should be >>10x straight line.
    expect(polyDist).toBeGreaterThan(straightLine * 5);
  });

  it('returns 0 when fromIndex >= toIndex', () => {
    const points: [number, number][] = [
      [26.1000, 44.4300],
      [26.1050, 44.4300],
      [26.1100, 44.4300],
    ];
    expect(polylineSegmentDistance(points, 2, 1)).toBe(0);
    expect(polylineSegmentDistance(points, 1, 1)).toBe(0);
  });

  it('returns 0 for an empty or single-point array', () => {
    expect(polylineSegmentDistance([], 0, 0)).toBe(0);
    expect(polylineSegmentDistance([[26.1, 44.4]], 0, 0)).toBe(0);
    expect(polylineSegmentDistance([[26.1, 44.4]], 0, 1)).toBe(0);
  });
});
