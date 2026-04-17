import { haversineDistance, polylineSegmentDistance } from './distance';

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
  trimMeters: number = 200,
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
