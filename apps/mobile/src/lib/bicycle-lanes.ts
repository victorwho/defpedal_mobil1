import type { Coordinate } from '@defensivepedal/core';

export interface BicycleLaneSegment {
  readonly id: string;
  readonly coordinates: readonly [number, number][];
}

/**
 * Merge segments that share endpoints into longer continuous lines.
 * This eliminates visual gaps between adjacent OSM ways.
 */
const mergeConnectedSegments = (
  segments: BicycleLaneSegment[],
): BicycleLaneSegment[] => {
  if (segments.length === 0) return [];

  const coordKey = (c: [number, number]) =>
    `${c[1].toFixed(6)},${c[0].toFixed(6)}`;

  // Build adjacency: endpoint → segment indices
  const endpointMap = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    const coords = seg.coordinates;
    if (coords.length < 2) return;
    const startKey = coordKey(coords[0] as [number, number]);
    const endKey = coordKey(coords[coords.length - 1] as [number, number]);
    if (!endpointMap.has(startKey)) endpointMap.set(startKey, []);
    endpointMap.get(startKey)!.push(i);
    if (startKey !== endKey) {
      if (!endpointMap.has(endKey)) endpointMap.set(endKey, []);
      endpointMap.get(endKey)!.push(i);
    }
  });

  const used = new Set<number>();
  const merged: BicycleLaneSegment[] = [];
  let mergeId = 0;

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    let chain = [...segments[i].coordinates] as [number, number][];

    // Extend forward
    let extended = true;
    while (extended) {
      extended = false;
      const tailKey = coordKey(chain[chain.length - 1]);
      const neighbors = endpointMap.get(tailKey) ?? [];
      for (const ni of neighbors) {
        if (used.has(ni)) continue;
        const nCoords = segments[ni].coordinates;
        const nStart = coordKey(nCoords[0] as [number, number]);
        const nEnd = coordKey(nCoords[nCoords.length - 1] as [number, number]);
        if (nStart === tailKey) {
          chain = [...chain, ...(nCoords.slice(1) as [number, number][])];
          used.add(ni);
          extended = true;
          break;
        } else if (nEnd === tailKey) {
          chain = [
            ...chain,
            ...([...nCoords].reverse().slice(1) as [number, number][]),
          ];
          used.add(ni);
          extended = true;
          break;
        }
      }
    }

    merged.push({ id: `merged-${mergeId++}`, coordinates: chain });
  }

  return merged;
};

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

    const rawSegments = (data.elements ?? [])
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

    return mergeConnectedSegments(rawSegments);
  } catch {
    return [];
  }
};
