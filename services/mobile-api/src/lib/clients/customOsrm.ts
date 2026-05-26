import type {
  Coordinate,
  RoutePreviewRequest,
  RouteResponse,
  SupportedCountry,
} from '@defensivepedal/core';
import { isRouteSupported } from '@defensivepedal/core';

import { config } from '../../config';

const buildCoordinates = (origin: Coordinate, destination: Coordinate) =>
  `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;

/**
 * Resolve the OSRM base URL for an origin/destination pair. Mirrors the
 * mobile-side dispatch in `apps/mobile/src/lib/mapbox-routing.ts` so server
 * and client land on the same server for the same ride.
 */
const resolveBaseUrl = (
  country: SupportedCountry,
  avoidHills: boolean,
): string => {
  if (country === 'ES') {
    return avoidHills ? config.safeOsrmEsFlatBaseUrl : config.safeOsrmEsBaseUrl;
  }
  return avoidHills ? config.safeOsrmFlatBaseUrl : config.safeOsrmBaseUrl;
};

export const fetchSafeRoutes = async (
  request: Pick<RoutePreviewRequest, 'avoidUnpaved' | 'avoidHills'> & {
    origin: Coordinate;
    destination: Coordinate;
  },
): Promise<RouteResponse> => {
  const support = isRouteSupported(request.origin, request.destination);
  if (support.supported !== true) {
    throw new Error(
      `Safe routing unavailable for this origin/destination pair (${support.reason}).`,
    );
  }

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

  const baseUrl = resolveBaseUrl(support.country, request.avoidHills);
  const url = `${baseUrl}/${buildCoordinates(
    request.origin,
    request.destination,
  )}?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Safe routing request failed with ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};
