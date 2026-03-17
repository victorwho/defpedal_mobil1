import type { Coordinate, RerouteRequest, RoutePreviewRequest } from './contracts';

export const hasStartOverride = (
  request: Pick<RoutePreviewRequest, 'startOverride'>,
): boolean => Boolean(request.startOverride);

export const getPreviewOrigin = (
  request: Pick<RoutePreviewRequest, 'origin' | 'startOverride'>,
): Coordinate => request.startOverride ?? request.origin;

export const buildRerouteRequest = (
  request: RoutePreviewRequest,
  activeRouteId?: string,
  currentOrigin: Coordinate = request.origin,
): RerouteRequest => ({
  ...request,
  origin: currentOrigin,
  startOverride: undefined,
  activeRouteId,
});
