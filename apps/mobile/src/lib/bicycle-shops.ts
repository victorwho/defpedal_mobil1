import type { Coordinate } from '@defensivepedal/core';

export interface BikeShopLocation {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly name?: string;
  readonly repairService?: boolean;
  readonly rentalService?: boolean;
}

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const BBOX_PADDING_DEG = 0.005;
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
): { south: number; west: number; north: number; east: number } => ({
  south: Math.min(origin.lat, destination.lat) - BBOX_PADDING_DEG,
  north: Math.max(origin.lat, destination.lat) + BBOX_PADDING_DEG,
  west: Math.min(origin.lon, destination.lon) - BBOX_PADDING_DEG,
  east: Math.max(origin.lon, destination.lon) + BBOX_PADDING_DEG,
});

const parseElement = (element: OverpassElement): BikeShopLocation => ({
  id: `osm-shop-${element.id}`,
  lat: element.lat,
  lon: element.lon,
  name: element.tags?.name ?? undefined,
  repairService: element.tags?.['service:bicycle:repair'] === 'yes',
  rentalService: element.tags?.['service:bicycle:rental'] === 'yes',
});

/**
 * Fetch bicycle shops and repair stations from OpenStreetMap via Overpass.
 * Queries: shop=bicycle OR craft=bicycle OR amenity=bicycle_repair_station.
 * Fails gracefully — returns empty array on error or rate limit.
 */
export const fetchBikeShopsNearRoute = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<BikeShopLocation[]> => {
  try {
    const bbox = computeBbox(origin, destination);
    const query = `[out:json][timeout:10];(node["shop"="bicycle"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});node["craft"="bicycle"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});node["amenity"="bicycle_repair_station"](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out body;`;

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
