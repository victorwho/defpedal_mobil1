import type { Coordinate } from '@defensivepedal/core';

export interface BicycleLaneSegment {
  readonly id: string;
  readonly coordinates: readonly [number, number][];
}

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const BBOX_PADDING_DEG = 0.005;
const REQUEST_TIMEOUT_MS = 15_000;

type OverpassWayElement = {
  type: 'way';
  id: number;
  geometry: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassWayElement[];
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
 * Fetch bicycle lane/path geometries from OpenStreetMap via Overpass API.
 * Covers: dedicated cycleways, on-road bike lanes, shared lanes, tracks, and
 * roads with bicycle=designated. Returns LineString coordinates.
 */
export const fetchBicycleLanesNearRoute = async (
  origin: Coordinate,
  destination: Coordinate,
): Promise<BicycleLaneSegment[]> => {
  try {
    const bbox = computeBbox(origin, destination);
    const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

    // Query all cycling infrastructure types
    const query = `[out:json][timeout:15];(
      way["highway"="cycleway"](${bboxStr});
      way["cycleway"="lane"](${bboxStr});
      way["cycleway"="track"](${bboxStr});
      way["cycleway"="shared_lane"](${bboxStr});
      way["cycleway:left"="lane"](${bboxStr});
      way["cycleway:right"="lane"](${bboxStr});
      way["cycleway:left"="track"](${bboxStr});
      way["cycleway:right"="track"](${bboxStr});
      way["bicycle"="designated"](${bboxStr});
    );out geom;`;

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
          el.type === 'way' &&
          Array.isArray(el.geometry) &&
          el.geometry.length >= 2,
      )
      .map((el) => ({
        id: `osm-way-${el.id}`,
        coordinates: el.geometry.map(
          (pt) => [pt.lon, pt.lat] as [number, number],
        ),
      }));
  } catch {
    return [];
  }
};
