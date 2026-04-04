import type { Coordinate, RerouteRequest, RoutePreviewRequest } from './contracts';
import { findClosestPointIndex } from './distance';

export const hasStartOverride = (
  request: Pick<RoutePreviewRequest, 'startOverride'>,
): boolean => Boolean(request.startOverride);

export const getPreviewOrigin = (
  request: Pick<RoutePreviewRequest, 'origin' | 'startOverride'>,
): Coordinate => request.startOverride ?? request.origin;

/**
 * Strip waypoints the rider has already passed.
 *
 * Compares each waypoint's position along the route polyline to the
 * rider's position.  Any waypoint whose closest-point index on the
 * polyline is at or behind the rider's index is considered passed.
 */
const stripPassedWaypoints = (
  waypoints: readonly Coordinate[],
  riderPosition: Coordinate,
  routeCoordinates: readonly [number, number][],
): Coordinate[] => {
  if (waypoints.length === 0 || routeCoordinates.length === 0) return [...waypoints];

  const riderIndex = findClosestPointIndex(
    [riderPosition.lat, riderPosition.lon],
    routeCoordinates as [number, number][],
  );

  return waypoints.filter((wp) => {
    const wpIndex = findClosestPointIndex(
      [wp.lat, wp.lon],
      routeCoordinates as [number, number][],
    );
    // Keep waypoints that are ahead of the rider on the route
    return wpIndex > riderIndex;
  });
};

/**
 * Build a reroute request from the current navigation state.
 *
 * When `routeCoordinates` is provided and the request has waypoints,
 * already-passed waypoints are stripped so the reroute only includes
 * remaining stops.
 */
export const buildRerouteRequest = (
  request: RoutePreviewRequest,
  activeRouteId?: string,
  currentOrigin: Coordinate = request.origin,
  routeCoordinates?: readonly [number, number][],
): RerouteRequest => {
  const remainingWaypoints =
    request.waypoints && request.waypoints.length > 0 && routeCoordinates
      ? stripPassedWaypoints(request.waypoints, currentOrigin, routeCoordinates)
      : request.waypoints;

  return {
    ...request,
    origin: currentOrigin,
    startOverride: undefined,
    waypoints: remainingWaypoints,
    activeRouteId,
  };
};
