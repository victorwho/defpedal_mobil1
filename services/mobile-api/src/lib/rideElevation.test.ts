import { describe, expect, it } from 'vitest';

import { rideElevationCoordinates } from './rideElevation';

/** Braşov city centre, heading uphill toward Poiana — real-ish coordinates. */
const TRAIL = [
  { lat: 45.6427, lon: 25.5887 },
  { lat: 45.6431, lon: 25.5879 },
  { lat: 45.6438, lon: 25.5861 },
  { lat: 45.6442, lon: 25.5848 },
];

describe('rideElevationCoordinates', () => {
  it('prefers the ridden GPS trail and returns GeoJSON [lon, lat] order', () => {
    const coords = rideElevationCoordinates(TRAIL, null);

    expect(coords).toHaveLength(4);
    // getElevationGain takes [longitude, latitude]; swapping these silently
    // looks up the wrong hemisphere and returns a plausible-but-wrong climb.
    expect(coords[0]).toEqual([25.5887, 45.6427]);
  });

  it('falls back to the planned route when no trail was uploaded', () => {
    // A ride that was navigated but never saved has no track, and the planned
    // line is the only geometry left. Better than recording nothing.
    const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const coords = rideElevationCoordinates(null, polyline);

    expect(coords.length).toBeGreaterThanOrEqual(2);
    for (const [lon, lat] of coords) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it('prefers the trail over the planned line when both exist', () => {
    const coords = rideElevationCoordinates(TRAIL, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual([25.5887, 45.6427]);
  });

  it('drops a teleported fix so a cached location cannot invent a mountain', () => {
    // Android's fused provider re-surfaces a stale fix from another city. Left
    // in, the DEM lookup reads that peak's altitude and books the difference
    // as climb — the single biggest way this metric could go wrong.
    const withOutlier = [
      TRAIL[0],
      { lat: 40.4168, lon: -3.7038 }, // Madrid
      TRAIL[1],
      TRAIL[2],
    ];

    const coords = rideElevationCoordinates(withOutlier, null);

    expect(coords).not.toContainEqual([-3.7038, 40.4168]);
    expect(coords.length).toBeGreaterThanOrEqual(2);
  });

  it('returns nothing when there is no usable geometry', () => {
    expect(rideElevationCoordinates(null, null)).toEqual([]);
    expect(rideElevationCoordinates([], '')).toEqual([]);
  });

  it('returns nothing for a single point, which has no gain to measure', () => {
    expect(rideElevationCoordinates([TRAIL[0]], null)).toEqual([]);
  });

  it('ignores malformed trail entries rather than passing NaN to the DEM', () => {
    const dirty = [
      TRAIL[0],
      { lat: Number.NaN, lon: 25.58 },
      { lat: 45.6431, lon: Number.NaN },
      null,
      undefined,
      { lat: '45.64', lon: '25.58' },
      TRAIL[1],
      TRAIL[2],
    ] as unknown as Array<{ lat: number; lon: number }>;

    const coords = rideElevationCoordinates(dirty, null);

    expect(coords.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))).toBe(true);
    expect(coords.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects out-of-range coordinates', () => {
    const outOfRange = [
      { lat: 91, lon: 0 },
      { lat: 0, lon: 181 },
      TRAIL[0],
      TRAIL[1],
    ];

    const coords = rideElevationCoordinates(outOfRange, null);

    expect(coords).toHaveLength(2);
    expect(coords).toEqual([
      [TRAIL[0].lon, TRAIL[0].lat],
      [TRAIL[1].lon, TRAIL[1].lat],
    ]);
  });
});
