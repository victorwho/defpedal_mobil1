import { useQuery } from '@tanstack/react-query';

import {
  fetchWeather,
  getWeatherWarnings,
  type WeatherData,
  type WeatherWarning,
} from '../lib/weather';

const STALE_TIME_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetches live weather data from Open-Meteo for the given coordinates.
 * Coordinates are rounded to 2 decimal places for cache efficiency.
 */
export const useWeather = (
  lat: number | null,
  lon: number | null,
): {
  weather: WeatherData | null;
  warnings: readonly WeatherWarning[];
  isLoading: boolean;
} => {
  const roundedLat = lat !== null ? Math.round(lat * 100) / 100 : null;
  const roundedLon = lon !== null ? Math.round(lon * 100) / 100 : null;
  const enabled = roundedLat !== null && roundedLon !== null;

  const query = useQuery({
    queryKey: ['weather', roundedLat, roundedLon],
    queryFn: () => fetchWeather(roundedLat!, roundedLon!),
    enabled,
    staleTime: STALE_TIME_MS,
  });

  const weather = query.data ?? null;
  const warnings = weather ? getWeatherWarnings(weather) : [];

  return { weather, warnings, isLoading: query.isLoading };
};
