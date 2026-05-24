/**
 * extractPointCoordinate — Unit tests
 *
 * Guards Sentry MOBILE-9: tapping a non-Point feature in a Mapbox vector tile
 * source layer used to pass a nested coordinate array across the RN bridge,
 * which crashed the app fatally inside rnmapbox's `MapView.getPointInView`.
 * The helper refuses everything that isn't a flat `Point` with two finite
 * numeric coordinates; these tests pin down that contract.
 */
import { describe, expect, it } from 'vitest';

import { extractPointCoordinate } from './extractPointCoordinate';

describe('extractPointCoordinate', () => {
  describe('accepts well-formed Point geometry', () => {
    it('returns [lng, lat] for a flat Point', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [21.22, 45.75] })).toEqual([
        21.22,
        45.75,
      ]);
    });

    it('ignores the optional third altitude element', () => {
      // GeoJSON spec allows a third "altitude" entry — must NOT fail validation,
      // but we drop it because rnmapbox only wants 2 elements.
      expect(extractPointCoordinate({ type: 'Point', coordinates: [21.22, 45.75, 120] })).toEqual([
        21.22,
        45.75,
      ]);
    });

    it('accepts integer coordinates', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [0, 0] })).toEqual([0, 0]);
    });

    it('accepts negative coordinates (West / South hemispheres)', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [-122.42, -37.78] })).toEqual([
        -122.42,
        -37.78,
      ]);
    });
  });

  describe('rejects non-Point geometry types (MOBILE-9 root cause)', () => {
    it('rejects LineString — nested [[lng,lat], …]', () => {
      const lineString = {
        type: 'LineString',
        coordinates: [
          [21.22, 45.75],
          [21.23, 45.76],
        ],
      };
      expect(extractPointCoordinate(lineString)).toBeNull();
    });

    it('rejects Polygon — doubly nested [[[lng,lat], …]]', () => {
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [21.22, 45.75],
            [21.23, 45.76],
            [21.24, 45.75],
            [21.22, 45.75],
          ],
        ],
      };
      expect(extractPointCoordinate(polygon)).toBeNull();
    });

    it('rejects MultiPoint', () => {
      expect(
        extractPointCoordinate({
          type: 'MultiPoint',
          coordinates: [
            [21.22, 45.75],
            [21.23, 45.76],
          ],
        }),
      ).toBeNull();
    });

    it('rejects MultiLineString', () => {
      expect(
        extractPointCoordinate({
          type: 'MultiLineString',
          coordinates: [
            [
              [21.22, 45.75],
              [21.23, 45.76],
            ],
          ],
        }),
      ).toBeNull();
    });

    it('rejects MultiPolygon', () => {
      expect(
        extractPointCoordinate({
          type: 'MultiPolygon',
          coordinates: [[[[21.22, 45.75]]]],
        }),
      ).toBeNull();
    });

    it('rejects GeometryCollection', () => {
      expect(
        extractPointCoordinate({
          type: 'GeometryCollection',
          geometries: [{ type: 'Point', coordinates: [21.22, 45.75] }],
        }),
      ).toBeNull();
    });

    it('rejects geometry that mistakenly nests a coordinate as element 0 (the exact crash shape)', () => {
      // This is what the RN bridge actually saw on the v0.2.38 crash — the
      // outer array's first element is itself an array, so getDouble(0)
      // sees a ReadableNativeArray instead of a Double.
      const malformed = {
        type: 'Point',
        coordinates: [[21.22, 45.75], 45.75] as unknown as number[],
      };
      expect(extractPointCoordinate(malformed)).toBeNull();
    });
  });

  describe('rejects missing or malformed inputs', () => {
    it.each([null, undefined, 'point', 42, true, []])('rejects non-object input: %p', (input) => {
      expect(extractPointCoordinate(input)).toBeNull();
    });

    it('rejects geometry with no type field', () => {
      expect(extractPointCoordinate({ coordinates: [21.22, 45.75] })).toBeNull();
    });

    it('rejects geometry with no coordinates field', () => {
      expect(extractPointCoordinate({ type: 'Point' })).toBeNull();
    });

    it('rejects empty coordinates array', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [] })).toBeNull();
    });

    it('rejects single-element coordinates array', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [21.22] })).toBeNull();
    });

    it('rejects coordinates that are not an array', () => {
      expect(
        extractPointCoordinate({
          type: 'Point',
          coordinates: { lng: 21.22, lat: 45.75 } as unknown,
        }),
      ).toBeNull();
    });
  });

  describe('rejects non-finite numeric coordinates', () => {
    it('rejects NaN longitude', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [Number.NaN, 45.75] })).toBeNull();
    });

    it('rejects NaN latitude', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [21.22, Number.NaN] })).toBeNull();
    });

    it('rejects Infinity', () => {
      expect(
        extractPointCoordinate({ type: 'Point', coordinates: [Number.POSITIVE_INFINITY, 45.75] }),
      ).toBeNull();
      expect(
        extractPointCoordinate({ type: 'Point', coordinates: [21.22, Number.NEGATIVE_INFINITY] }),
      ).toBeNull();
    });

    it('rejects string coordinates', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: ['21.22', '45.75'] })).toBeNull();
    });

    it('rejects null inside coordinates', () => {
      expect(extractPointCoordinate({ type: 'Point', coordinates: [null, 45.75] })).toBeNull();
      expect(extractPointCoordinate({ type: 'Point', coordinates: [21.22, null] })).toBeNull();
    });
  });
});
