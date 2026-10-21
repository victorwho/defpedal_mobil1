/**
 * Open-Meteo HOURLY forecast for commute briefings. Pure parsing lives here so
 * it is testable without the network; `commute-notification.ts` does the fetch.
 *
 * Hourly, not daily: a 07:45 briefing must describe 08:00, and the day's
 * min/max (what the weather ping uses) says nothing about that hour.
 */
import type { CommuteHourForecast } from './commute-messages';

/** Today plus the 7-day briefing horizon. */
export const COMMUTE_FORECAST_DAYS = 8;

export const buildHourlyForecastUrl = (lat: number, lon: number): string =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code' +
  `&timezone=auto&forecast_days=${COMMUTE_FORECAST_DAYS}`;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The Open-Meteo `hourly.time` key for the hour containing `d`, in device
 * local time ('2026-10-21T08:00'). With `timezone=auto` the API answers in the
 * location's zone; for a commute the device is in the same zone.
 */
export const hourKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;

/** Hour key -> forecast. Null when the payload has no usable row at all. */
export const parseHourlyForecast = (data: unknown): Map<string, CommuteHourForecast> | null => {
  const hourly = (data as { hourly?: Record<string, unknown> } | null)?.hourly;
  if (!hourly || typeof hourly !== 'object') return null;
  const col = (key: string): unknown[] => (Array.isArray(hourly[key]) ? (hourly[key] as unknown[]) : []);
  const times = col('time');
  const temps = col('temperature_2m');
  const precs = col('precipitation_probability');
  const winds = col('wind_speed_10m');
  const codes = col('weather_code');

  const rows = new Map<string, CommuteHourForecast>();
  times.forEach((time, i) => {
    const values = [temps[i], precs[i], winds[i], codes[i]];
    if (typeof time !== 'string') return;
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    const [temperature, precipitationProbability, windSpeed, weatherCode] = values as number[];
    rows.set(time, { temperature, precipitationProbability, windSpeed, weatherCode });
  });
  return rows.size > 0 ? rows : null;
};
