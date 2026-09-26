/**
 * Index mapping for risk colours on a shared route.
 *
 * The two properties that matter, because getting either wrong paints real risk
 * colours onto the wrong roads — which is worse than painting none:
 *   - matching is by COORDINATE, not by the order segments arrive in
 *   - a segment that is not part of the given line is DROPPED, never guessed at
 */
import { describe, expect, it } from 'vitest';

import { mapRiskSegmentsToIndexRanges, type RiskGeometrySegment } from './routeShareRiskIndex';

const line = (coords: [number, number][], color: string): RiskGeometrySegment => ({
  geometry: { type: 'LineString', coordinates: coords },
  color,
});

/** A five-vertex route, the shape ST_DumpSegments would cut into four pieces. */
const ROUTE: [number, number][] = [
  [26.1, 44.43],
  [26.11, 44.44],
  [26.12, 44.45],
  [26.13, 44.46],
  [26.14, 44.47],
];

const RED = '#EF4444';
const GREEN = '#22C55E';

describe('mapRiskSegmentsToIndexRanges', () => {
  it('maps each 2-point segment onto its own index range', () => {
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [
      line([ROUTE[0], ROUTE[1]], GREEN),
      line([ROUTE[1], ROUTE[2]], RED),
    ]);

    expect(ranges).toEqual([
      { startIndex: 0, endIndex: 1, color: GREEN },
      { startIndex: 1, endIndex: 2, color: RED },
    ]);
  });

  it('does NOT depend on the order segments arrive in', () => {
    // get_segmented_risk_route has no ORDER BY anywhere in its CTE chain, so the
    // arrival order is guaranteed by nothing. Shuffled input, same answer.
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [
      line([ROUTE[3], ROUTE[4]], RED),
      line([ROUTE[0], ROUTE[1]], GREEN),
      line([ROUTE[2], ROUTE[3]], GREEN),
    ]);

    expect(ranges.map((r) => r.startIndex)).toEqual([0, 2, 3]);
  });

  it('spans a stride when risk was fetched from a downsampled copy', () => {
    // downsampleCoordinates picks a SUBSET and never interpolates, so a segment
    // between two sampled points legitimately covers the vertices in between.
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [line([ROUTE[0], ROUTE[2]], RED)]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 2, color: RED }]);
  });

  it('drops segments whose endpoints are not on this line (the trimmed case)', () => {
    // A trimmed share has genuinely lost its head and tail, and the cut points
    // are interpolated rather than original — so those stretches must not be
    // approximated onto the nearest surviving vertex.
    const trimmed = ROUTE.slice(1, 4);
    const ranges = mapRiskSegmentsToIndexRanges(trimmed, [
      line([ROUTE[0], ROUTE[1]], RED), // head, cut away
      line([ROUTE[1], ROUTE[2]], GREEN), // survives
      line([ROUTE[3], ROUTE[4]], RED), // tail, cut away
    ]);

    expect(ranges).toEqual([{ startIndex: 0, endIndex: 1, color: GREEN }]);
  });

  it('normalises a reversed segment rather than dropping it', () => {
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [line([ROUTE[2], ROUTE[1]], RED)]);
    expect(ranges).toEqual([{ startIndex: 1, endIndex: 2, color: RED }]);
  });

  it('flattens MultiLineString into one range per line', () => {
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [
      {
        color: RED,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [ROUTE[0], ROUTE[1]],
            [ROUTE[2], ROUTE[3]],
          ],
        },
      },
    ]);

    expect(ranges).toEqual([
      { startIndex: 0, endIndex: 1, color: RED },
      { startIndex: 2, endIndex: 3, color: RED },
    ]);
  });

  it('ignores zero-length and malformed segments', () => {
    expect(
      mapRiskSegmentsToIndexRanges(ROUTE, [
        line([ROUTE[1], ROUTE[1]], RED), // same vertex twice
        line([ROUTE[1]] as [number, number][], RED), // one point
        { geometry: null, color: RED },
        { geometry: undefined, color: RED },
      ]),
    ).toEqual([]);
  });

  it('returns nothing when there is no line or no risk data', () => {
    expect(mapRiskSegmentsToIndexRanges([], [line([ROUTE[0], ROUTE[1]], RED)])).toEqual([]);
    expect(mapRiskSegmentsToIndexRanges([ROUTE[0]], [line([ROUTE[0], ROUTE[1]], RED)])).toEqual([]);
    expect(mapRiskSegmentsToIndexRanges(ROUTE, [])).toEqual([]);
  });

  it('matches at polyline6 precision, tolerating float noise from the round trip', () => {
    // Both sides have been through a polyline6 encode/decode; 6dp is the real
    // resolution, so sub-micro-degree noise must still match.
    const noisy: [number, number] = [26.11 + 1e-9, 44.44 - 1e-9];
    const ranges = mapRiskSegmentsToIndexRanges(ROUTE, [line([ROUTE[0], noisy], RED)]);
    expect(ranges).toEqual([{ startIndex: 0, endIndex: 1, color: RED }]);
  });
});
