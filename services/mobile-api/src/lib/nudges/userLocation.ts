/**
 * Per-user lat/lon resolver for the nudge cron.
 *
 * Picks the best available signal:
 *   1. Most recent trip start coordinate from `trips.start_lat` /
 *      `start_lon` (set on every ride start)
 *   2. Fallback static: Bucharest (the launch city). Riders without any
 *      saved trips fall here, which is acceptable because they're new
 *      anyway and the streak system only fires on day >= 4.
 *
 * Cached per-process for the cron run so we don't hit the DB once per
 * eligible user.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface CacheEntry {
  readonly lat: number;
  readonly lon: number;
  readonly fetchedAt: number;
}

const LOCATION_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const FALLBACK_LAT = 44.43; // Bucharest, Romania
const FALLBACK_LON = 26.10;

export interface UserLocation {
  readonly lat: number;
  readonly lon: number;
  /** True when we returned the static fallback (no trip data). */
  readonly fromFallback: boolean;
}

/**
 * Resolve the rider's typical lat/lon. Returns the fallback (Bucharest)
 * when no trip data exists for the user — the caller can detect that via
 * `fromFallback` if it wants to skip safety-floor enforcement for new
 * riders, though by default we still apply the gate to be conservative.
 */
export const resolveUserLocation = async (
  db: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<UserLocation> => {
  const cached = LOCATION_CACHE.get(userId);
  if (cached && now.getTime() - cached.fetchedAt < CACHE_TTL_MS) {
    return { lat: cached.lat, lon: cached.lon, fromFallback: false };
  }

  try {
    const { data } = await db
      .from('trips')
      .select('start_location')
      .eq('user_id', userId)
      .not('start_location', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = data as { start_location: unknown } | null;
    if (row?.start_location) {
      const coords = parseGeographyPoint(row.start_location);
      if (coords) {
        LOCATION_CACHE.set(userId, {
          lat: coords.lat,
          lon: coords.lon,
          fetchedAt: now.getTime(),
        });
        return { lat: coords.lat, lon: coords.lon, fromFallback: false };
      }
    }
  } catch {
    // Fall through to fallback on any DB error.
  }

  return { lat: FALLBACK_LAT, lon: FALLBACK_LON, fromFallback: true };
};

/** Test-only — wipe the per-process location cache. */
export const __resetLocationCache = (): void => {
  LOCATION_CACHE.clear();
};

/**
 * Parse a PostGIS geography(Point, 4326) value into {lat, lon}. Handles
 * both serialisations the Supabase JS client emits:
 *   - WKT/EWKT string: `"POINT(26.10 44.43)"` (lon first)
 *   - GeoJSON object: `{ type: 'Point', coordinates: [26.10, 44.43] }`
 *
 * Returns null on any malformed input.
 */
const parseGeographyPoint = (
  raw: unknown,
): { lat: number; lon: number } | null => {
  if (typeof raw === 'string') {
    const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(raw);
    if (match) {
      const lon = Number.parseFloat(match[1]!);
      const lat = Number.parseFloat(match[2]!);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const coords = (raw as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }
  return null;
};
