import { describe, expect, it } from 'vitest';

import { downsampleCoordinates } from './geometrySampling';

const makeCoords = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [26 + i * 0.0001, 44 + i * 0.0001]);

describe('downsampleCoordinates', () => {
  it('returns the input array untouched when already within the cap', () => {
    const coords = makeCoords(100);
    expect(downsampleCoordinates(coords, 100)).toBe(coords);
    expect(downsampleCoordinates(coords, 500)).toBe(coords);
  });

  it('reduces to at most maxPoints', () => {
    const result = downsampleCoordinates(makeCoords(100_000), 12_000);
    expect(result.length).toBeLessThanOrEqual(12_000);
    expect(result.length).toBeGreaterThan(11_000); // near the cap, not degenerate
  });

  it('always keeps the exact first and last points', () => {
    const coords = makeCoords(50_001);
    const result = downsampleCoordinates(coords, 1_000);
    expect(result[0]).toEqual(coords[0]);
    expect(result[result.length - 1]).toEqual(coords[coords.length - 1]);
  });

  it('preserves original point order', () => {
    const coords = makeCoords(10_000);
    const result = downsampleCoordinates(coords, 500);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i][0]).toBeGreaterThan(result[i - 1][0]);
    }
  });

  it('handles degenerate inputs safely', () => {
    expect(downsampleCoordinates([], 100)).toEqual([]);
    const single: [number, number][] = [[26, 44]];
    expect(downsampleCoordinates(single, 100)).toBe(single);
    const pair = makeCoords(2);
    expect(downsampleCoordinates(pair, 2)).toBe(pair);
  });

  it('tolerates a nonsensical cap by falling back to endpoints', () => {
    const coords = makeCoords(10);
    const result = downsampleCoordinates(coords, 1);
    expect(result[0]).toEqual(coords[0]);
    expect(result[result.length - 1]).toEqual(coords[9]);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});
