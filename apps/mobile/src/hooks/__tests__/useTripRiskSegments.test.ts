// @vitest-environment happy-dom
/**
 * Risk segments for historical trips.
 *
 * Both halves of the 2026-09-26 device report land here: the trip map drew a
 * flat green line and the trip share image drew a flat brand-yellow one,
 * because a past ride keeps its polyline but not its risk data.
 *
 * The properties worth pinning are the two that are easy to get wrong:
 *   - the cache key must separate geometries, or one consumer gets segments
 *     snapped to roads the other's line never took
 *   - an empty result must stay empty (undefined), because every caller relies
 *     on that to fall back to its plain line rather than invent a colour
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RiskSegment } from '@defensivepedal/core';

const fetchSpy = vi.fn();
vi.mock('../../lib/mapbox-routing', () => ({
  fetchRiskSegmentsForCoordinates: (...args: unknown[]) => fetchSpy(...args),
}));

const {
  tripRiskSegmentsQueryKey,
  tripRiskSegmentsQueryOptions,
  toShareRiskSegments,
  resolveTripShareRiskSegments,
} = await import('../useTripRiskSegments');

const line = (coords: [number, number][], color: string): RiskSegment =>
  ({
    id: `seg-${color}`,
    riskScore: 50,
    riskCategory: 'Typical',
    color,
    geometry: { type: 'LineString', coordinates: coords },
  }) as RiskSegment;

const multi = (lines: [number, number][][], color: string): RiskSegment =>
  ({
    id: `multi-${color}`,
    riskScore: 50,
    riskCategory: 'Typical',
    color,
    geometry: { type: 'MultiLineString', coordinates: lines },
  }) as RiskSegment;

const PLANNED: [number, number][] = [
  [25.6, 45.65],
  [25.61, 45.66],
  [25.62, 45.67],
];
const TRAIL: [number, number][] = [
  [25.6001, 45.6501],
  [25.6101, 45.6601],
  [25.6201, 45.6701],
];

beforeEach(() => {
  fetchSpy.mockReset().mockResolvedValue([]);
});

describe('tripRiskSegmentsQueryKey', () => {
  it('is stable for the same trip and geometry, so map + share share one entry', () => {
    // The trail-less case from the report: both consumers pass the planned
    // coords, so they must resolve to one cache entry and one request.
    expect(tripRiskSegmentsQueryKey('trip-1', PLANNED)).toEqual(
      tripRiskSegmentsQueryKey('trip-1', PLANNED),
    );
  });

  it('separates different geometries for the SAME trip', () => {
    // The map colours the planned route; the share prefers the GPS trail. Keying
    // on the trip id alone would serve one of them segments computed for the
    // other's line.
    expect(tripRiskSegmentsQueryKey('trip-1', PLANNED)).not.toEqual(
      tripRiskSegmentsQueryKey('trip-1', TRAIL),
    );
  });

  it('separates different trips', () => {
    expect(tripRiskSegmentsQueryKey('trip-1', PLANNED)).not.toEqual(
      tripRiskSegmentsQueryKey('trip-2', PLANNED),
    );
  });

  it('separates two lines that share endpoints but differ in length', () => {
    // Endpoints alone are not enough: an out-and-back and its one-way leg can
    // start and finish in the same place.
    const denser: [number, number][] = [
      PLANNED[0],
      [25.605, 45.655],
      PLANNED[1],
      PLANNED[2],
    ];
    expect(tripRiskSegmentsQueryKey('trip-1', PLANNED)).not.toEqual(
      tripRiskSegmentsQueryKey('trip-1', denser),
    );
  });
});

describe('toShareRiskSegments', () => {
  it('maps LineString segments to coords + the SERVER colour', () => {
    const out = toShareRiskSegments([line(PLANNED, '#AA0000')]);
    expect(out).toEqual([{ coords: PLANNED, color: '#AA0000' }]);
  });

  it('flattens MultiLineString instead of dropping it', () => {
    // Dropping leaves an uncoloured gap mid-line, which reads as a rendering
    // fault rather than as absent data.
    const out = toShareRiskSegments([
      multi(
        [
          [PLANNED[0], PLANNED[1]],
          [PLANNED[1], PLANNED[2]],
        ],
        '#00AA00',
      ),
    ]);
    expect(out).toHaveLength(2);
    expect(out?.every((s) => s.color === '#00AA00')).toBe(true);
  });

  it('drops degenerate one-point stretches', () => {
    expect(toShareRiskSegments([line([PLANNED[0]] as [number, number][], '#123456')])).toBeUndefined();
  });

  it('returns undefined for no segments, so callers keep their plain line', () => {
    expect(toShareRiskSegments([])).toBeUndefined();
  });
});

describe('resolveTripShareRiskSegments', () => {
  const makeClient = (impl?: () => Promise<unknown>) =>
    ({ fetchQuery: vi.fn(impl ?? (async () => [line(PLANNED, '#AA0000')])) }) as never;

  it('returns converted segments from the shared query', async () => {
    const client = makeClient();
    await expect(
      resolveTripShareRiskSegments(client, 'trip-1', PLANNED),
    ).resolves.toEqual([{ coords: PLANNED, color: '#AA0000' }]);
  });

  it('never rejects when the fetch fails — the share must still go out', async () => {
    const client = makeClient(async () => {
      throw new Error('offline');
    });
    await expect(
      resolveTripShareRiskSegments(client, 'trip-1', PLANNED),
    ).resolves.toBeUndefined();
  });

  it('does not fetch at all for geometry too short to colour', async () => {
    const client = makeClient();
    await expect(
      resolveTripShareRiskSegments(client, 'trip-1', [PLANNED[0]]),
    ).resolves.toBeUndefined();
    expect((client as unknown as { fetchQuery: ReturnType<typeof vi.fn> }).fetchQuery)
      .not.toHaveBeenCalled();
  });
});

describe('tripRiskSegmentsQueryOptions', () => {
  it('fetches for the coordinates it was given', async () => {
    fetchSpy.mockResolvedValue([line(PLANNED, '#AA0000')]);
    const options = tripRiskSegmentsQueryOptions('trip-1', PLANNED);

    await expect(options.queryFn()).resolves.toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(PLANNED);
  });

  it('never goes stale — a finished ride does not change', () => {
    expect(tripRiskSegmentsQueryOptions('trip-1', PLANNED).staleTime).toBe(Infinity);
  });
});
