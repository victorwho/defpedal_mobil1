import { describe, expect, it } from 'vitest';

import { decodePolyline, encodePolyline, trimPolylineEndpoints } from './polyline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round-trip helper: encode then decode and compare with tolerance. */
const roundTrip = (coords: [number, number][], precision = 1e6) => {
  const encoded = encodePolyline(coords, precision);
  return decodePolyline(encoded, precision);
};

const closeTo = (a: number, b: number, epsilon = 1e-5) => Math.abs(a - b) < epsilon;

const coordsMatch = (
  a: [number, number][],
  b: [number, number][],
  epsilon = 1e-5,
): boolean => {
  if (a.length !== b.length) return false;
  return a.every(([lonA, latA], i) => closeTo(lonA, b[i][0], epsilon) && closeTo(latA, b[i][1], epsilon));
};

// ---------------------------------------------------------------------------
// encodePolyline
// ---------------------------------------------------------------------------

describe('encodePolyline', () => {
  it('returns an empty string for an empty coordinate array', () => {
    expect(encodePolyline([])).toBe('');
  });

  it('encodes a single point and produces a non-empty string', () => {
    const result = encodePolyline([[26.1025, 44.4268]]);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('encodes multiple points without throwing', () => {
    const coords: [number, number][] = [
      [26.1025, 44.4268],
      [26.0989, 44.4301],
      [26.0946, 44.4378],
    ];
    expect(() => encodePolyline(coords)).not.toThrow();
    expect(encodePolyline(coords).length).toBeGreaterThan(0);
  });

  it('produces different output for different coordinate sets', () => {
    const a = encodePolyline([[26.1025, 44.4268]]);
    const b = encodePolyline([[26.0946, 44.4378]]);
    expect(a).not.toBe(b);
  });

  it('handles negative coordinates', () => {
    const coords: [number, number][] = [[-73.9857, 40.7484]]; // New York lon, lat
    expect(() => encodePolyline(coords)).not.toThrow();
    expect(encodePolyline(coords).length).toBeGreaterThan(0);
  });

  it('handles [0, 0] coordinates', () => {
    const result = encodePolyline([[0, 0]]);
    expect(typeof result).toBe('string');
  });

  it('does not mutate the input array', () => {
    const coords: [number, number][] = [
      [26.1025, 44.4268],
      [26.0946, 44.4378],
    ];
    const copy = coords.map((c) => [...c] as [number, number]);
    encodePolyline(coords);
    expect(coords).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// decodePolyline
// ---------------------------------------------------------------------------

describe('decodePolyline', () => {
  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes a known Polyline6 string back to approximate coordinates', () => {
    // Encode first, then verify decode inverts it
    const original: [number, number][] = [[26.1025, 44.4268]];
    const encoded = encodePolyline(original);
    const decoded = decodePolyline(encoded);

    expect(decoded).toHaveLength(1);
    expect(decoded[0][0]).toBeCloseTo(26.1025, 4);
    expect(decoded[0][1]).toBeCloseTo(44.4268, 4);
  });

  it('returns [lon, lat] tuples (GeoJSON convention)', () => {
    const original: [number, number][] = [[26.1025, 44.4268]];
    const decoded = roundTrip(original);
    // First element is lon, second is lat
    expect(decoded[0][0]).toBeCloseTo(26.1025, 4); // lon
    expect(decoded[0][1]).toBeCloseTo(44.4268, 4); // lat
  });

  it('handles negative coordinates after round-trip', () => {
    const original: [number, number][] = [[-73.9857, 40.7484]];
    const decoded = roundTrip(original);
    expect(decoded[0][0]).toBeCloseTo(-73.9857, 4);
    expect(decoded[0][1]).toBeCloseTo(40.7484, 4);
  });
});

// ---------------------------------------------------------------------------
// encode → decode round-trip
// ---------------------------------------------------------------------------

describe('encodePolyline / decodePolyline round-trip', () => {
  it('round-trips a single coordinate with Polyline6 precision', () => {
    const original: [number, number][] = [[26.1025, 44.4268]];
    const decoded = roundTrip(original);
    expect(coordsMatch(decoded, original)).toBe(true);
  });

  it('round-trips multiple coordinates', () => {
    const original: [number, number][] = [
      [26.1025, 44.4268],
      [26.0989, 44.4301],
      [26.0946, 44.4378],
    ];
    const decoded = roundTrip(original);
    expect(coordsMatch(decoded, original)).toBe(true);
  });

  it('round-trips coordinates at [0, 0]', () => {
    const original: [number, number][] = [[0, 0]];
    const decoded = roundTrip(original);
    expect(decoded[0][0]).toBeCloseTo(0, 5);
    expect(decoded[0][1]).toBeCloseTo(0, 5);
  });

  it('round-trips negative coordinates (southern/western hemisphere)', () => {
    const original: [number, number][] = [
      [-43.1729, -22.9068], // Rio de Janeiro (lon, lat)
      [-43.18, -22.91],
    ];
    const decoded = roundTrip(original);
    expect(coordsMatch(decoded, original)).toBe(true);
  });

  it('round-trips a large set of 100 points without precision loss', () => {
    const original: [number, number][] = Array.from({ length: 100 }, (_, i) => [
      26.0 + i * 0.001,
      44.0 + i * 0.0008,
    ]);
    const decoded = roundTrip(original);
    expect(decoded).toHaveLength(100);
    expect(coordsMatch(decoded, original)).toBe(true);
  });

  it('preserves precision with default 1e6 multiplier (sub-metre accuracy)', () => {
    // 1e-6 degrees ≈ 0.11 metres — well within navigation needs
    const original: [number, number][] = [[26.123456, 44.654321]];
    const decoded = roundTrip(original);
    expect(decoded[0][0]).toBeCloseTo(26.123456, 5);
    expect(decoded[0][1]).toBeCloseTo(44.654321, 5);
  });

  it('round-trips extreme latitude/longitude values', () => {
    const original: [number, number][] = [
      [179.9999, 89.9999],  // near North Pole, near date line
      [-179.9999, -89.9999],
    ];
    const decoded = roundTrip(original);
    expect(coordsMatch(decoded, original)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// trimPolylineEndpoints
// ---------------------------------------------------------------------------

describe('trimPolylineEndpoints', () => {
  // A ~5km route through Bucharest (lon, lat pairs)
  const longRoute: [number, number][] = [
    [26.1025, 44.4268],
    [26.1040, 44.4280],
    [26.1060, 44.4300],
    [26.1080, 44.4320],
    [26.1100, 44.4340],
    [26.1120, 44.4360],
    [26.1140, 44.4380],
    [26.1160, 44.4400],
    [26.1180, 44.4420],
    [26.1200, 44.4440],
    [26.1220, 44.4460],
    [26.1240, 44.4480],
    [26.1260, 44.4500],
    [26.1280, 44.4520],
    [26.1300, 44.4540],
    [26.1320, 44.4560],
    [26.1340, 44.4580],
    [26.1360, 44.4600],
    [26.1380, 44.4620],
    [26.1400, 44.4640],
  ];

  it('returns the original polyline for an empty string', () => {
    expect(trimPolylineEndpoints('', 200)).toBe('');
  });

  it('returns the original polyline for a single point', () => {
    const single = encodePolyline([[26.1025, 44.4268]]);
    expect(trimPolylineEndpoints(single, 200)).toBe(single);
  });

  it('returns the original polyline when route is too short to trim', () => {
    // Two points very close together (~250m)
    const shortRoute: [number, number][] = [
      [26.1025, 44.4268],
      [26.1040, 44.4280],
    ];
    const encoded = encodePolyline(shortRoute);
    // Trim 200m from each end = need at least 500m (2.5 * 200)
    expect(trimPolylineEndpoints(encoded, 200)).toBe(encoded);
  });

  it('trims both ends of a normal polyline', () => {
    const encoded = encodePolyline(longRoute);
    const trimmed = trimPolylineEndpoints(encoded, 200);

    // Should be different from the original
    expect(trimmed).not.toBe(encoded);

    // Decoded trimmed should have fewer points
    const originalPoints = decodePolyline(encoded);
    const trimmedPoints = decodePolyline(trimmed);
    expect(trimmedPoints.length).toBeLessThan(originalPoints.length);
    expect(trimmedPoints.length).toBeGreaterThanOrEqual(2);
  });

  it('produces a shorter polyline than the original', () => {
    const encoded = encodePolyline(longRoute);
    const trimmed = trimPolylineEndpoints(encoded, 200);

    const originalPoints = decodePolyline(encoded);
    const trimmedPoints = decodePolyline(trimmed);

    // First point of trimmed should NOT be the same as the first point of the original
    expect(trimmedPoints[0][0]).not.toBeCloseTo(originalPoints[0][0], 3);
    // Last point of trimmed should NOT be the same as the last point of the original
    const origLast = originalPoints[originalPoints.length - 1];
    const trimLast = trimmedPoints[trimmedPoints.length - 1];
    expect(trimLast[0]).not.toBeCloseTo(origLast[0], 3);
  });

  it('does not mutate the encoded input', () => {
    const encoded = encodePolyline(longRoute);
    const copy = encoded;
    trimPolylineEndpoints(encoded, 200);
    expect(encoded).toBe(copy);
  });
});
