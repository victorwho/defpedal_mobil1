import { haversineDistance, polylineSegmentDistance } from './distance';
import { SHARE_TRIM_METERS } from './trimEndpointsForShare';
import type { StaticImageRiskSegment } from './mapboxStaticImageUrl';

/**
 * Interpolates a point at a given fraction (0..1) along the segment from a → b.
 * Both inputs and outputs are [lon, lat] (GeoJSON order).
 */
const interpolate = (
  a: readonly [number, number],
  b: readonly [number, number],
  t: number,
): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Walks along the polyline from `startIndex` until `targetMeters` is reached,
 * returning the interpolated [lon, lat] point and the index of the segment
 * end vertex that lies *beyond* that point. The caller uses that index as the
 * first vertex to keep (for the head trim) or last vertex to keep (for the
 * tail trim, after reversing).
 */
const walkForward = (
  coords: readonly [number, number][],
  startIndex: number,
  targetMeters: number,
): { point: [number, number]; nextIndex: number } => {
  let accumulated = 0;

  for (let i = startIndex; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const segLen = haversineDistance([a[1], a[0]], [b[1], b[0]]);

    if (accumulated + segLen >= targetMeters) {
      const remaining = targetMeters - accumulated;
      const t = segLen === 0 ? 0 : remaining / segLen;
      return { point: interpolate(a, b, t), nextIndex: i + 1 };
    }

    accumulated += segLen;
  }

  // Fallback — shouldn't be reached when called with a valid target
  const last = coords[coords.length - 1];
  return { point: [last[0], last[1]], nextIndex: coords.length - 1 };
};

/**
 * Trims `trimMeters` from both ends of a polyline to protect privacy.
 *
 * Removes start/end portions so that home/work locations are not revealed
 * when a ride is shared publicly. Uses along-polyline distance — not
 * straight-line — so the trim is accurate on winding roads.
 *
 * Returns the original array unchanged when:
 *   - coords is empty
 *   - coords has a single point
 *   - total route length is shorter than 2 × trimMeters
 *
 * The exact-boundary case (total === 2 × trimMeters) returns a 2-point
 * polyline [headCut, tailCut] which both land on the same interior point.
 */
export function trimPrivacyZone(
  coords: readonly [number, number][],
  trimMeters: number = SHARE_TRIM_METERS,
): [number, number][] {
  if (!coords || coords.length === 0) return [];
  if (coords.length === 1) return [[coords[0][0], coords[0][1]]];

  const totalLength = polylineSegmentDistance(
    coords as readonly [number, number][],
    0,
    coords.length - 1,
  );

  if (totalLength < trimMeters * 2) {
    // Return a shallow copy of tuples so the caller can't mutate our return
    // and accidentally leak it back into their input.
    return coords.map(([lon, lat]) => [lon, lat] as [number, number]);
  }

  // Head trim: walk forward from index 0
  const head = walkForward(coords, 0, trimMeters);

  // Tail trim: walk along the polyline from the end. We compute the distance
  // from the start at which the tail cut lies (totalLength - trimMeters),
  // then walk forward to that point.
  const tailTargetFromStart = totalLength - trimMeters;
  const tail = walkForward(coords, 0, tailTargetFromStart);

  const kept: [number, number][] = [head.point];

  // Copy whole vertices that lie strictly between the two cut points.
  // head.nextIndex is the first vertex *after* the head cut; tail.nextIndex
  // is the first vertex *after* the tail cut. So the interior vertices are
  // [head.nextIndex, tail.nextIndex - 1].
  for (let i = head.nextIndex; i < tail.nextIndex; i++) {
    kept.push([coords[i][0], coords[i][1]]);
  }

  kept.push(tail.point);
  return kept;
}

// ---------------------------------------------------------------------------
// Share geometry — trail AND risk overlay together
// ---------------------------------------------------------------------------

/**
 * Result of {@link trimShareGeometry}. `trimmed` reports whether a trim was
 * actually applied, so a caller can tell "protected" from "too short to
 * protect" instead of guessing.
 */
export interface TrimmedShareGeometry {
  coords: [number, number][];
  riskSegments: StaticImageRiskSegment[];
  trimmed: boolean;
}

/**
 * Trims BOTH the GPS trail and the risk-segment overlay for a public share.
 *
 * Why this function exists at all, rather than callers composing
 * `trimPrivacyZone` themselves: they did, and it leaked. `useShareRide` trimmed
 * only `coords` and forwarded `riskSegments` untouched, and
 * `mapboxStaticImageUrl` draws ONLY the risk segments when any are present —
 * dropping the trimmed polyline from the rendered path entirely. The shared PNG
 * therefore showed the complete door-to-door planned route with pins sitting
 * ~200 m inside each end, so the line visibly overshot its own pins. Risk
 * segments are populated in all 32 covered countries, so that was the common
 * path, and the output is a PNG on Instagram/WhatsApp with no expiry and no
 * revocation.
 *
 * Returning both in one value makes the two impossible to trim independently —
 * the producer/consumer split is what allowed the bug to survive review.
 * See docs/plans/external-review-triage-2026-09-25.md P0-4.
 *
 * The overlay is trimmed by RADIUS from the raw first/last trail points, not by
 * along-route distance, because risk segments come from the PLANNED route and
 * share no parameterisation with the recorded trail. A radius exclusion is also
 * strictly stronger: it removes a loop that passes back near home mid-ride,
 * which an along-route trim would keep.
 *
 * When the ride is too short to trim (total trail length < 2 × trimMeters),
 * NOTHING is trimmed and `trimmed` is false — deliberately mirroring
 * `trimPrivacyZone`'s long-standing policy so this function cannot silently
 * change what a short ride shares.
 */
export function trimShareGeometry(params: {
  coords: readonly [number, number][];
  riskSegments?: readonly StaticImageRiskSegment[];
  trimMeters?: number;
}): TrimmedShareGeometry {
  const { coords, riskSegments, trimMeters = 200 } = params;

  const copySegments = (): StaticImageRiskSegment[] =>
    (riskSegments ?? []).map((seg) => ({
      color: seg.color,
      coords: seg.coords.map(([lon, lat]) => [lon, lat] as [number, number]),
    }));

  if (!coords || coords.length < 2) {
    return {
      coords: (coords ?? []).map(([lon, lat]) => [lon, lat] as [number, number]),
      riskSegments: copySegments(),
      trimmed: false,
    };
  }

  const totalLength = polylineSegmentDistance(coords, 0, coords.length - 1);
  if (totalLength < trimMeters * 2) {
    return {
      coords: coords.map(([lon, lat]) => [lon, lat] as [number, number]),
      riskSegments: copySegments(),
      trimmed: false,
    };
  }

  // Raw endpoints — the points we must not reveal. Taken BEFORE trimming.
  const rawStart = coords[0];
  const rawEnd = coords[coords.length - 1];

  const isNearAnEndpoint = (point: readonly [number, number]): boolean => {
    const latLon: [number, number] = [point[1], point[0]];
    return (
      haversineDistance(latLon, [rawStart[1], rawStart[0]]) < trimMeters ||
      haversineDistance(latLon, [rawEnd[1], rawEnd[0]]) < trimMeters
    );
  };

  const trimmedSegments: StaticImageRiskSegment[] = [];
  for (const seg of riskSegments ?? []) {
    const kept = seg.coords.filter((point) => !isNearAnEndpoint(point));
    // A single point cannot draw a line, and a 1-point LineString is invalid
    // GeoJSON — drop it rather than emit a degenerate overlay.
    if (kept.length >= 2) {
      trimmedSegments.push({
        color: seg.color,
        coords: kept.map(([lon, lat]) => [lon, lat] as [number, number]),
      });
    }
  }

  return {
    coords: trimPrivacyZone(coords, trimMeters),
    riskSegments: trimmedSegments,
    trimmed: true,
  };
}
