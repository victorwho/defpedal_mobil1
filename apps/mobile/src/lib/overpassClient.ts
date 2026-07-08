import type { Coordinate } from '@defensivepedal/core';

/**
 * Shared Overpass point-query client (audit 2026-07-05 QUAL-2).
 *
 * bicycle-parking.ts / bicycle-rental.ts / bicycle-shops.ts were ~90%
 * identical (same bbox math, same OSM endpoint, same POST/timeout/parse/
 * error-handling flow) — only the Overpass tag filter and the per-domain
 * element parser differed. This factory owns the shared flow; each caller
 * supplies just those two pieces and keeps its own exported name/signature/
 * result type, so no call sites change.
 */

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const BBOX_PADDING_DEG = 0.005; // ~500m padding around route bounds
const REQUEST_TIMEOUT_MS = 10_000;

export type OverpassElement = {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements: OverpassElement[];
};

export interface OverpassBbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const computeOverpassBbox = (
  origin: Coordinate,
  destination: Coordinate,
): OverpassBbox => ({
  south: Math.min(origin.lat, destination.lat) - BBOX_PADDING_DEG,
  north: Math.max(origin.lat, destination.lat) + BBOX_PADDING_DEG,
  west: Math.min(origin.lon, destination.lon) - BBOX_PADDING_DEG,
  east: Math.max(origin.lon, destination.lon) + BBOX_PADDING_DEG,
});

export interface OverpassPointClientConfig<T> {
  /** Build the Overpass QL query body given the padded bbox. */
  readonly buildQuery: (bbox: OverpassBbox) => string;
  /** Map a valid node element to the domain result type. */
  readonly parseElement: (element: OverpassElement) => T;
  /** Optional extra per-element filter (e.g. exclude disused). */
  readonly filterElement?: (element: OverpassElement) => boolean;
}

/**
 * Build a route-scoped Overpass fetcher. The returned function fails
 * gracefully — it resolves to `[]` on any network error, non-OK response,
 * timeout, or malformed body.
 */
export const createOverpassPointClient = <T>(
  config: OverpassPointClientConfig<T>,
): ((origin: Coordinate, destination: Coordinate) => Promise<T[]>) => {
  return async (origin, destination) => {
    try {
      const bbox = computeOverpassBbox(origin, destination);
      const query = config.buildQuery(bbox);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(OVERPASS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) return [];

      const data = (await response.json()) as OverpassResponse;

      return (data.elements ?? [])
        .filter(
          (el) =>
            el.type === 'node' &&
            typeof el.lat === 'number' &&
            typeof el.lon === 'number' &&
            (config.filterElement ? config.filterElement(el) : true),
        )
        .map(config.parseElement);
    } catch {
      return [];
    }
  };
};
