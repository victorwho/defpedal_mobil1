/**
 * Commute briefing text. Pure: no native modules, no I/O.
 * Plan: docs/plans/commute-mode.md, step 3.
 *
 * The text is computed when the briefing is scheduled, up to a week before it
 * fires, so it says nothing that goes stale fast: no hazard counts (the tap
 * opens route preview, which fetches them live). Weather is the forecast for
 * the departure HOUR, not the day's min/max the weather ping uses.
 *
 * Temperature stays in °C (project rule); wind, distance and duration go
 * through the core formatters with the rider's units.
 */
import {
  formatDistance,
  formatDuration,
  formatSpeedKmh,
  isDark,
  type Coordinate,
  type MeasurementSystem,
} from '@defensivepedal/core';

import type { CommuteDirection, CommuteRouteEstimate } from '../store/commuteSlice';
import { weatherCodeIsSnow, weatherCodeIsStorm } from './daily-weather-messages';

/** One Open-Meteo hourly row at the departure hour. */
export interface CommuteHourForecast {
  readonly temperature: number;
  readonly precipitationProbability: number;
  readonly windSpeed: number;
  readonly weatherCode: number;
}

export type CommuteWeatherKind = 'storm' | 'snow' | 'ice' | 'rain' | 'wind' | 'ok';

// Same thresholds the weather ping warns at (daily-weather-messages.ts).
const RAIN_WARN_PCT = 40;
const WIND_WARN_KMH = 40;

/** Most serious condition first: the briefing names only one. */
export const commuteWeatherKind = (f: CommuteHourForecast): CommuteWeatherKind => {
  if (weatherCodeIsStorm(f.weatherCode)) return 'storm';
  if (weatherCodeIsSnow(f.weatherCode)) return 'snow';
  if (f.temperature < 0) return 'ice';
  if (f.precipitationProbability > RAIN_WARN_PCT) return 'rain';
  if (f.windSpeed > WIND_WARN_KMH) return 'wind';
  return 'ok';
};

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface CommuteMessageInput {
  readonly direction: CommuteDirection;
  /** 'HH:MM' departure, as the rider set it. */
  readonly departTime: string;
  readonly departAt: Date;
  /** Where the ride starts; used for the darkness check. */
  readonly origin: Coordinate;
  /** Null when the forecast has no row for that hour. */
  readonly forecast: CommuteHourForecast | null;
  /** Null when no route could be fetched; the ETA is then left out. */
  readonly route: CommuteRouteEstimate | null;
  readonly units: MeasurementSystem;
  readonly t: Translate;
}

export interface CommuteMessage {
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'caution';
}

export const buildCommuteMessage = (input: CommuteMessageInput): CommuteMessage => {
  const { t, forecast, route, units } = input;
  const kind = forecast ? commuteWeatherKind(forecast) : null;

  const parts: string[] = [];
  if (forecast && kind) {
    parts.push(
      t(`commute.weather.${kind}`, {
        temp: Math.round(forecast.temperature),
        rain: Math.round(forecast.precipitationProbability),
        wind: formatSpeedKmh(forecast.windSpeed, units),
      }),
    );
  }
  if (route) {
    parts.push(
      t('commute.eta', {
        duration: formatDuration(route.durationSeconds),
        distance: formatDistance(route.distanceMeters, units),
      }),
    );
  }
  if (isDark(input.origin.lat, input.origin.lon, input.departAt)) {
    parts.push(t('commute.dark'));
  }
  parts.push(t('commute.tapHint'));

  return {
    title: t(input.direction === 'to_work' ? 'commute.titleToWork' : 'commute.titleToHome', {
      time: input.departTime,
    }),
    body: parts.join(' '),
    tone: kind === null || kind === 'ok' ? 'good' : 'caution',
  };
};
