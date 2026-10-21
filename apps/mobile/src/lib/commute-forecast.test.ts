import { describe, expect, it } from 'vitest';

import { buildHourlyForecastUrl, hourKey, parseHourlyForecast } from './commute-forecast';

describe('hourKey', () => {
  it('is the local hour in Open-Meteo format', () => {
    expect(hourKey(new Date(2026, 9, 21, 8, 45))).toBe('2026-10-21T08:00');
    expect(hourKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05T00:00');
  });
});

describe('buildHourlyForecastUrl', () => {
  it('asks for hourly fields in the location timezone', () => {
    const url = buildHourlyForecastUrl(44.43, 26.1);
    expect(url).toContain('hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code');
    expect(url).toContain('timezone=auto');
    expect(url).toContain('forecast_days=8');
  });
});

describe('parseHourlyForecast', () => {
  const payload = {
    hourly: {
      time: ['2026-10-21T07:00', '2026-10-21T08:00', '2026-10-21T09:00'],
      temperature_2m: [9.1, 10.4, null],
      precipitation_probability: [5, 20, 30],
      wind_speed_10m: [8, 11, 12],
      weather_code: [1, 3, 61],
    },
  };

  it('maps each complete hour, skipping rows with missing values', () => {
    const rows = parseHourlyForecast(payload);
    expect(rows?.get('2026-10-21T08:00')).toEqual({
      temperature: 10.4,
      precipitationProbability: 20,
      windSpeed: 11,
      weatherCode: 3,
    });
    expect(rows?.has('2026-10-21T09:00')).toBe(false);
    expect(rows?.size).toBe(2);
  });

  it.each([null, {}, { hourly: {} }, { hourly: { time: ['x'], temperature_2m: [null] } }])(
    'is null without a usable row: %j',
    (data) => {
      expect(parseHourlyForecast(data)).toBeNull();
    },
  );
});
