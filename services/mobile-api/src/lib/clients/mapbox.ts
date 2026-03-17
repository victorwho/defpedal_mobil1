import type {
  AutocompleteRequest,
  AutocompleteSuggestion,
  Coordinate,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  RouteResponse,
} from '@defensivepedal/core';

import { config } from '../../config';

const ensureMapboxConfigured = () => {
  if (!config.mapboxAccessToken) {
    throw new Error('MAPBOX_ACCESS_TOKEN is required for Mapbox-backed operations.');
  }
};

const buildCountry = (countryHint?: string) => countryHint?.toLowerCase();

export const fetchFastRoutes = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteResponse> => {
  ensureMapboxConfigured();

  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const params = new URLSearchParams({
    alternatives: 'true',
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    access_token: config.mapboxAccessToken,
  });

  const url = `${config.mapboxDirectionsBaseUrl}/${coordinates}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox directions request failed with ${response.status}`);
  }

  return (await response.json()) as RouteResponse;
};

export const forwardGeocode = async (
  request: AutocompleteRequest,
): Promise<AutocompleteSuggestion[]> => {
  ensureMapboxConfigured();

  const params = new URLSearchParams({
    access_token: config.mapboxAccessToken,
    autocomplete: 'true',
    limit: String(request.limit ?? 5),
    language: request.locale ?? 'en',
    types: 'address,poi,place,locality,neighborhood',
  });

  const country = buildCountry(request.countryHint);
  if (country) {
    params.set('country', country);
  }

  if (request.proximity) {
    params.set('proximity', `${request.proximity.lon},${request.proximity.lat}`);
  }

  const url = `${config.mapboxGeocodingBaseUrl}/${encodeURIComponent(
    request.query,
  )}.json?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox geocoding request failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    features?: Array<{
      id: string;
      place_name: string;
      text?: string;
      center: [number, number];
    }>;
  };

  return (data.features ?? []).map((feature) => ({
    id: feature.id,
    label: feature.place_name,
    primaryText: feature.text ?? feature.place_name,
    coordinates: {
      lon: feature.center[0],
      lat: feature.center[1],
    },
  }));
};

export const reverseGeocode = async (
  request: ReverseGeocodeRequest,
): Promise<ReverseGeocodeResponse> => {
  ensureMapboxConfigured();

  const params = new URLSearchParams({
    access_token: config.mapboxAccessToken,
    limit: '1',
    types: 'address,poi,place,locality,neighborhood',
    language: request.locale ?? 'en',
  });

  const country = buildCountry(request.countryHint);
  if (country) {
    params.set('country', country);
  }

  const url = `${config.mapboxGeocodingBaseUrl}/${request.coordinate.lon},${request.coordinate.lat}.json?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox reverse-geocoding request failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    features?: Array<{
      place_name: string;
    }>;
  };

  return {
    coordinate: request.coordinate,
    label: data.features?.[0]?.place_name ?? null,
  };
};
