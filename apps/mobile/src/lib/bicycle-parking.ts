import type { Coordinate } from '@defensivepedal/core';

export interface BicycleParkingLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly capacity?: number;
  readonly covered?: boolean;
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

const parseElement = (element: OverpassElement): BicycleParkingLocation => ({
  id: `osm-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  capacity: element.tags?.capacity ? Number(element.tags.capacity) : undefined,
  covered: element.tags?.covered === 'yes' ? true : element.tags?.covered === 'no' ? false : undefined,
});

/**
 * Fetch bicycle parking locations from OpenStreetMap via the Overpass API.
 * Returns locations within a bounding box around the route.
 * Fails gracefully — returns an empty array on any error.
 */
export const fetchBicycleParkingNearRoute = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<BicycleParkingLocation[]> => {
  try {
    const bbox = computeBbox(origin, destination);
    const query = `[out:json][timeout:10];node["amenity"="bicycle_parking"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out body;`;

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
      .filter((el) => el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number')
      .map(parseElement);
  } catch {
    return [];
  }
};
