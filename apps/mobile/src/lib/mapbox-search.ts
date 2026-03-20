/**
 * Direct Mapbox API integration for search, reverse-geocode, and coverage.
 *
 * - Autocomplete uses the **Search Box API v1** (`/search/searchbox/v1/suggest` + `/retrieve`)
 *   which supports POI, address, place, locality, and neighborhood types.
 * - Reverse geocode uses **Geocoding API v6** (`/search/geocode/v6/reverse`).
 * - Coverage uses a local country allowlist (no external API call).
 */
import type {
  AutocompleteRequest,
  AutocompleteResponse,
  AutocompleteSuggestion,
  Coordinate,
  CoverageRegion,
  CoverageResponse,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  SuggestionFeatureType,
} from '@defensivepedal/core';

import { mobileEnv } from './env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAPBOX_SEARCHBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';
const MAPBOX_GEOCODING_BASE = 'https://api.mapbox.com/search/geocode/v6';
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_QUERY_LENGTH = 2;

/**
 * Countries where Pedala Defensiva provides safe-routing coverage.
 * Extend this set as new regions are added.
 */
const SUPPORTED_COUNTRIES: ReadonlySet<string> = new Set(['BR', 'RO']);

// ---------------------------------------------------------------------------
// Mapbox Search Box API v1 response types
// ---------------------------------------------------------------------------

interface SearchBoxSuggestion {
  mapbox_id: string;
  name: string;
  name_preferred?: string;
  full_address?: string;
  place_formatted?: string;
  feature_type: string;
  context?: {
    country?: { name?: string; country_code?: string; country_code_alpha_3?: string };
    region?: { name?: string };
    place?: { name?: string };
    locality?: { name?: string };
    neighborhood?: { name?: string };
    postcode?: { name?: string };
    address?: { name?: string; street_name?: string; address_number?: string };
  };
  /** POI Maki icon name. */
  maki?: string;
  /** POI category labels (e.g. ["restaurant", "food"]). */
  poi_category?: string[];
  poi_category_ids?: string[];
  distance?: number;
}

interface SearchBoxSuggestResponse {
  suggestions: SearchBoxSuggestion[];
  attribution?: string;
}

interface SearchBoxRetrieveFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [longitude: number, latitude: number];
  };
  properties: {
    mapbox_id: string;
    name: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    maki?: string;
    poi_category?: string[];
    context?: SearchBoxSuggestion['context'];
  };
}

interface SearchBoxRetrieveResponse {
  type: 'FeatureCollection';
  features: SearchBoxRetrieveFeature[];
}

// ---------------------------------------------------------------------------
// Mapbox Geocoding v6 response types (for reverse geocode & coverage)
// ---------------------------------------------------------------------------

interface MapboxGeocodeContext {
  country?: {
    name?: string;
    country_code?: string;
    country_code_alpha_3?: string;
  };
  region?: { name?: string };
  place?: { name?: string };
  locality?: { name?: string };
  neighborhood?: { name?: string };
  postcode?: { name?: string };
  address?: { name?: string; street_name?: string; address_number?: string };
}

interface MapboxGeocodeProperties {
  mapbox_id: string;
  name?: string;
  name_preferred?: string;
  full_address?: string;
  place_formatted?: string;
  context?: MapboxGeocodeContext;
  feature_type?: string;
}

interface MapboxGeocodeFeature {
  id: string;
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [longitude: number, latitude: number];
  };
  properties: MapboxGeocodeProperties;
}

interface MapboxGeocodeV6Response {
  type: 'FeatureCollection';
  features: MapboxGeocodeFeature[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureMapboxToken = (): string => {
  const token = mobileEnv.mapboxPublicToken;

  if (!token) {
    throw new Error(
      'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is not configured. Set it before using Mapbox search.',
    );
  }

  return token;
};

const haversineDistanceMeters = (a: Coordinate, b: Coordinate): number => {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLon * sinDLon;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const VALID_FEATURE_TYPES: ReadonlySet<string> = new Set([
  'poi',
  'address',
  'place',
  'locality',
  'neighborhood',
  'street',
]);

const toFeatureType = (raw: string | undefined): SuggestionFeatureType => {
  if (!raw) return 'unknown';
  if (raw === 'street') return 'address';
  return VALID_FEATURE_TYPES.has(raw)
    ? (raw as SuggestionFeatureType)
    : 'unknown';
};

const extractCategory = (
  poiCategory?: string[],
  maki?: string,
): string | undefined => {
  const cat = poiCategory?.[0] ?? maki;
  return cat ?? undefined;
};

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
      throw new Error(`Mapbox request timed out after ${timeoutMs / 1000}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

// ---------------------------------------------------------------------------
// Session token for Search Box API
// ---------------------------------------------------------------------------

let _sessionToken: string | null = null;
let _sessionTokenCreatedAt = 0;
const SESSION_TOKEN_TTL_MS = 60_000; // refresh every 60s

const getSessionToken = (): string => {
  const now = Date.now();

  if (_sessionToken && now - _sessionTokenCreatedAt < SESSION_TOKEN_TTL_MS) {
    return _sessionToken;
  }

  // Generate a UUID v4-like token
  _sessionToken = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    },
  );
  _sessionTokenCreatedAt = now;

  return _sessionToken;
};

// ---------------------------------------------------------------------------
// Autocomplete (Search Box API v1 — suggest + retrieve)
// ---------------------------------------------------------------------------

export const mapboxAutocomplete = async (
  payload: AutocompleteRequest,
): Promise<AutocompleteResponse> => {
  const query = payload.query.trim();

  if (query.length < MIN_QUERY_LENGTH) {
    return { suggestions: [], generatedAt: new Date().toISOString() };
  }

  const token = ensureMapboxToken();
  const sessionToken = getSessionToken();
  const limit = Math.min(payload.limit ?? 5, 10);

  // Step 1: Suggest
  const suggestParams = new URLSearchParams({
    q: query,
    access_token: token,
    session_token: sessionToken,
    types: 'poi,address,place,street,locality,neighborhood',
    limit: String(limit),
  });

  if (payload.proximity) {
    suggestParams.set(
      'proximity',
      `${payload.proximity.lon},${payload.proximity.lat}`,
    );
  }

  if (payload.locale) {
    suggestParams.set('language', payload.locale);
  }

  if (payload.countryHint) {
    suggestParams.set('country', payload.countryHint.toUpperCase());
  }

  const suggestUrl = `${MAPBOX_SEARCHBOX_BASE}/suggest?${suggestParams.toString()}`;
  const suggestResponse = await fetchWithTimeout(suggestUrl);

  if (!suggestResponse.ok) {
    const errorText = await suggestResponse.text().catch(() => '');
    throw new Error(
      `Mapbox search failed (${suggestResponse.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const suggestData =
    (await suggestResponse.json()) as SearchBoxSuggestResponse;
  const rawSuggestions = suggestData.suggestions ?? [];

  if (rawSuggestions.length === 0) {
    return { suggestions: [], generatedAt: new Date().toISOString() };
  }

  // Step 2: Retrieve coordinates for each suggestion
  // The retrieve endpoint fetches full details (incl. geometry) for a mapbox_id
  const suggestions: AutocompleteSuggestion[] = [];

  // Batch retrieve — one call per suggestion (Search Box API requires individual retrieves)
  const retrievePromises = rawSuggestions.map(async (raw) => {
    const retrieveParams = new URLSearchParams({
      access_token: token,
      session_token: sessionToken,
    });

    const retrieveUrl = `${MAPBOX_SEARCHBOX_BASE}/retrieve/${raw.mapbox_id}?${retrieveParams.toString()}`;

    try {
      const retrieveResponse = await fetchWithTimeout(retrieveUrl, 5_000);

      if (!retrieveResponse.ok) return null;

      const retrieveData =
        (await retrieveResponse.json()) as SearchBoxRetrieveResponse;
      const feature = retrieveData.features?.[0];

      if (!feature?.geometry?.coordinates) return null;

      const coords: Coordinate = {
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
      };

      const primaryText = raw.name_preferred ?? raw.name ?? query;
      const label =
        raw.full_address ?? raw.place_formatted ?? primaryText;
      const featureType = toFeatureType(raw.feature_type);
      const category = extractCategory(raw.poi_category, raw.maki);

      const suggestion: AutocompleteSuggestion = {
        id: raw.mapbox_id,
        label,
        primaryText,
        coordinates: coords,
        featureType,
        ...(category ? { category } : {}),
      };

      if (payload.proximity) {
        suggestion.distanceMeters = Math.round(
          haversineDistanceMeters(payload.proximity, coords),
        );
      }

      return suggestion;
    } catch {
      // Individual retrieve failed — skip this suggestion
      return null;
    }
  });

  const results = await Promise.all(retrievePromises);

  for (const result of results) {
    if (result) {
      suggestions.push(result);
    }
  }

  return {
    suggestions,
    generatedAt: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Reverse Geocode (Geocoding API v6)
// ---------------------------------------------------------------------------

export const mapboxReverseGeocode = async (
  payload: ReverseGeocodeRequest,
): Promise<ReverseGeocodeResponse> => {
  const { coordinate } = payload;

  if (
    coordinate.lat < -90 ||
    coordinate.lat > 90 ||
    coordinate.lon < -180 ||
    coordinate.lon > 180
  ) {
    throw new Error(
      `Invalid coordinates: lat=${coordinate.lat}, lon=${coordinate.lon}`,
    );
  }

  const token = ensureMapboxToken();
  const params = new URLSearchParams({
    longitude: String(coordinate.lon),
    latitude: String(coordinate.lat),
    access_token: token,
    types: 'address,street,place,locality',
    limit: '1',
  });

  if (payload.locale) {
    params.set('language', payload.locale);
  }

  if (payload.countryHint) {
    params.set('country', payload.countryHint.toUpperCase());
  }

  const url = `${MAPBOX_GEOCODING_BASE}/reverse?${params.toString()}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Mapbox reverse geocoding failed (${response.status}): ${errorText || 'Unknown error'}`,
    );
  }

  const data = (await response.json()) as MapboxGeocodeV6Response;
  const firstFeature = data.features?.[0];

  return {
    coordinate,
    label: firstFeature?.properties.full_address ??
      firstFeature?.properties.name ??
      null,
  };
};

// ---------------------------------------------------------------------------
// Coverage Check
// ---------------------------------------------------------------------------

/**
 * Resolves the country code for a given location.
 * Uses the provided hint or falls back to a reverse-geocode lookup.
 */
const resolveCountryCode = async (
  lat: number,
  lon: number,
  countryHint?: string,
): Promise<string | null> => {
  if (countryHint) {
    return countryHint.toUpperCase();
  }

  // Fall back to a lightweight reverse-geocode to determine country
  const token = ensureMapboxToken();
  const params = new URLSearchParams({
    longitude: String(lon),
    latitude: String(lat),
    access_token: token,
    types: 'country',
    limit: '1',
  });

  const url = `${MAPBOX_GEOCODING_BASE}/reverse?${params.toString()}`;
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as MapboxGeocodeV6Response;
  const feature = data.features?.[0];

  return (
    feature?.properties.context?.country?.country_code?.toUpperCase() ?? null
  );
};

export const mapboxGetCoverage = async (
  lat: number,
  lon: number,
  countryHint?: string,
): Promise<CoverageResponse> => {
  const countryCode = await resolveCountryCode(lat, lon, countryHint);
  const isSupported = countryCode !== null && SUPPORTED_COUNTRIES.has(countryCode);

  const region: CoverageRegion = {
    countryCode: countryCode ?? 'UNKNOWN',
    status: isSupported ? 'supported' : 'unsupported',
    safeRouting: isSupported,
    fastRouting: isSupported,
  };

  return {
    regions: [region],
    matched: region,
    generatedAt: new Date().toISOString(),
  };
};
