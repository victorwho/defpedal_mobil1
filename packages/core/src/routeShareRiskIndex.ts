/**
 * Mapping road-snapped risk segments onto index ranges of a shared polyline.
 *
 * The public share payload carries the route as one polyline plus index ranges,
 * deliberately, so a long ride does not store its geometry twice. The app's risk
 * segments are separate road-snapped LineStrings with a server-supplied colour,
 * so something has to map one onto the other. This is that something.
 *
 * ⚠️ Why coordinate matching rather than segment ORDER. `get_segmented_risk_route`
 * builds its features with `ST_DumpSegments`, which cuts the submitted line into
 * simple 2-point segments — so every risk segment's endpoints ARE submitted
 * vertices, and an exact mapping is possible. But that SQL has no `ORDER BY`
 * anywhere in its CTE chain, so the order features come back in is not
 * guaranteed by anything (this repo already has a documented case of trusting
 * implicit ordering — TODO.md SCALE-6). Matching on coordinates is exact AND
 * order-independent; trusting the index would be neither.
 *
 * ⚠️ Why matching against the SERVED polyline works even after downsampling.
 * Risk is fetched for a 12k-point-capped copy of the geometry, but
 * `downsampleCoordinates` selects a SUBSET of the original points and never
 * interpolates, so every sampled coordinate is still an exact original vertex.
 * A range therefore comes out as [i, i+stride], which correctly spans that
 * stretch of the drawn line.
 */
import type { GeoJsonLineString, GeoJsonMultiLineString } from './types';

/** Risk input: just the geometry and the colour the server assigned it. */
export interface RiskGeometrySegment {
  readonly geometry: GeoJsonLineString | GeoJsonMultiLineString | null | undefined;
  readonly color: string;
}

export interface RiskIndexRange {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly color: string;
}

/**
 * Polyline6 carries 6 decimal places, so 6 is the precision at which two
 * coordinates are genuinely the same point. Both sides of the comparison have
 * been through a polyline6 round trip, so this is lossless for our purposes.
 */
const keyOf = (lon: number, lat: number): string =>
  `${lon.toFixed(6)},${lat.toFixed(6)}`;

/**
 * Index ranges for `segments` against `coords`.
 *
 * Segments whose endpoints are not vertices of `coords` are SKIPPED rather than
 * approximated — that is the correct behaviour for a trimmed share, where the
 * head and tail stretches have genuinely been cut away and the cut points are
 * interpolated rather than original. Consumers must treat uncovered stretches
 * as "no data here", never paint them a risk colour.
 */
export const mapRiskSegmentsToIndexRanges = (
  coords: readonly [number, number][],
  segments: readonly RiskGeometrySegment[],
): RiskIndexRange[] => {
  if (coords.length < 2 || segments.length === 0) return [];

  // First occurrence wins. A stationary GPS trail can repeat a coordinate at
  // 6dp; preferring the earliest keeps ranges moving forward rather than
  // jumping backwards through the line.
  const indexByKey = new Map<string, number>();
  for (let i = 0; i < coords.length; i += 1) {
    const point = coords[i];
    const key = keyOf(point[0], point[1]);
    if (!indexByKey.has(key)) indexByKey.set(key, i);
  }

  const ranges: RiskIndexRange[] = [];

  for (const segment of segments) {
    const geometry = segment.geometry;
    if (!geometry) continue;

    const lines: [number, number][][] =
      geometry.type === 'LineString'
        ? [geometry.coordinates as [number, number][]]
        : geometry.type === 'MultiLineString'
          ? (geometry.coordinates as [number, number][][])
          : [];

    for (const linePoints of lines) {
      if (linePoints.length < 2) continue;

      const first = linePoints[0];
      const last = linePoints[linePoints.length - 1];
      const startIndex = indexByKey.get(keyOf(first[0], first[1]));
      const endIndex = indexByKey.get(keyOf(last[0], last[1]));

      if (startIndex === undefined || endIndex === undefined) continue;
      // A segment can be reported in either direction; a range is not directed.
      const lo = Math.min(startIndex, endIndex);
      const hi = Math.max(startIndex, endIndex);
      if (hi <= lo) continue;

      ranges.push({ startIndex: lo, endIndex: hi, color: segment.color });
    }
  }

  ranges.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
  return ranges;
};
