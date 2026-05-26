/**
 * Open-Meteo daily-forecast client for the Pedal Nudge System.
 *
 * The mobile app already calls Open-Meteo for the daily weather widget.
 * Here on the server we use it to apply the safety floor: do not push a
 * ride-asking nudge in bad weather. Calls are cached per process to
 * avoid hammering Open-Meteo when the cron evaluates many users in the
 * same region.
 *
 * No external SDK — `fetch` is global on Node 18+.
 *
 * Endpoint reference: https://api.open-meteo.com/v1/forecast
 */

import type { CyclingForecast } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Endpoint + types
// ---------------------------------------------------------------------------

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoDailyResponse {
  readonly daily?: {
    readonly temperature_2m_max?: number[];
    readonly temperature_2m_min?: number[];
    readonly precipitation_probability_max?: number[];
    readonly wind_speed_10m_max?: number[];
    readonly weather_code?: number[];
  };
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  readonly forecast: CyclingForecast;
  readonly fetchedAt: number;
}

/**
 * Cache keyed by `${lat0.1}|${lon0.1}|${YYYY-MM-DD}` so two riders in the
 * same neighborhood on the same day share a single API call.
 *
 * TTL = 60 minutes. The forecast doesn't change minute-to-minute, and the
 * cron runs every 30 min so this absorbs most overlap.
 */
const FORECAST_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const cacheKey = (lat: number, lon: number, now: Date): string => {
  const day = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'UTC',
  }).format(now);
  return `${lat.toFixed(1)}|${lon.toFixed(1)}|${day}`;
};

const cacheGet = (key: string, now: number): CyclingForecast | null => {
  const hit = FORECAST_CACHE.get(key);
  if (!hit) return null;
  if (now - hit.fetchedAt > CACHE_TTL_MS) {
    FORECAST_CACHE.delete(key);
    return null;
  }
  return hit.forecast;
};

const cacheSet = (key: string, forecast: CyclingForecast, now: number): void => {
  FORECAST_CACHE.set(key, { forecast, fetchedAt: now });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch today's cycling-relevant forecast for the given coordinates. The
 * result is suitable for `isBadCyclingWeather()` in core.
 *
 * Returns null on any failure (network, malformed response). The caller
 * MUST treat null as "weather unknown" — the eligibility layer should
 * fail closed (suppress the nudge) when forecast is unavailable.
 *
 * Pure side effects: HTTP fetch + in-memory cache write.
 */
export const fetchCyclingForecast = async (
  lat: number,
  lon: number,
  now: Date = new Date(),
): Promise<CyclingForecast | null> => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const key = cacheKey(lat, lon, now);
  const cached = cacheGet(key, now.getTime());
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code',
    timezone: 'auto',
    forecast_days: '1',
  });

  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as OpenMeteoDailyResponse;
    const daily = body.daily;
    if (
      !daily ||
      !Array.isArray(daily.temperature_2m_max) ||
      !Array.isArray(daily.temperature_2m_min) ||
      !Array.isArray(daily.precipitation_probability_max) ||
      !Array.isArray(daily.wind_speed_10m_max) ||
      !Array.isArray(daily.weather_code)
    ) {
      return null;
    }

    const forecast: CyclingForecast = {
      tempMax: daily.temperature_2m_max[0] ?? Number.NaN,
      tempMin: daily.temperature_2m_min[0] ?? Number.NaN,
      precipitationProbability: daily.precipitation_probability_max[0] ?? 0,
      windSpeedMax: daily.wind_speed_10m_max[0] ?? 0,
      weatherCode: daily.weather_code[0] ?? 0,
    };

    cacheSet(key, forecast, now.getTime());
    return forecast;
  } catch {
    return null;
  }
};

/**
 * Test-only escape hatch. Resets the in-memory forecast cache so unit
 * tests don't see entries from other tests.
 */
export const __resetForecastCache = (): void => {
  FORECAST_CACHE.clear();
};
