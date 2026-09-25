import { describe, expect, it } from 'vitest';

import { haversineDistance, polylineSegmentDistance } from './distance';
import { trimPrivacyZone, trimShareGeometry } from './sharePrivacy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a straight east-going polyline starting at [startLon, startLat]
 * with `steps` segments of `stepMeters` each. At the equator-ish latitude
 * used here (0.0), 1 degree of longitude ≈ 111 320m, so we convert.
 */
const buildStraightLine = (
  startLon: number,
  startLat: number,
  steps: number,
  stepMeters: number,
): [number, number][] => {
  const metersPerDegreeLon = 111_320 * Math.cos((startLat * Math.PI) / 180);
  const lonDelta = stepMeters / metersPerDegreeLon;
  return Array.from({ length: steps + 1 }, (_, i) => [
    startLon + i * lonDelta,
    startLat,
  ]);
};

const totalLength = (coords: [number, number][]) =>
  polylineSegmentDistance(coords, 0, coords.length - 1);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trimPrivacyZone', () => {
  it('returns an empty array for empty input', () => {
    expect(trimPrivacyZone([], 200)).toEqual([]);
  });

  it('returns the single point unchanged for a one-point polyline', () => {
    const result = trimPrivacyZone([[26.1025, 44.4268]], 200);
    expect(result).toEqual([[26.1025, 44.4268]]);
  });

  it('returns the original coords unchanged when route length < 2×trimMeters', () => {
    // ~300m total, trimMeters=200 → needs 400m total
    const coords = buildStraightLine(26.1, 0, 3, 100); // 3 × 100m = 300m
    const result = trimPrivacyZone(coords, 200);
    expect(result).toEqual(coords);
  });

  it('trims 200m from each end of a 2km straight polyline', () => {
    // 20 × 100m = 2000m
    const coords = buildStraightLine(26.1, 0, 20, 100);
    expect(totalLength(coords)).toBeCloseTo(2000, -1);

    const trimmed = trimPrivacyZone(coords, 200);
    const trimmedLength = totalLength(trimmed);

    // Remaining should be ~1600m (2000 − 2×200)
    expect(trimmedLength).toBeGreaterThan(1590);
    expect(trimmedLength).toBeLessThan(1610);
  });

  it('trimmed polyline starts ~200m from the original start and ends ~200m before the original end', () => {
    const coords = buildStraightLine(26.1, 0, 20, 100);
    const trimmed = trimPrivacyZone(coords, 200);

    const startOffset = haversineDistance(
      [coords[0][1], coords[0][0]],
      [trimmed[0][1], trimmed[0][0]],
    );
    const endOffset = haversineDistance(
      [coords[coords.length - 1][1], coords[coords.length - 1][0]],
      [trimmed[trimmed.length - 1][1], trimmed[trimmed.length - 1][0]],
    );

    expect(startOffset).toBeGreaterThan(195);
    expect(startOffset).toBeLessThan(205);
    expect(endOffset).toBeGreaterThan(195);
    expect(endOffset).toBeLessThan(205);
  });

  it('returns 2 points when the route is exactly 2×trimMeters', () => {
    // Build a route whose total length is exactly 400m (within float tolerance)
    const coords = buildStraightLine(26.1, 0, 4, 100); // 400m
    const len = totalLength(coords);
    // Tweak trimMeters to exactly half the actual length
    const trimMeters = len / 2;

    // Equal to 2×trimMeters → the guard `< 2×trimMeters` is false, so we DO
    // trim. Head and tail cuts land on the same interior point, yielding 2
    // identical points.
    const trimmed = trimPrivacyZone(coords, trimMeters);
    expect(trimmed).toHaveLength(2);

    // The two cut points should be at (or extremely close to) the midpoint
    const d = haversineDistance(
      [trimmed[0][1], trimmed[0][0]],
      [trimmed[1][1], trimmed[1][0]],
    );
    expect(d).toBeLessThan(0.5); // essentially the same point
  });

  it('does not mutate the input array', () => {
    const coords = buildStraightLine(26.1, 0, 20, 100);
    const snapshot = coords.map((c) => [...c] as [number, number]);
    trimPrivacyZone(coords, 200);
    expect(coords).toEqual(snapshot);
  });

  it('returns a new array (referential inequality) even when returning unchanged contents', () => {
    const coords = buildStraightLine(26.1, 0, 3, 100); // too short to trim
    const result = trimPrivacyZone(coords, 200);
    expect(result).not.toBe(coords);
    expect(result).toEqual(coords);
  });

  it('uses default 200m trim when no value is passed', () => {
    const coords = buildStraightLine(26.1, 0, 20, 100);
    const trimmed = trimPrivacyZone(coords);
    const trimmedLength = totalLength(trimmed);
    expect(trimmedLength).toBeGreaterThan(1580);
    expect(trimmedLength).toBeLessThan(1620);
  });

  it('trims a long winding route (preserves interior vertices)', () => {
    // 50 × 100m = 5000m straight
    const coords = buildStraightLine(26.1, 0, 50, 100);
    const trimmed = trimPrivacyZone(coords, 200);

    // Should still have many interior vertices
    expect(trimmed.length).toBeGreaterThan(40);
    expect(trimmed.length).toBeLessThan(coords.length);

    // Length should be ~4600m
    expect(totalLength(trimmed)).toBeGreaterThan(4580);
    expect(totalLength(trimmed)).toBeLessThan(4620);
  });
});

// ---------------------------------------------------------------------------
// trimShareGeometry — trail AND risk overlay, together
//
// Regression cover for the P0-4 share-image leak
// (docs/plans/external-review-triage-2026-09-25.md): the overlay was forwarded
// untrimmed while only the trail was trimmed, and mapboxStaticImageUrl draws
// ONLY the overlay when one is present — so the rendered PNG showed the rider's
// real start and end.
// ---------------------------------------------------------------------------

describe('trimShareGeometry', () => {
  // 20 × 100 m = 2 km, comfortably longer than 2 × 200 m so a trim applies.
  const trail = buildStraightLine(26.1, 44.43, 20, 100);
  const rawStart = trail[0];
  const rawEnd = trail[trail.length - 1];

  const metersApart = (
    a: readonly [number, number],
    b: readonly [number, number],
  ) => haversineDistance([a[1], a[0]], [b[1], b[0]]);

  it('removes overlay vertices within the trim radius of either raw endpoint', () => {
    const result = trimShareGeometry({
      coords: trail,
      riskSegments: [{ color: '#FF0000', coords: trail.map(([lon, lat]) => [lon, lat]) }],
      trimMeters: 200,
    });

    expect(result.trimmed).toBe(true);
    expect(result.riskSegments).toHaveLength(1);

    for (const point of result.riskSegments[0].coords) {
      expect(metersApart(point, rawStart)).toBeGreaterThanOrEqual(200);
      expect(metersApart(point, rawEnd)).toBeGreaterThanOrEqual(200);
    }
  });

  it('keeps the interior of the overlay rather than emptying it', () => {
    const result = trimShareGeometry({
      coords: trail,
      riskSegments: [{ color: '#FF0000', coords: trail.map(([lon, lat]) => [lon, lat]) }],
      trimMeters: 200,
    });

    // 2 km line, 200 m off each end -> ~1.6 km of geometry must survive.
    expect(result.riskSegments[0].coords.length).toBeGreaterThan(10);
    expect(result.riskSegments[0].color).toBe('#FF0000');
  });

  it('drops a segment that would be left with fewer than two points', () => {
    // Entirely inside the start exclusion zone.
    const hugStart: [number, number][] = [trail[0], trail[1]];

    const result = trimShareGeometry({
      coords: trail,
      riskSegments: [{ color: '#00FF00', coords: hugStart }],
      trimMeters: 200,
    });

    expect(result.riskSegments).toHaveLength(0);
  });

  it('trims the trail identically to trimPrivacyZone', () => {
    const result = trimShareGeometry({ coords: trail, trimMeters: 200 });
    expect(result.coords).toEqual(trimPrivacyZone(trail, 200));
  });

  it('trims NOTHING when the ride is too short, and says so', () => {
    // 300 m total < 2 × 200 m, so trimPrivacyZone declines to trim; the overlay
    // must follow the same policy or the two would disagree.
    const shortTrail = buildStraightLine(26.1, 44.43, 3, 100);
    const segment = shortTrail.map(([lon, lat]) => [lon, lat] as [number, number]);

    const result = trimShareGeometry({
      coords: shortTrail,
      riskSegments: [{ color: '#0000FF', coords: segment }],
      trimMeters: 200,
    });

    expect(result.trimmed).toBe(false);
    expect(result.coords).toEqual(shortTrail);
    expect(result.riskSegments[0].coords).toEqual(segment);
  });

  it('handles a missing or empty overlay without inventing one', () => {
    expect(trimShareGeometry({ coords: trail }).riskSegments).toEqual([]);
    expect(trimShareGeometry({ coords: trail, riskSegments: [] }).riskSegments).toEqual([]);
  });

  it('does not alias the caller arrays', () => {
    const segment = trail.map(([lon, lat]) => [lon, lat] as [number, number]);
    const input = [{ color: '#FF0000', coords: segment }];
    const result = trimShareGeometry({ coords: trail, riskSegments: input, trimMeters: 200 });

    expect(result.riskSegments[0].coords).not.toBe(segment);
    result.riskSegments[0].coords[0][0] = 999;
    expect(segment[0][0]).not.toBe(999);
  });

  it('degrades safely on empty or single-point input', () => {
    expect(trimShareGeometry({ coords: [] })).toEqual({
      coords: [],
      riskSegments: [],
      trimmed: false,
    });

    const single: [number, number][] = [[26.1, 44.43]];
    const result = trimShareGeometry({ coords: single });
    expect(result.coords).toEqual(single);
    expect(result.trimmed).toBe(false);
  });
});
