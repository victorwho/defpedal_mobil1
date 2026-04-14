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
 * Points are [lon, lat] (GeoJSON order). Returns 0 if fromIndex >= toIndex
 * or the array has fewer than 2 points.
 */
export const polylineSegmentDistance = (
  points: readonly [number, number][],
  fromIndex: number,
  toIndex: number,
): number => {
  if (points.length < 2 || fromIndex >= toIndex) return 0;

  const start = Math.max(0, fromIndex);
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

  let bestSegment = 0;
  let bestProjected: [number, number] = [points[0][1], points[0][0]];
  let bestDist = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
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
