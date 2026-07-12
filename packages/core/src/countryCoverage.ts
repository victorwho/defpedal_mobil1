import type { Coordinate } from './contracts';

/**
 * Countries covered by the EU-wide OSRM safety-routing deployment
 * (2026-07-12: single unified graph on osrm.defensivepedal.com +
 * osrm-flat.defensivepedal.com covering EU-27 + EEA + CH — verified by
 * probing Berlin/Paris/Madrid/Stockholm/Reykjavik/Nicosia plus a
 * Vienna→Bratislava cross-border route). Because every country lives in ONE
 * graph, cross-border rides are now routable; the per-country server split
 * (osrm-es.*) is retired.
 *
 * This list must stay in sync with `SUPPORTED_APP_COUNTRIES` in
 * `appAvailability.ts` (the onboarding region gate) — a test enforces it.
 */
export type SupportedCountry =
  | 'AT' | 'BE' | 'BG' | 'HR' | 'CY' | 'CZ' | 'DK' | 'EE' | 'FI' | 'FR'
  | 'DE' | 'GR' | 'HU' | 'IE' | 'IT' | 'LV' | 'LT' | 'LU' | 'MT' | 'NL'
  | 'PL' | 'PT' | 'RO' | 'SK' | 'SI' | 'ES' | 'SE'
  | 'IS' | 'LI' | 'NO' | 'CH';

/** Axis-aligned bounding box: [minLon, minLat, maxLon, maxLat]. */
type Bbox = readonly [number, number, number, number];

/**
 * Per-country coverage boxes, loose by ~0.05–0.1° to absorb GPS noise at the
 * borders. Notes:
 *
 * - Overlap between two SUPPORTED countries is harmless — everything
 *   dispatches to the same EU graph, attribution is cosmetic.
 * - Overlap into an UNSUPPORTED neighbor (e.g. the HR box covers most of
 *   Bosnia; the RO box clips Belgrade; the GR box clips the Turkish Aegean
 *   coast) makes the app OFFER safe routing there, and the OSRM graph
 *   answers such requests with a degenerate `Ok` + distance-0 route (probed
 *   2026-07-12). The zero-distance guard in the OSRM fetchers catches that
 *   and falls back to Mapbox, so a mis-hit degrades gracefully.
 * - The Canary Islands (~28°N, ~16°W) remain excluded — probed distance-0,
 *   no data in the graph. Same for the UK.
 */
const COUNTRY_BBOXES: Record<SupportedCountry, readonly Bbox[]> = {
  // RO + ES FIRST: `resolveCountryFromCoord` is first-match, and these two
  // are the only countries with `road_risk_data`-dependent features (the
  // safe-vs-fast comparison label gates on the attributed country). Their
  // boxes must win the overlap against loose neighbor boxes (HU/BG clip
  // western/southern Romania) or riders there silently lose the comparison.
  RO: [[20.26, 43.62, 29.74, 48.27]],
  // Mainland + Balearics. Canary Islands intentionally excluded (no data).
  ES: [[-9.40, 35.95, 4.33, 43.79]],
  AT: [[9.4, 46.3, 17.2, 49.1]],
  BE: [[2.5, 49.4, 6.5, 51.6]],
  BG: [[22.3, 41.2, 28.7, 44.3]],
  HR: [[13.3, 42.3, 19.5, 46.6]],
  CY: [[32.2, 34.5, 34.7, 35.8]],
  CZ: [[12.0, 48.5, 19.0, 51.1]],
  // Extended east to keep Bornholm inside the single box.
  DK: [[8.0, 54.5, 15.35, 57.8]],
  EE: [[21.6, 57.5, 28.3, 59.8]],
  FI: [[19.0, 59.6, 31.65, 70.2]],
  // Mainland + Corsica.
  FR: [[-5.2, 42.3, 8.3, 51.2], [8.5, 41.3, 9.6, 43.1]],
  DE: [[5.8, 47.2, 15.1, 55.15]],
  // Split so the box does NOT swallow the Turkish Aegean/Marmara coast
  // (Istanbul, Izmir — outside the graph, would degrade to dist-0 garbage):
  // mainland + western islands up to 26.7°E, then Crete + Dodecanese south
  // of 37°N. Samos/Kastellorizo fall through the gap — acceptable; they get
  // Mapbox fallback like any uncovered point.
  GR: [[19.3, 36.0, 26.7, 41.85], [23.0, 34.7, 28.35, 37.0]],
  HU: [[16.05, 45.7, 23.0, 48.6]],
  IE: [[-10.75, 51.3, -5.95, 55.45]],
  // Mainland + Sicily + Sardinia.
  IT: [[6.6, 36.6, 18.6, 47.1]],
  LV: [[20.9, 55.6, 28.3, 58.2]],
  LT: [[20.8, 53.85, 26.9, 56.5]],
  LU: [[5.7, 49.4, 6.6, 50.2]],
  MT: [[14.1, 35.7, 14.7, 36.1]],
  NL: [[3.3, 50.7, 7.3, 53.6]],
  PL: [[14.05, 49.0, 24.2, 55.0]],
  // Mainland only — Madeira / Azores not in the graph.
  PT: [[-9.6, 36.9, -6.1, 42.2]],
  SK: [[16.8, 47.7, 22.6, 49.7]],
  SI: [[13.3, 45.4, 16.7, 46.9]],
  SE: [[10.9, 55.2, 24.2, 69.2]],
  IS: [[-24.6, 63.2, -13.4, 66.6]],
  LI: [[9.4, 47.0, 9.7, 47.35]],
  // Mainland incl. Finnmark. Svalbard excluded.
  NO: [[4.5, 57.9, 31.3, 71.3]],
  CH: [[5.9, 45.75, 10.55, 47.9]],
};

/**
 * Mirror of the region-gate country list (`SUPPORTED_APP_COUNTRIES`).
 * Sync between the two is enforced by countryCoverage.test.ts — never by a
 * runtime throw, which would turn an editing slip into an app-launch crash.
 */
export const ROUTING_COVERED_COUNTRIES: readonly SupportedCountry[] = Object.keys(
  COUNTRY_BBOXES,
) as SupportedCountry[];

const isInBbox = (coord: Coordinate, bbox: Bbox): boolean => {
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
 * `null` when the point sits outside every supported bounding box (e.g. the
 * UK, Serbia, Canary Islands, mid-Atlantic, invalid coords).
 *
 * First match wins; where two supported countries' boxes overlap the
 * attribution is cosmetic (same EU graph either way).
 *
 * Sync + zero-network — safe to call on every render.
 */
export const resolveCountryFromCoord = (coord: Coordinate): SupportedCountry | null => {
  for (const country of ROUTING_COVERED_COUNTRIES) {
    for (const bbox of COUNTRY_BBOXES[country]) {
      if (isInBbox(coord, bbox)) {
        return country;
      }
    }
  }
  return null;
};

export type RouteSupport =
  | {
      readonly supported: true;
      /** Attribution of the ORIGIN — informational; dispatch is region-wide. */
      readonly country: SupportedCountry;
    }
  | {
      readonly supported: false;
      readonly originCountry: SupportedCountry | null;
      readonly destinationCountry: SupportedCountry | null;
      /**
       * - `origin_unsupported`: origin sits outside every supported bbox.
       * - `destination_unsupported`: origin is supported, destination is not.
       *
       * (`cross_border` no longer exists — the EU-wide graph routes across
       * borders; any two supported endpoints are a supported pair.)
       */
      readonly reason: 'origin_unsupported' | 'destination_unsupported';
    };

/**
 * Decide whether a safe/flat route can be served for an origin/destination
 * pair. Used by the routing dispatcher to gate the OSRM call, and by the UI
 * to gate the Safe/Flat mode pills and surface the appropriate notice.
 * Cross-border pairs are supported — the whole region is one OSRM graph.
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

  return { supported: true, country: originCountry };
};
