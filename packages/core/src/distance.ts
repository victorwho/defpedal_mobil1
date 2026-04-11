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
