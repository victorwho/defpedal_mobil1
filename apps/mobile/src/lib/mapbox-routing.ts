/**
 * Direct routing integration:
 * - **Safe mode**: Custom OSRM server at osrm.defensivepedal.com
 * - **Fast mode**: Mapbox Directions API v5
 *
 * Maps OSRM / Mapbox Directions responses to the app's RoutePreviewResponse.
 */
import type {
  Coordinate,
  CoverageRegion,
  NavigationStep,
  RerouteRequest,
  RouteOption,
  RoutePreviewRequest,
  RoutePreviewResponse,
} from '@defensivepedal/core';
import { encodePolyline } from '@defensivepedal/core';
import type { RouteResponse, Route, Step } from '@defensivepedal/core';

import { mobileEnv } from './env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSRM_API_BASE = 'https://osrm.defensivepedal.com/route/v1/bicycle';
const MAPBOX_DIRECTIONS_BASE =
  'https://api.mapbox.com/directions/v5/mapbox/cycling';
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fetchWithTimeout = async (
  url: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Route request timed out after ${timeoutMs / 1000}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const generateRouteId = (source: 'custom_osrm' | 'mapbox', index: number): string =>
  `${source}-${Date.now()}-${index}`;

/**
 * Map an OSRM/Mapbox step to our NavigationStep.
 */
const mapStep = (step: Step, index: number): NavigationStep => ({
  id: `step-${index}`,
  instruction:
    step.maneuver.type === 'depart'
      ? `Head ${step.maneuver.modifier ?? 'straight'} on ${step.name || 'the road'}`
      : step.maneuver.type === 'arrive'
        ? 'Arrive at your destination'
        : `${capitalizeFirst(step.maneuver.modifier ?? step.maneuver.type)} onto ${step.name || 'the road'}`,
  streetName: step.name || '',
  distanceMeters: step.distance,
  durationSeconds: step.duration,
  maneuver: step.maneuver,
  geometry: step.geometry,
  mode: step.mode,
});

const capitalizeFirst = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Map an OSRM/Mapbox route to our RouteOption.
 */
const mapRoute = (
  route: Route,
  source: 'custom_osrm' | 'mapbox',
  index: number,
): RouteOption => {
  const allSteps = route.legs.flatMap((leg) => leg.steps);

  return {
    id: generateRouteId(source, index),
    source,
    routingEngineVersion: source === 'custom_osrm' ? 'safe-osrm-v1' : 'mapbox-directions-v5',
    routingProfileVersion: source === 'custom_osrm' ? 'safety-profile-v1' : 'mapbox-cycling-v1',
    mapDataVersion: source === 'custom_osrm' ? 'osm-current' : 'mapbox-current',
    riskModelVersion: source === 'custom_osrm' ? 'risk-model-v1' : 'none',
    geometryPolyline6: encodePolyline(route.geometry.coordinates),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    adjustedDurationSeconds: route.duration,
    totalClimbMeters: null,
    steps: allSteps.map(mapStep),
    riskSegments: [],
    warnings: [],
  };
};

// ---------------------------------------------------------------------------
// Fetch routes from OSRM (safe mode)
// ---------------------------------------------------------------------------

const fetchOsrmRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
  avoidUnpaved: boolean,
): Promise<Route[]> => {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  let url = `${OSRM_API_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true&annotations=true`;

  if (avoidUnpaved) {
    url += '&exclude=unpaved';
  }

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `OSRM routing failed (${response.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as RouteResponse;

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM returned no routes (code: ${data.code})`);
  }

  return data.routes;
};

// ---------------------------------------------------------------------------
// Fetch routes from Mapbox Directions (fast mode)
// ---------------------------------------------------------------------------

const fetchMapboxRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<Route[]> => {
  const token = mobileEnv.mapboxPublicToken;

  if (!token) {
    throw new Error('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not configured.');
  }

  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const params = new URLSearchParams({
    alternatives: 'true',
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    access_token: token,
  });

  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?${params.toString()}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Mapbox routing failed (${response.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as RouteResponse;

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`Mapbox returned no routes (code: ${data.code})`);
  }

  return data.routes;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const directPreviewRoute = async (
  request: RoutePreviewRequest,
): Promise<RoutePreviewResponse> => {
  const origin = request.startOverride ?? request.origin;
  const destination = request.destination;
  const mode = request.mode;

  const source: 'custom_osrm' | 'mapbox' =
    mode === 'safe' ? 'custom_osrm' : 'mapbox';

  const rawRoutes =
    mode === 'safe'
      ? await fetchOsrmRoutes(origin, destination, request.avoidUnpaved)
      : await fetchMapboxRoutes(origin, destination);

  const routes: RouteOption[] = rawRoutes.map((route, index) =>
    mapRoute(route, source, index),
  );

  const coverage: CoverageRegion = {
    countryCode: request.countryHint?.toUpperCase() ?? 'UNKNOWN',
    status: 'supported',
    safeRouting: true,
    fastRouting: true,
  };

  return {
    routes,
    selectedMode: mode,
    coverage,
    generatedAt: new Date().toISOString(),
  };
};

export const directReroute = async (
  request: RerouteRequest,
): Promise<RoutePreviewResponse> => {
  // Reroute uses the same logic as preview
  return directPreviewRoute(request);
};
