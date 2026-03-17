import type {
  Coordinate,
  RoutePreviewRequest,
  RouteResponse,
} from '@defensivepedal/core';

import { config } from '../../config';

const buildCoordinates = (origin: Coordinate, destination: Coordinate) =>
  `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

export const fetchSafeRoutes = async (
  request: Pick<RoutePreviewRequest, 'avoidUnpaved'> & {
    origin: Coordinate;
    destination: Coordinate;
  },
): Promise<RouteResponse> => {
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    alternatives: 'true',
    annotations: 'true',
  });

  if (request.avoidUnpaved) {
    params.set('exclude', 'unpaved');
  }

  const url = `${config.safeOsrmBaseUrl}/${buildCoordinates(
    request.origin,
    request.destination,
  )}?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Safe routing request failed with ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};
