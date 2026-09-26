/**
 * Risk segments for a HISTORICAL trip — one cached fetch, two consumers.
 *
 * Why this exists: a past ride keeps its polyline but not its risk data. The
 * live `routePreview` that carries `riskSegments` during planning is gone by the
 * time a trip reaches history, so the trip map drew one flat green line and the
 * trip share image drew one flat brand-yellow line. Both were reported from the
 * device on preview 0.2.174 ("vague green", "homogenous orange").
 *
 * The map (a render) and the share (an imperative callback) both need the same
 * answer, so they must not fetch separately. Both resolve through the same
 * `tripRiskSegmentsQueryOptions` — the map via `useQuery`, the share via
 * `queryClient.fetchQuery` — so when they ask about the same geometry they share
 * one cache entry and one request, in either order. See `geometryFingerprint`
 * for why the key is not the trip id alone.
 *
 * `staleTime: Infinity` is correct rather than lazy: a finished ride's geometry
 * never changes, and the risk dataset is swapped every few months, not hourly.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { RiskSegment } from '@defensivepedal/core';

import { fetchRiskSegmentsForCoordinates } from '../lib/mapbox-routing';

/** Shape `useShareRide` wants for the static share image. */
export interface ShareRiskSegment {
  readonly coords: [number, number][];
  readonly color: string;
}

/**
 * Cheap deterministic fingerprint of the geometry a fetch was made for.
 *
 * ⚠️ The key includes this, not just the trip id, because the two consumers do
 * not always ask about the same line. The trip MAP risk-colours the planned
 * route (the trail is drawn on top of it in `HistoryLayers` and is deliberately
 * blue), while the SHARE image prefers the GPS trail and only falls back to the
 * planned route. Keying on the trip id alone would hand one consumer segments
 * computed for the other's geometry — subtly wrong colours, snapped to roads
 * the drawn line never took.
 *
 * With the fingerprint it self-tunes: on a trail-less trip both consumers pass
 * the same planned coords, so they share one entry and one request — which is
 * the reported case. On a trip with a trail they legitimately differ and get
 * one entry each.
 */
const geometryFingerprint = (coords: readonly [number, number][]): string => {
  if (coords.length === 0) return 'empty';
  const first = coords[0];
  const last = coords[coords.length - 1];
  return [
    coords.length,
    first[0].toFixed(5),
    first[1].toFixed(5),
    last[0].toFixed(5),
    last[1].toFixed(5),
  ].join(':');
};

export const tripRiskSegmentsQueryKey = (
  tripId: string,
  coords: readonly [number, number][],
) => ['trip-risk-segments', tripId, geometryFingerprint(coords)] as const;

/**
 * Query options shared by the hook and the imperative share path. Passing the
 * identical object to `useQuery` and `queryClient.fetchQuery` is what makes the
 * two share one cache entry instead of racing two requests.
 */
export const tripRiskSegmentsQueryOptions = (
  tripId: string,
  coords: readonly [number, number][],
) => ({
  queryKey: tripRiskSegmentsQueryKey(tripId, coords),
  queryFn: () => fetchRiskSegmentsForCoordinates(coords),
  staleTime: Infinity,
});

/**
 * Risk segments for the trip's drawn geometry, or `[]` while loading, on
 * failure, and outside the covered countries. Callers MUST render their existing
 * plain line for an empty result — never a guessed colour.
 */
export const useTripRiskSegments = (
  tripId: string | undefined,
  coords: readonly [number, number][] | undefined,
): RiskSegment[] => {
  const enabled = Boolean(tripId) && (coords?.length ?? 0) >= 2;

  const { data } = useQuery({
    ...tripRiskSegmentsQueryOptions(tripId ?? '', coords ?? []),
    enabled,
  });

  return data ?? [];
};

/**
 * Resolve risk segments for a share, reusing the map's cached result when the
 * rider has already opened the trip.
 *
 * Never rejects: a share must go out even when risk data does not arrive, so a
 * failure degrades to the plain line rather than blocking the share sheet.
 */
export const resolveTripShareRiskSegments = async (
  queryClient: QueryClient,
  tripId: string,
  coords: readonly [number, number][],
): Promise<ShareRiskSegment[] | undefined> => {
  if (coords.length < 2) return undefined;

  try {
    const segments = await queryClient.fetchQuery(
      tripRiskSegmentsQueryOptions(tripId, coords),
    );
    return toShareRiskSegments(segments);
  } catch {
    return undefined;
  }
};

/**
 * `RiskSegment` -> the `{ coords, color }` pairs the static image builder takes.
 *
 * Lives here so the three surfaces that need this conversion agree on it. Note
 * MultiLineString segments are flattened rather than dropped: `feedback.tsx`
 * filters them out with a comment calling them rare, but dropping a segment
 * leaves a COLOURLESS GAP in the drawn line, and on a historical trip there is
 * no second chance to notice.
 */
export const toShareRiskSegments = (
  segments: readonly RiskSegment[],
): ShareRiskSegment[] | undefined => {
  const out: ShareRiskSegment[] = [];

  for (const segment of segments) {
    const geometry = segment.geometry;
    if (!geometry) continue;

    if (geometry.type === 'LineString') {
      const coords = geometry.coordinates as [number, number][];
      if (coords.length >= 2) out.push({ coords, color: segment.color });
      continue;
    }

    if (geometry.type === 'MultiLineString') {
      for (const line of geometry.coordinates as [number, number][][]) {
        if (line.length >= 2) out.push({ coords: line, color: segment.color });
      }
    }
  }

  // `undefined` rather than `[]`: mapboxStaticImageUrl treats an empty array as
  // "no overlay" and draws its default single-colour line, so the two are
  // equivalent there — but undefined says "nothing to draw" to any future
  // caller that distinguishes them.
  return out.length > 0 ? out : undefined;
};
