import type { Coordinate } from './contracts';

const EARTH_RADIUS_METERS = 6371e3;

/**
 * Calculates the distance between two points in meters using the Haversine formula.
 */
export function haversineDistance(
  coords1: [number, number],
  coords2: [number, number],
): number {
  const earthRadiusMeters = 6371e3;
  const lat1Rad = (coords1[0] * Math.PI) / 180;
  const lat2Rad = (coords2[0] * Math.PI) / 180;
  const deltaLatRad = ((coords2[0] - coords1[0]) * Math.PI) / 180;
  const deltaLonRad = ((coords2[1] - coords1[1]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

/**
 * Computes the along-route distance between two indices on a polyline.
 * Points are [lon, lat] (GeoJSON order). Returns 0 when there is no segment
 * to measure: array has <2 points, fromIndex >= toIndex, fromIndex is past
 * the last vertex, or toIndex is at/before the first vertex.
 *
 * Negative fromIndex is clamped to 0 (treated as "from start"). toIndex past
 * the last vertex is clamped to the last vertex (treated as "to end"). A
 * fromIndex that is past the last vertex is NOT clamped — it returns 0
 * because the rider has run out of polyline. Callers that need to detect
 * this stale-index condition should validate the index before calling.
 */
export const polylineSegmentDistance = (
  points: readonly [number, number][],
  fromIndex: number,
  toIndex: number,
): number => {
  if (points.length < 2 || fromIndex >= toIndex) return 0;

  const start = Math.max(0, fromIndex);
  // fromIndex past the last vertex means the rider/cursor is off the end of
  // the polyline. There is no remaining segment to measure — return 0
  // explicitly rather than relying on the loop bounds incidentally collapsing.
  if (start >= points.length - 1) return 0;
  const end = Math.min(points.length - 1, toIndex);

  let distance = 0;
  for (let i = start; i < end; i++) {
    distance += haversineDistance(
      [points[i][1], points[i][0]],
      [points[i + 1][1], points[i + 1][0]],
    );
  }

  return distance;
};

/**
 * Finds the closest point in an array of [lon, lat] coordinates to a target [lat, lon].
 * Only checks distance to vertices — use `closestPointOnPolyline` for segment-aware snapping.
 */
export const findClosestPointIndex = (
  targetCoord: [number, number],
  points: [number, number][],
): number => {
  if (!points || points.length === 0) {
    return -1;
  }

  let closestIndex = -1;
  let minDistance = Infinity;

  points.forEach((point, index) => {
    const pointLatLon: [number, number] = [point[1], point[0]];
    const distance = haversineDistance(targetCoord, pointLatLon);

    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
};

export interface PolylineSnapResult {
  /** Index of the segment start vertex (the projected point lies on segment [segmentIndex, segmentIndex+1]) */
  segmentIndex: number;
  /** The closest point on the polyline segment, as [lat, lon] */
  projectedPoint: [number, number];
  /** Distance in meters from the target to the projected point */
  distanceMeters: number;
}

/**
 * Projects a point onto the nearest line segment of a polyline, returning the
 * perpendicular distance and the projected coordinate.
 *
 * This is more accurate than `findClosestPointIndex` (vertex-only) because it
 * considers the full line segment between consecutive vertices. On a straight
 * road with vertices 200m apart, the midpoint rider would show ~0m distance
 * instead of ~100m.
 *
 * @param targetCoord Target position as [lat, lon]
 * @param points      Polyline as array of [lon, lat] (GeoJSON order)
 */
export const closestPointOnPolyline = (
  targetCoord: [number, number],
  points: readonly [number, number][],
): PolylineSnapResult | null =>
  closestPointOnPolylineWithin(targetCoord, points, 0, Number.MAX_SAFE_INTEGER);

/**
 * `closestPointOnPolyline`, restricted to the segments in `[fromIndex, toIndex]`.
 *
 * Exists for routes the rider committed to following — a generated loop or an
 * imported GPX course — which can legitimately cross themselves. Searching the
 * whole polyline at a crossing snaps to whichever branch happens to be nearer,
 * so progress can jump backwards by kilometres and `remainingDistanceMeters`
 * with it. Restricting the search to a window that starts at the furthest
 * vertex already reached makes progress monotonic.
 *
 * The window is a half-open guard, not a hard gate: the caller is responsible
 * for sizing `toIndex` generously enough that a rider moving fast between
 * fixes is never stranded behind it, and for falling back to the unrestricted
 * search when the windowed snap comes back implausibly far away.
 *
 * Bounds are clamped rather than validated — an out-of-range window degrades
 * to the full polyline instead of returning null, because a navigation path
 * that silently loses its snap is worse than one that briefly widens it.
 */
export const closestPointOnPolylineWithin = (
  targetCoord: [number, number],
  points: readonly [number, number][],
  fromIndex: number,
  toIndex: number,
): PolylineSnapResult | null => {
  if (!points || points.length === 0) return null;

  // Single point — no segments, snap to the only vertex
  if (points.length === 1) {
    return {
      segmentIndex: 0,
      projectedPoint: [points[0][1], points[0][0]],
      distanceMeters: haversineDistance(targetCoord, [points[0][1], points[0][0]]),
    };
  }

  const lastSegment = points.length - 2;
  const start = Math.min(Math.max(0, Math.floor(fromIndex)), lastSegment);
  const end = Math.min(Math.max(start, Math.floor(toIndex)), lastSegment);

  let bestSegment = start;
  let bestProjected: [number, number] = [points[start][1], points[start][0]];
  let bestDist = Infinity;

  for (let i = start; i <= end; i++) {
    const projected = projectOntoSegment(
      targetCoord,
      [points[i][1], points[i][0]],
      [points[i + 1][1], points[i + 1][0]],
    );
    const dist = haversineDistance(targetCoord, projected);
    if (dist < bestDist) {
      bestDist = dist;
      bestSegment = i;
      bestProjected = projected;
    }
  }

  return {
    segmentIndex: bestSegment,
    projectedPoint: bestProjected,
    distanceMeters: bestDist,
  };
};

/**
 * Projects a point onto a line segment defined by two endpoints.
 * All coordinates are [lat, lon]. Uses flat-Earth approximation (scaled by
 * cos(latitude)) which is accurate within ~1m for distances under 10km.
 *
 * Returns the projected [lat, lon], clamped to the segment endpoints.
 */
const projectOntoSegment = (
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number],
): [number, number] => {
  // Convert to a local flat coordinate system (meters-like) to do the
  // vector projection, then convert back. We scale longitude by cos(lat)
  // so that 1 degree lon ≈ 1 degree lat in distance.
  const cosLat = Math.cos((point[0] * Math.PI) / 180);

  const px = (point[1] - segStart[1]) * cosLat;
  const py = point[0] - segStart[0];

  const dx = (segEnd[1] - segStart[1]) * cosLat;
  const dy = segEnd[0] - segStart[0];

  const segLenSq = dx * dx + dy * dy;

  // Degenerate segment (start == end) — return the start point
  if (segLenSq === 0) return segStart;

  // Parameter t: 0 = segStart, 1 = segEnd, clamped
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq));

  return [
    segStart[0] + t * dy,
    segStart[1] + t * (segEnd[1] - segStart[1]),
  ];
};

/**
 * The point `distanceMeters` away from `origin` along `bearingDegrees`.
 *
 * Forward geodesic on a sphere — the inverse of `haversineDistance`, and the
 * primitive the loop generator's ring synthesis is built on. Bearing is
 * measured clockwise from true north, matching the compass vocabulary the
 * heading control uses.
 *
 * Spherical rather than ellipsoidal on purpose: at the radii a loop ring uses
 * (hundreds of metres to ~16 km) the WGS84 correction is well under the
 * distance tolerance the generator already accepts, and the ring is only a
 * hint to the router anyway — the road network decides where the loop
 * actually goes.
 */
export const destinationPoint = (
  origin: Coordinate,
  bearingDegrees: number,
  distanceMeters: number,
): Coordinate => {
  const angular = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lon1 = (origin.lon * Math.PI) / 180;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngular = Math.sin(angular);
  const cosAngular = Math.cos(angular);

  const sinLat2 = sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearing);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * sinAngular * cosLat1,
      cosAngular - sinLat1 * sinLat2,
    );

  // Normalise longitude into [-180, 180] so a ring thrown across the
  // antimeridian still produces coordinates OSRM will accept.
  const lonDegrees = (((lon2 * 180) / Math.PI + 540) % 360) - 180;

  return { lat: (lat2 * 180) / Math.PI, lon: lonDegrees };
};
