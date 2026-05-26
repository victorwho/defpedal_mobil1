import type { Coordinate } from './contracts';

/**
 * Countries with a dedicated OSRM safety profile deployed. Both endpoints of a
 * ride must resolve to the same country — OSRM data is partitioned per server
 * so a cross-border route cannot be computed by a single profile.
 */
export type SupportedCountry = 'RO' | 'ES';

/**
 * Axis-aligned bounding box: [minLon, minLat, maxLon, maxLat].
 *
 * - RO covers mainland Romania (Tulcea → Timișoara, Constanța → Maramureș).
 * - ES covers mainland Spain + Balearic Islands (Galicia → Catalonia,
 *   Andalusia → Cantabria, Mallorca / Ibiza / Menorca). The Canary Islands
 *   (~28°N, ~16°W) are intentionally excluded for v1 — no OSRM data shipped
 *   for that archipelago yet. Add a separate `'ES_IC'` entry when ready.
 *
 * Bboxes are loose by ~0.05° on every side to absorb GPS noise at the borders
 * without bleeding into a neighboring country's safety-routing surface.
 */
const COUNTRY_BBOXES: Record<SupportedCountry, readonly [number, number, number, number]> = {
  RO: [20.26, 43.62, 29.74, 48.27],
  ES: [-9.40, 35.95, 4.33, 43.79],
};

const isInBbox = (
  coord: Coordinate,
  bbox: readonly [number, number, number, number],
): boolean => {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return (
    coord.lon >= minLon &&
    coord.lon <= maxLon &&
    coord.lat >= minLat &&
    coord.lat <= maxLat
  );
};

/**
 * Pure, deterministic country resolution for a single coordinate. Returns
 * `null` when the point sits outside every supported bounding box (e.g. France,
 * Canary Islands, mid-Atlantic, invalid coords).
 *
 * Sync + zero-network — safe to call on every render.
 */
export const resolveCountryFromCoord = (coord: Coordinate): SupportedCountry | null => {
  for (const country of Object.keys(COUNTRY_BBOXES) as SupportedCountry[]) {
    if (isInBbox(coord, COUNTRY_BBOXES[country])) {
      return country;
    }
  }
  return null;
};

export type RouteSupport =
  | {
      readonly supported: true;
      readonly country: SupportedCountry;
    }
  | {
      readonly supported: false;
      readonly originCountry: SupportedCountry | null;
      readonly destinationCountry: SupportedCountry | null;
      /**
       * - `origin_unsupported`: origin sits outside every supported bbox.
       * - `destination_unsupported`: origin is supported, destination is not.
       * - `cross_border`: both endpoints supported but in different countries
       *   (OSRM data is per-country, so the ride cannot run on a single profile).
       */
      readonly reason: 'origin_unsupported' | 'destination_unsupported' | 'cross_border';
    };

/**
 * Decide whether a safe/flat route can be served for an origin/destination
 * pair. Used by the routing dispatcher to pick the right OSRM server, and by
 * the UI to gate the Safe/Flat mode pills and surface the appropriate notice.
 */
export const isRouteSupported = (
  origin: Coordinate,
  destination: Coordinate,
): RouteSupport => {
  const originCountry = resolveCountryFromCoord(origin);
  const destinationCountry = resolveCountryFromCoord(destination);

  if (originCountry === null) {
    return {
      supported: false,
      originCountry: null,
      destinationCountry,
      reason: 'origin_unsupported',
    };
  }

  if (destinationCountry === null) {
    return {
      supported: false,
      originCountry,
      destinationCountry: null,
      reason: 'destination_unsupported',
    };
  }

  if (originCountry !== destinationCountry) {
    return {
      supported: false,
      originCountry,
      destinationCountry,
      reason: 'cross_border',
    };
  }

  return { supported: true, country: originCountry };
};
