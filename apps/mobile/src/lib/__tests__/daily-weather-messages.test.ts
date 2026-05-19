// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  GOOD_WEATHER_TITLES,
  buildGoodWeatherBody,
  isGoodCyclingWeather,
  pickRandomGoodWeatherTitle,
} from '../daily-weather-messages';

const baseGoodForecast = {
  tempMin: 14,
  tempMax: 22,
  precipitationProbability: 5,
  windSpeedMax: 12,
  weatherCode: 1, // mainly clear
};

describe('GOOD_WEATHER_TITLES', () => {
  it('contains at least 30 variants (product requirement)', () => {
    expect(GOOD_WEATHER_TITLES.length).toBeGreaterThanOrEqual(30);
  });

  it('has no empty or whitespace-only strings', () => {
    for (const title of GOOD_WEATHER_TITLES) {
      expect(title.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps every title short enough for an Android lock-screen heads-up (~70 chars)', () => {
    for (const title of GOOD_WEATHER_TITLES) {
      expect(title.length).toBeLessThanOrEqual(80);
    }
  });

  it('contains no emoji glyphs (plain text only)', () => {
    // Match common emoji ranges plus VS-16 and ZWJ — these were the historic
    // failure mode (mojibake on some OEM skins).
    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/u;
    for (const title of GOOD_WEATHER_TITLES) {
      expect(emojiPattern.test(title)).toBe(false);
    }
  });

  it('has no duplicate titles', () => {
    const set = new Set(GOOD_WEATHER_TITLES);
    expect(set.size).toBe(GOOD_WEATHER_TITLES.length);
  });
});

describe('pickRandomGoodWeatherTitle', () => {
  it('returns one of the declared titles', () => {
    const title = pickRandomGoodWeatherTitle(() => 0.42);
    expect(GOOD_WEATHER_TITLES).toContain(title);
  });

  it('maps random=0 to the first title and random→1 to the last', () => {
    expect(pickRandomGoodWeatherTitle(() => 0)).toBe(GOOD_WEATHER_TITLES[0]);
    expect(pickRandomGoodWeatherTitle(() => 0.9999)).toBe(
      GOOD_WEATHER_TITLES[GOOD_WEATHER_TITLES.length - 1],
    );
  });

  it('clamps a misbehaving PRNG returning exactly 1.0 (no OOB index)', () => {
    const title = pickRandomGoodWeatherTitle(() => 1);
    expect(title).toBe(GOOD_WEATHER_TITLES[GOOD_WEATHER_TITLES.length - 1]);
  });

  it('covers every title across a deterministic sweep (distribution sanity)', () => {
    const seen = new Set<string>();
    const N = GOOD_WEATHER_TITLES.length;
    for (let i = 0; i < N; i++) {
      // Land exactly in the middle of each bucket → 1 hit per title.
      const r = (i + 0.5) / N;
      seen.add(pickRandomGoodWeatherTitle(() => r));
    }
    expect(seen.size).toBe(N);
  });

  it('defaults to Math.random when no injector is passed', () => {
    const title = pickRandomGoodWeatherTitle();
    expect(GOOD_WEATHER_TITLES).toContain(title);
  });
});

describe('isGoodCyclingWeather', () => {
  it('accepts a calm, mild, dry day', () => {
    expect(isGoodCyclingWeather(baseGoodForecast)).toBe(true);
  });

  it('rejects too cold (tempMin below comfort floor)', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, tempMin: 4 }),
    ).toBe(false);
  });

  it('rejects too hot (tempMax above comfort ceiling)', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, tempMax: 32 }),
    ).toBe(false);
  });

  it('rejects high rain probability', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, precipitationProbability: 60 }),
    ).toBe(false);
  });

  it('rejects strong wind', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, windSpeedMax: 30 }),
    ).toBe(false);
  });

  it('rejects snow / storm weather codes regardless of temp', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, weatherCode: 71 }),
    ).toBe(false);
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, weatherCode: 95 }),
    ).toBe(false);
  });

  it('rejects NaN / non-finite temperatures defensively', () => {
    expect(
      isGoodCyclingWeather({ ...baseGoodForecast, tempMin: Number.NaN }),
    ).toBe(false);
  });
});

describe('buildGoodWeatherBody', () => {
  it('includes the temp range, condition word, wind, and rain %', () => {
    const body = buildGoodWeatherBody(baseGoodForecast);
    expect(body).toContain('14–22°C');
    expect(body).toContain('sunny');
    expect(body).toContain('12 km/h');
    expect(body).toContain('5%');
  });

  it('rounds wind and rain numbers (no decimals on the lock screen)', () => {
    const body = buildGoodWeatherBody({
      ...baseGoodForecast,
      windSpeedMax: 11.6,
      precipitationProbability: 4.4,
    });
    expect(body).toContain('12 km/h');
    expect(body).toContain('4%');
  });

  it('labels code 3 as cloudy and code 45 as foggy', () => {
    expect(buildGoodWeatherBody({ ...baseGoodForecast, weatherCode: 3 })).toContain('cloudy');
    expect(buildGoodWeatherBody({ ...baseGoodForecast, weatherCode: 45 })).toContain('foggy');
  });
});
