import type { Coordinate } from '@defensivepedal/core';

export interface BicycleRentalLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly operator?: string;
  readonly capacity?: number;
  readonly network?: string;
}

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const BBOX_PADDING_DEG = 0.005; // ~500m padding around route bounds
const REQUEST_TIMEOUT_MS = 10_000;

type OverpassElement = {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

const computeBbox = (
  origin: Coordinate,
  destination: Coordinate,
): { south: number; west: number; north: number; east: number } => {
  const south = Math.min(origin.lat, destination.lat) - BBOX_PADDING_DEG;
  const north = Math.max(origin.lat, destination.lat) + BBOX_PADDING_DEG;
  const west = Math.min(origin.lon, destination.lon) - BBOX_PADDING_DEG;
  const east = Math.max(origin.lon, destination.lon) + BBOX_PADDING_DEG;
  return { south, west, north, east };
};

/**
 * Check if an element is disused/abandoned and should be excluded.
 */
const isDisused = (tags?: Record<string, string>): boolean => {
  if (!tags) return false;
  return (
    tags['disused:amenity'] === 'bicycle_rental' ||
    tags['abandoned:amenity'] === 'bicycle_rental'
  );
};

const parseElement = (element: OverpassElement): BicycleRentalLocation => ({
  id: `osm-rental-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  operator: element.tags?.operator ?? undefined,
  capacity: element.tags?.capacity ? Number(element.tags.capacity) : undefined,
  network: element.tags?.network ?? undefined,
});

/**
 * Fetch bicycle rental locations from OpenStreetMap via the Overpass API.
 *
 * Matches:
 *   - amenity=bicycle_rental
 *   - bicycle_rental=docking_station
 *   - shop=bicycle + service:bicycle:rental=yes
 *
 * Excludes:
 *   - disused:amenity=bicycle_rental
 *   - abandoned:amenity=bicycle_rental
 *
 * Fails gracefully — returns an empty array on any error.
 */
export const fetchBicycleRentalNearRoute = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<BicycleRentalLocation[]> => {
  try {
    const bbox = computeBbox(origin, destination);
    const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    // Query for all three OSM patterns in one request
    const query = `[out:json][timeout:10];(node["amenity"="bicycle_rental"](${b});node["bicycle_rental"="docking_station"](${b});node["shop"="bicycle"]["service:bicycle:rental"="yes"](${b}););out body;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = (await response.json()) as OverpassResponse;

    return (data.elements ?? [])
      .filter(
        (el) =>
          el.type === 'node' &&
          typeof el.lat === 'number' &&
          typeof el.lon === 'number' &&
          !isDisused(el.tags),
      )
      .map(parseElement);
  } catch {
    return [];
  }
};
