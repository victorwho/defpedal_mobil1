import type { Coordinate, RouteResponse } from '@defensivepedal/core';

import { config } from '../config';

/**
 * Generate 2-3 waypoints at evenly-spaced compass bearings around an origin,
 * at a distance of (totalDistance / 3) from the origin. The loop route is:
 * origin -> wp1 -> wp2 -> (wp3?) -> origin.
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Compute a destination point given a start, bearing (degrees), and distance (meters).
 * Uses the spherical law of cosines (accurate enough for <50km).
 */
const destinationPoint = (
  origin: Coordinate,
  bearingDeg: number,
  distanceMeters: number,
): Coordinate => {
  const lat1 = origin.lat * DEG_TO_RAD;
  const lon1 = origin.lon * DEG_TO_RAD;
  const bearing = bearingDeg * DEG_TO_RAD;
  const angularDist = distanceMeters / EARTH_RADIUS_METERS;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: lat2 * RAD_TO_DEG,
    lon: lon2 * RAD_TO_DEG,
  };
};

export interface LoopRouteRequest {
  readonly origin: Coordinate;
  readonly distancePreferenceMeters: number;
  readonly safetyFloor?: number;
  readonly waypointCount?: 2 | 3;
}

/**
 * Generate waypoints for a loop route. Places waypoints at even angular
 * intervals (120deg for 3, 180deg for 2) at radius = distance / (waypointCount + 1).
 */
export const generateLoopWaypoints = (
  request: LoopRouteRequest,
): Coordinate[] => {
  const count = request.waypointCount ?? 3;
  const angleSeparation = 360 / (count + 1);
  // Radius: approximate so the total routed loop is near the desired distance.
  // For n waypoints in a circle, the perimeter is roughly 2*pi*r.
  // We set r = desiredDistance / (2 * pi) as the baseline, but since OSRM routes
  // on roads (not straight lines), we use distance / (count + 1) as a practical heuristic.
  const radius = request.distancePreferenceMeters / (count + 1);

  // Random starting bearing so each request produces a different loop shape
  const startBearing = Math.random() * 360;

  const waypoints: Coordinate[] = [];
  for (let i = 0; i < count; i++) {
    const bearing = (startBearing + angleSeparation * (i + 1)) % 360;
    waypoints.push(destinationPoint(request.origin, bearing, radius));
  }

  return waypoints;
};

/**
 * Build the OSRM coordinate string for a loop: origin -> wp1 -> wp2 -> ... -> origin.
 */
const buildLoopCoordinates = (origin: Coordinate, waypoints: Coordinate[]): string => {
  const points = [origin, ...waypoints, origin];
  return points.map((p) => `${p.lon},${p.lat}`).join(';');
};

/**
 * Fetch a loop route from the custom OSRM server.
 */
export const fetchLoopRoute = async (
  request: LoopRouteRequest,
): Promise<RouteResponse> => {
  const waypoints = generateLoopWaypoints(request);

  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    annotations: 'true',
  });

  // For beginner persona (safetyFloor >= 70), exclude unpaved roads
  if (request.safetyFloor != null && request.safetyFloor >= 70) {
    params.set('exclude', 'unpaved');
  }

  const coordinates = buildLoopCoordinates(request.origin, waypoints);
  const url = `${config.safeOsrmBaseUrl}/${coordinates}?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Loop route request failed with ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};
