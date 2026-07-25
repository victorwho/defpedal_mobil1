import type { Coordinate, RerouteRequest, RoutePreviewRequest } from './contracts';
import { findClosestPointIndex, haversineDistance } from './distance';
import { decodePolyline } from './polyline';

export const hasStartOverride = (
  request: Pick<RoutePreviewRequest, 'startOverride'>,
): boolean => Boolean(request.startOverride);

export const getPreviewOrigin = (
  request: Pick<RoutePreviewRequest, 'origin' | 'startOverride'>,
): Coordinate => request.startOverride ?? request.origin;

/**
 * Routers snap the requested endpoints onto the road network, so a route's
 * first/last vertex sits some distance from the raw request coordinates.
 * 250 m comfortably covers real snap distances while still discriminating a
 * genuinely different start (a custom start within 250 m of the rider renders
 * near-identically anyway, so a false "match" there is harmless).
 */
const ENDPOINT_MATCH_TOLERANCE_METERS = 250;

/**
 * Whether an already-calculated route still connects the given endpoints.
 *
 * Used by route-preview to decide if the stored preview belongs to the
 * current request: after the rider changes the start (e.g. clears a custom
 * start back to "current location"), the stored route still runs from the
 * OLD start and must not be drawn or centered on while the fresh calculation
 * is in flight. Same-endpoint refetches (mode/hill cycling) keep showing the
 * previous route on purpose — this returns true for those.
 *
 * Degenerate geometry (fewer than 2 vertices) fails OPEN (returns true):
 * suppression is cosmetic, and hiding a route we can't measure would turn a
 * decode hiccup into a blank map.
 */
export const routeMatchesEndpoints = (
  geometryPolyline6: string,
  origin: Coordinate,
  destination: Coordinate,
  toleranceMeters: number = ENDPOINT_MATCH_TOLERANCE_METERS,
): boolean => {
  const coordinates = decodePolyline(geometryPolyline6);
  if (coordinates.length < 2) return true;

  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;

  // decodePolyline yields [lon, lat] (GeoJSON order); haversineDistance
  // expects [lat, lon].
  const startDistance = haversineDistance(
    [first[1], first[0]],
    [origin.lat, origin.lon],
  );
  const endDistance = haversineDistance(
    [last[1], last[0]],
    [destination.lat, destination.lon],
  );

  return startDistance <= toleranceMeters && endDistance <= toleranceMeters;
};

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
