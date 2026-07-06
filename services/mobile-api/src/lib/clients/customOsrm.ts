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

// Audit 2026-07-05 SCALE-4: OSRM is a single VM per country. An unbounded
// fetch turns one hung OSRM into Cloud Run worker pile-up (every request
// waits forever), browning out the whole API. Bound every attempt and retry
// once with jitter so a transient blip doesn't fail the preview.
const OSRM_TIMEOUT_MS = 8000;
const OSRM_RETRY_BASE_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const fetchOsrmWithRetry = async (url: string): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await sleep(OSRM_RETRY_BASE_DELAY_MS + Math.floor(Math.random() * OSRM_RETRY_BASE_DELAY_MS));
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
      // Retry 5xx (upstream hiccup); return 4xx immediately — retrying a bad
      // request can't succeed and just doubles OSRM load.
      if (response.status >= 500 && attempt === 0) {
        lastError = new Error(`Safe routing request failed with ${response.status}`);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Safe routing request failed (timeout).');
};

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

  const response = await fetchOsrmWithRetry(url);

  if (!response.ok) {
    throw new Error(`Safe routing request failed with ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};
