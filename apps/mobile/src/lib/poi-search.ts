import type { Coordinate } from '@defensivepedal/core';
import { mobileEnv } from './env';

export interface SearchedPoi {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
  readonly category: string;
  readonly address?: string;
  readonly website?: string;
}

type PoiCategory = 'hydration' | 'repair' | 'restroom' | 'bikeRental' | 'bikeParking' | 'supplies';

// Mapbox Search Box category → our POI category mapping
const CATEGORY_QUERIES: Record<PoiCategory, string[]> = {
  hydration: ['fountain', 'cafe', 'coffee_shop'],
  repair: [], // Handled by Overpass API
  restroom: [], // Mapbox has no public restroom category
  bikeRental: [], // Handled by Overpass API
  bikeParking: [], // Handled by Overpass API
  supplies: ['convenience_store', 'supermarket', 'grocery'],
};

const REQUEST_TIMEOUT_MS = 8_000;

const fetchCategoryPois = async (
  mapboxCategory: string,
  proximity: Coordinate,
  limit: number,
): Promise<SearchedPoi[]> => {
  const token = mobileEnv.mapboxPublicToken;
  if (!token) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const url = `https://api.mapbox.com/search/searchbox/v1/category/${mapboxCategory}?proximity=${proximity.lon},${proximity.lat}&limit=${limit}&access_token=${token}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    const features = data?.features ?? [];

    return features.map((f: any) => ({
      id: `mbx-${f.properties?.mapbox_id ?? Math.random().toString(36).slice(2)}`,
      lat: f.geometry?.coordinates?.[1] ?? 0,
      lon: f.geometry?.coordinates?.[0] ?? 0,
      name: f.properties?.name ?? 'Unknown',
      category: mapboxCategory,
      address: f.properties?.place_formatted ?? f.properties?.full_address ?? undefined,
      website: f.properties?.metadata?.website ?? undefined,
    }));
  } catch {
    return [];
  }
};

/**
 * Fetch POIs for a given app category near one or two locations.
 * Deduplicates results by name+coordinates.
 * Returns empty array if the category has no Mapbox Search queries.
 */
export const fetchPoiSearchResults = async (
  category: PoiCategory,
  origin: Coordinate | null,
  destination: Coordinate | null,
): Promise<SearchedPoi[]> => {
  const queries = CATEGORY_QUERIES[category];
  if (queries.length === 0) return [];

  const locations = [origin, destination].filter(
    (loc): loc is Coordinate => loc !== null && loc.lat !== 0 && loc.lon !== 0,
  );
  if (locations.length === 0) return [];

  const promises: Promise<SearchedPoi[]>[] = [];
  for (const loc of locations) {
    for (const q of queries) {
      promises.push(fetchCategoryPois(q, loc, 10));
    }
  }

  const results = await Promise.all(promises);
  const all = results.flat();

  // Deduplicate by rounding coordinates to ~10m precision
  const seen = new Set<string>();
  return all.filter((poi) => {
    const key = `${poi.name}-${poi.lat.toFixed(4)}-${poi.lon.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
