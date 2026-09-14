import { describe, expect, it } from 'vitest';

import type { CyclingForecast } from './cyclingWeather';
import {
  VOLUME_WEEKEND_FACTOR,
  applyCyclingVolume,
  cyclingVolumeAdjustment,
  weatherVolumeAdjustment,
} from './cyclingVolume';

const forecast = (partial: Partial<CyclingForecast> = {}): CyclingForecast => ({
  tempMin: 15,
  tempMax: 22,
  precipitationProbability: 5,
  windSpeedMax: 10,
  weatherCode: 1,
  ...partial,
});

// Monday / Saturday, for the weekday-vs-weekend axis.
const MONDAY = 1;
const SATURDAY = 6;

describe('weatherVolumeAdjustment', () => {
  it('suppresses hardest in a storm', () => {
    const a = weatherVolumeAdjustment(forecast({ weatherCode: 75 }));
    expect(a.reason).toBe('storm');
    expect(a.factor).toBeLessThan(0.5);
  });

  it('suppresses on likely rain', () => {
    const a = weatherVolumeAdjustment(forecast({ precipitationProbability: 70 }));
    expect(a.reason).toBe('rain');
    expect(a.factor).toBeLessThan(1);
  });

  it('suppresses when cold', () => {
    expect(weatherVolumeAdjustment(forecast({ tempMin: 1 })).reason).toBe('cold');
  });

  it('lifts slightly on a mild dry calm day', () => {
    const a = weatherVolumeAdjustment(forecast());
    expect(a.reason).toBe('ideal');
    expect(a.factor).toBeGreaterThan(1);
  });

  it('is neutral with no forecast rather than guessing', () => {
    // A failed weather fetch must not invent a movement. Neutral means the
    // rider sees the typical-day figure, which is still true.
    const a = weatherVolumeAdjustment(null);
    expect(a.factor).toBe(1);
    expect(a.reason).toBe('typical');
  });

  it('takes the worst condition rather than stacking penalties', () => {
    // Cold AND wet AND windy is one bad day, not three. Stacking would drive
    // the estimate to a low nothing supports.
    const a = weatherVolumeAdjustment(
      forecast({ tempMin: 0, precipitationProbability: 90, windSpeedMax: 45 }),
    );
    expect(a.factor).toBeGreaterThanOrEqual(0.4);
  });
});

describe('cyclingVolumeAdjustment', () => {
  it('applies the weekend shape on top of weather', () => {
    const weekday = cyclingVolumeAdjustment(forecast(), MONDAY);
    const weekend = cyclingVolumeAdjustment(forecast(), SATURDAY);
    expect(weekend.factor).toBeCloseTo(weekday.factor * VOLUME_WEEKEND_FACTOR, 5);
  });

  it('keeps every combination inside the modelled band', () => {
    // The model must never claim a day was catastrophic or miraculous — the
    // output is an estimate, and an unbounded multiplier would let one bad
    // input produce a figure nothing supports.
    const cases: CyclingForecast[] = [
      forecast({ weatherCode: 95, precipitationProbability: 100, tempMin: -10, windSpeedMax: 80 }),
      forecast(),
      forecast({ tempMax: 40 }),
    ];
    for (const f of cases) {
      for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        const { factor } = cyclingVolumeAdjustment(f, day);
        expect(factor).toBeGreaterThanOrEqual(0.35);
        expect(factor).toBeLessThanOrEqual(1.15);
      }
    }
  });

  it('is deterministic — the same day and forecast give the same number', () => {
    // The whole point. A figure that moves for real reasons can be checked
    // against the sky; one that moves randomly only looks like it can.
    const a = cyclingVolumeAdjustment(forecast({ precipitationProbability: 70 }), MONDAY);
    const b = cyclingVolumeAdjustment(forecast({ precipitationProbability: 70 }), MONDAY);
    expect(a).toEqual(b);
  });
});

describe('applyCyclingVolume', () => {
  it('rounds to the nearest hundred', () => {
    const out = applyCyclingVolume(10000, { factor: 0.55, reason: 'rain' });
    expect(out % 100).toBe(0);
    expect(out).toBe(5500);
  });

  it('moves visibly between a wet day and an ideal one', () => {
    const wet = applyCyclingVolume(10000, weatherVolumeAdjustment(forecast({ precipitationProbability: 90 })));
    const ideal = applyCyclingVolume(10000, weatherVolumeAdjustment(forecast()));
    expect(ideal).toBeGreaterThan(wet);
  });

  it('never returns zero for a city that has cyclists', () => {
    expect(applyCyclingVolume(10000, { factor: 0.35, reason: 'storm' })).toBeGreaterThan(0);
  });

  it('returns 0 for a city with no base estimate', () => {
    expect(applyCyclingVolume(0, { factor: 1, reason: 'typical' })).toBe(0);
  });
});
