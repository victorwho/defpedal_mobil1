import { describe, expect, it } from 'vitest';
import {
  isBadCyclingWeather,
  isGoodCyclingDay,
  type CyclingForecast,
} from './cyclingWeather';

const baseForecast: CyclingForecast = {
  tempMin: 14,
  tempMax: 22,
  precipitationProbability: 5,
  windSpeedMax: 10,
  weatherCode: 1,
};

describe('isGoodCyclingDay', () => {
  it('returns true for the happy-path forecast', () => {
    expect(isGoodCyclingDay(baseForecast)).toBe(true);
  });

  it('rejects when tempMin is below the comfort window', () => {
    expect(isGoodCyclingDay({ ...baseForecast, tempMin: 5 })).toBe(false);
  });

  it('rejects when tempMax is above the comfort window', () => {
    expect(isGoodCyclingDay({ ...baseForecast, tempMax: 32 })).toBe(false);
  });

  it('rejects when precipitation probability is too high', () => {
    expect(isGoodCyclingDay({ ...baseForecast, precipitationProbability: 50 })).toBe(false);
  });

  it('rejects when wind exceeds the comfort window', () => {
    expect(isGoodCyclingDay({ ...baseForecast, windSpeedMax: 30 })).toBe(false);
  });

  it('rejects on storm/snow weather codes (>= 71)', () => {
    expect(isGoodCyclingDay({ ...baseForecast, weatherCode: 71 })).toBe(false);
    expect(isGoodCyclingDay({ ...baseForecast, weatherCode: 95 })).toBe(false);
  });

  it('rejects NaN or infinite temps (fail closed)', () => {
    expect(isGoodCyclingDay({ ...baseForecast, tempMin: Number.NaN })).toBe(false);
    expect(isGoodCyclingDay({ ...baseForecast, tempMax: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe('isBadCyclingWeather — safety-critical only', () => {
  it('returns false for the happy-path forecast', () => {
    expect(isBadCyclingWeather(baseForecast)).toBe(false);
  });

  it('returns false on a slightly-cool dry day (8°C) — still nudge-safe', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMin: 8, tempMax: 12 }),
    ).toBe(false);
  });

  it('returns false on a warm day (29-32°C) — still nudge-safe', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMin: 20, tempMax: 31 }),
    ).toBe(false);
  });

  it('returns false on moderate rain probability (40%)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, precipitationProbability: 40 }),
    ).toBe(false);
  });

  it('returns true on freezing temps (<2°C)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMin: 1 }),
    ).toBe(true);
  });

  it('returns true on extreme heat (>35°C)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMax: 38 }),
    ).toBe(true);
  });

  it('returns true on heavy rain probability (>60%)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, precipitationProbability: 70 }),
    ).toBe(true);
  });

  it('returns true on strong wind (>40 km/h)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, windSpeedMax: 45 }),
    ).toBe(true);
  });

  it('returns true on storm weather code (>= 71)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, weatherCode: 71 }),
    ).toBe(true);
    expect(
      isBadCyclingWeather({ ...baseForecast, weatherCode: 95 }),
    ).toBe(true);
  });

  it('returns true on missing forecast (fail closed)', () => {
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMin: Number.NaN }),
    ).toBe(true);
    expect(
      isBadCyclingWeather({ ...baseForecast, tempMax: Number.NaN }),
    ).toBe(true);
  });
});
