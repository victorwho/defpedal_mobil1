// @vitest-environment node
/**
 * Five comprehensive tests for the daily-weather-notification module.
 *
 * Each test pins a high-risk axis of the feature:
 *
 *   Test 1 — computeTriggerSeconds across wall-clock boundaries (8:30 anchor).
 *   Test 2 — buildCyclingAdvice on a good day emits a witty title + factual body.
 *   Test 3 — buildCyclingAdvice on bad weather emits the correct safety warning
 *            (table-driven across the 7 dangerous branches) and never a witty title.
 *   Test 4 — pickForecastIndex honours the 8:30 today-vs-tomorrow cutoff.
 *   Test 5 — parseForecastResponse is resilient: returns null for malformed,
 *            missing, or partially-defined Open-Meteo payloads (the silent
 *            bail-out path that prevents scheduling a junk notification).
 *
 * The SUT's thin scheduler glue (`scheduleDailyWeatherNotification`) is
 * verified indirectly: every branch it calls is covered here.
 */
import { describe, expect, it } from 'vitest';

import {
  GOOD_WEATHER_TITLES,
  TRIGGER_HOUR,
  TRIGGER_MINUTE,
  buildCyclingAdvice,
  computeTriggerSeconds,
  parseForecastResponse,
  pickForecastIndex,
  type GoodWeatherForecast,
} from '../daily-weather-messages';

// ---------------------------------------------------------------------------
// Test 1 — computeTriggerSeconds anchors on 8:30
// ---------------------------------------------------------------------------

describe('Test 1: computeTriggerSeconds anchors on the 8:30 fire-time', () => {
  const cases = [
    {
      name: '07:00 → fires today at 08:30 (~5400s)',
      now: new Date(2026, 4, 19, 7, 0, 0),
      expect: 90 * 60,
      tolerance: 2,
    },
    {
      name: '08:29:00 → fires today at 08:30 (~60s, clamp floor still 60)',
      now: new Date(2026, 4, 19, 8, 29, 0),
      expect: 60,
      tolerance: 2,
    },
    {
      name: '08:30:00 exactly → rolls to tomorrow (~24h)',
      now: new Date(2026, 4, 19, 8, 30, 0),
      expect: 24 * 60 * 60,
      tolerance: 2,
    },
    {
      name: '08:30:30 (inside trigger minute) → rolls to tomorrow, clamps to ≥60',
      now: new Date(2026, 4, 19, 8, 30, 30),
      expect: 24 * 60 * 60 - 30,
      tolerance: 2,
    },
    {
      name: '23:00 → fires tomorrow at 08:30 (~9.5h)',
      now: new Date(2026, 4, 19, 23, 0, 0),
      expect: (9 * 60 + 30) * 60,
      tolerance: 2,
    },
    {
      name: 'midnight → fires today at 08:30 (~8.5h)',
      now: new Date(2026, 4, 19, 0, 0, 0),
      expect: (8 * 60 + 30) * 60,
      tolerance: 2,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const secs = computeTriggerSeconds(c.now);
      expect(secs).toBeGreaterThanOrEqual(c.expect - c.tolerance);
      expect(secs).toBeLessThanOrEqual(c.expect + c.tolerance);
      expect(secs).toBeGreaterThanOrEqual(60); // floor invariant
    });
  }

  it('exports the constants the scheduler reads at runtime', () => {
    expect(TRIGGER_HOUR).toBe(8);
    expect(TRIGGER_MINUTE).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — buildCyclingAdvice on a good day: witty title + factual body
// ---------------------------------------------------------------------------

describe('Test 2: good-weather day produces witty title + factual body', () => {
  const goodDay: GoodWeatherForecast = {
    tempMin: 16,
    tempMax: 22,
    precipitationProbability: 5,
    windSpeedMax: 12,
    weatherCode: 1, // mainly clear
  };

  it('picks a title from the curated GOOD_WEATHER_TITLES pool', () => {
    const { title } = buildCyclingAdvice(goodDay, () => 0.42);
    expect(GOOD_WEATHER_TITLES).toContain(title);
  });

  it('body carries the prediction: temp range, condition, wind, rain %', () => {
    const { body } = buildCyclingAdvice(goodDay);
    expect(body).toContain('16–22°C');
    expect(body.toLowerCase()).toContain('sunny');
    expect(body).toMatch(/\b12 km\/h\b/);
    expect(body).toMatch(/\b5%/);
  });

  it('deterministic with an injected RNG → 0 maps to first title, 0.9999 to last', () => {
    const first = buildCyclingAdvice(goodDay, () => 0).title;
    const last = buildCyclingAdvice(goodDay, () => 0.9999).title;
    expect(first).toBe(GOOD_WEATHER_TITLES[0]);
    expect(last).toBe(GOOD_WEATHER_TITLES[GOOD_WEATHER_TITLES.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Safety warnings on bad weather (table-driven over 7 branches)
// ---------------------------------------------------------------------------

describe('Test 3: every bad-weather branch emits the correct safety warning', () => {
  const cases: Array<{
    name: string;
    forecast: GoodWeatherForecast;
    titleMatch: RegExp;
    bodyMatch: RegExp;
  }> = [
    {
      name: 'thunderstorm (code 95)',
      forecast: { tempMin: 18, tempMax: 24, precipitationProbability: 80, windSpeedMax: 30, weatherCode: 95 },
      titleMatch: /storm/i,
      bodyMatch: /thunderstorm/i,
    },
    {
      name: 'heavy snow (code 75)',
      forecast: { tempMin: -1, tempMax: 2, precipitationProbability: 90, windSpeedMax: 10, weatherCode: 75 },
      titleMatch: /snow/i,
      bodyMatch: /snow/i,
    },
    {
      name: 'extreme cold (tempMin -8)',
      forecast: { tempMin: -8, tempMax: 0, precipitationProbability: 10, windSpeedMax: 10, weatherCode: 2 },
      titleMatch: /cold/i,
      bodyMatch: /-8°C/,
    },
    {
      name: 'very strong wind (45 km/h)',
      forecast: { tempMin: 15, tempMax: 20, precipitationProbability: 10, windSpeedMax: 45, weatherCode: 2 },
      titleMatch: /wind/i,
      bodyMatch: /45 km\/h/,
    },
    {
      name: 'heavy rain probability (75%)',
      forecast: { tempMin: 14, tempMax: 18, precipitationProbability: 75, windSpeedMax: 10, weatherCode: 2 },
      titleMatch: /rain/i,
      bodyMatch: /75%/,
    },
    {
      name: 'moderate rain probability (50%) — milder warning copy',
      forecast: { tempMin: 14, tempMax: 18, precipitationProbability: 50, windSpeedMax: 10, weatherCode: 2 },
      titleMatch: /Possible rain/i,
      bodyMatch: /50%/,
    },
    {
      name: 'freezing morning (tempMin -2)',
      forecast: { tempMin: -2, tempMax: 4, precipitationProbability: 10, windSpeedMax: 10, weatherCode: 2 },
      titleMatch: /freezing/i,
      bodyMatch: /-2°C/,
    },
    {
      name: 'windy day (30 km/h, below the "very strong" threshold)',
      forecast: { tempMin: 14, tempMax: 18, precipitationProbability: 10, windSpeedMax: 30, weatherCode: 2 },
      titleMatch: /Windy day/i,
      bodyMatch: /30 km\/h/,
    },
  ];

  for (const c of cases) {
    it(`${c.name} → safety title, never witty`, () => {
      const { title, body } = buildCyclingAdvice(c.forecast);
      expect(title).toMatch(c.titleMatch);
      expect(body).toMatch(c.bodyMatch);
      expect(GOOD_WEATHER_TITLES).not.toContain(title);
    });
  }
});

// ---------------------------------------------------------------------------
// Test 4 — pickForecastIndex respects the 8:30 cutoff
// ---------------------------------------------------------------------------

describe('Test 4: pickForecastIndex honours the 8:30 today-vs-tomorrow cutoff', () => {
  const cases = [
    { name: '00:00 → today',           hour: 0,  minute: 0,  expected: 0 },
    { name: '07:59 → today',           hour: 7,  minute: 59, expected: 0 },
    { name: '08:00 → today',           hour: 8,  minute: 0,  expected: 0 },
    { name: '08:29 → today (last min before cutoff)', hour: 8,  minute: 29, expected: 0 },
    { name: '08:30 → tomorrow (cutoff itself flips)', hour: 8,  minute: 30, expected: 1 },
    { name: '08:31 → tomorrow',        hour: 8,  minute: 31, expected: 1 },
    { name: '09:00 → tomorrow',        hour: 9,  minute: 0,  expected: 1 },
    { name: '23:59 → tomorrow',        hour: 23, minute: 59, expected: 1 },
  ] as const;

  for (const c of cases) {
    it(c.name, () => {
      const now = new Date(2026, 4, 19, c.hour, c.minute, 0);
      expect(pickForecastIndex(now)).toBe(c.expected);
    });
  }

  it('honours custom hour/minute (e.g. if the trigger time ever moves)', () => {
    const now = new Date(2026, 4, 19, 9, 30, 0);
    expect(pickForecastIndex(now, 10, 0)).toBe(0);
    expect(pickForecastIndex(now, 9, 0)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — parseForecastResponse silently bails on malformed payloads
// ---------------------------------------------------------------------------

describe('Test 5: parseForecastResponse is resilient to malformed payloads', () => {
  const wellFormed = {
    daily: {
      time: ['2026-05-19', '2026-05-20'],
      temperature_2m_min: [12, 8],
      temperature_2m_max: [22, 18],
      precipitation_probability_max: [10, 30],
      wind_speed_10m_max: [12, 18],
      weather_code: [1, 3],
    },
  };

  it('parses a well-formed payload at idx 0', () => {
    expect(parseForecastResponse(wellFormed, 0)).toEqual({
      tempMin: 12,
      tempMax: 22,
      precipitationProbability: 10,
      windSpeedMax: 12,
      weatherCode: 1,
    });
  });

  it('parses a well-formed payload at idx 1 (tomorrow row)', () => {
    expect(parseForecastResponse(wellFormed, 1)).toEqual({
      tempMin: 8,
      tempMax: 18,
      precipitationProbability: 30,
      windSpeedMax: 18,
      weatherCode: 3,
    });
  });

  it.each<[string, unknown]>([
    ['null',                                       null],
    ['undefined',                                  undefined],
    ['scalar (string)',                            'oops'],
    ['empty object',                               {}],
    ['daily is not an object',                     { daily: 'oops' }],
    ['daily.time missing',                         { daily: { ...wellFormed.daily, time: undefined } }],
    ['daily.time too short for idx',               { daily: { ...wellFormed.daily, time: ['2026-05-19'] } }],
    ['temperature_2m_min missing',                 { daily: { ...wellFormed.daily, temperature_2m_min: undefined } }],
    ['weather_code is not an array',               { daily: { ...wellFormed.daily, weather_code: 'broken' } }],
    ['idx beyond array bounds',                    { daily: { ...wellFormed.daily, temperature_2m_max: [22] } }],
  ])('returns null on %s', (_label, payload) => {
    expect(parseForecastResponse(payload, 1)).toBeNull();
  });

  it('returns null when a slot value is NaN', () => {
    const broken = {
      daily: { ...wellFormed.daily, temperature_2m_min: [Number.NaN, Number.NaN] },
    };
    expect(parseForecastResponse(broken, 0)).toBeNull();
  });
});
