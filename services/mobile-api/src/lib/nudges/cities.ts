/**
 * City Riders Pulse — cities dataset access + nearest-city lookup.
 *
 * The dataset (GeoNames cities15000 filtered to the 31 supported countries)
 * lives server-side only: Metro does not tree-shake, so shipping it through
 * packages/core would put ~280 KB of city tuples in the mobile bundle for a
 * feature the client never computes.
 *
 * Lookup is a linear haversine scan over ~5.5k entries — microseconds per
 * user, no index needed at cron scale.
 */

import { haversineDistance } from '@defensivepedal/core';

import { CITY_TUPLES } from './citiesData';

export interface CityEntry {
  readonly name: string;
  readonly countryCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly population: number;
  /** Standard-time (winter) UTC offset in hours. DST backstop = quiet hours. */
  readonly utcOffsetHours: number;
}

const CITIES: readonly CityEntry[] = CITY_TUPLES.map(
  ([name, countryCode, lat, lon, population, utcOffsetHours]) => ({
    name,
    countryCode,
    lat,
    lon,
    population,
    utcOffsetHours,
  }),
);

export const DEFAULT_NEAREST_CITY_MAX_KM = 30;

/**
 * Nearest dataset city within `maxKm` of the given point, or null when the
 * rider is outside every city's radius (deep countryside / outside the 31
 * supported countries). Callers falling into null use the 100k-population
 * fallback (`CITY_PULSE_FALLBACK_POPULATION`) and leave the city name unset
 * so pedalVoice renders its localized "your city" fallback instead of a
 * wrong city name.
 */
export const findNearestCity = (
  lat: number,
  lon: number,
  maxKm: number = DEFAULT_NEAREST_CITY_MAX_KM,
): CityEntry | null => {
  let best: CityEntry | null = null;
  let bestMeters = maxKm * 1000;
  for (const city of CITIES) {
    const meters = haversineDistance([lat, lon], [city.lat, city.lon]);
    if (meters <= bestMeters) {
      bestMeters = meters;
      best = city;
    }
  }
  return best;
};

/**
 * Stable identity for seeding N per (city, date). Derived only from the
 * entry itself so every user matched to this city hashes identically.
 */
export const cityKey = (city: CityEntry): string =>
  `${city.countryCode}|${city.name}|${city.lat.toFixed(2)}`;

/** Test hook — dataset size + sample without exporting the raw array. */
export const cityDatasetStats = (): { count: number; countries: ReadonlySet<string> } => ({
  count: CITIES.length,
  countries: new Set(CITIES.map((c) => c.countryCode)),
});
