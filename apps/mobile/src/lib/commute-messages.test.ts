import { describe, expect, it } from 'vitest';

import { translate, type Locale } from '../i18n';
import {
  buildCommuteMessage,
  commuteRideSeconds,
  commuteWeatherKind,
  type CommuteHourForecast,
  type CommuteMessageInput,
} from './commute-messages';

const BUCHAREST = { lat: 44.43, lon: 26.1 };
const forecast = (overrides: Partial<CommuteHourForecast> = {}): CommuteHourForecast => ({
  temperature: 12.4,
  precipitationProbability: 10,
  windSpeed: 12,
  weatherCode: 1,
  ...overrides,
});

const input = (overrides: Partial<CommuteMessageInput> = {}): CommuteMessageInput => ({
  direction: 'to_work',
  departTime: '08:00',
  // Midday in Bucharest (10:00 UTC), so daylight wherever the test runs.
  departAt: new Date('2026-10-21T10:00:00Z'),
  origin: BUCHAREST,
  forecast: forecast(),
  route: {
    direction: 'to_work',
    durationSeconds: 1320,
    distanceMeters: 5400,
    fetchedAt: '2026-10-21T06:00:00.000Z',
    placesKey: 'k',
  },
  pace: null,
  units: 'metric',
  t: (key, vars) => translate('en', key, vars),
  ...overrides,
});

describe('commuteWeatherKind', () => {
  it.each([
    [{ weatherCode: 95 }, 'storm'],
    [{ weatherCode: 73 }, 'snow'],
    [{ temperature: -2 }, 'ice'],
    [{ precipitationProbability: 60 }, 'rain'],
    [{ windSpeed: 45 }, 'wind'],
    [{}, 'ok'],
    // Most serious wins: a storm that is also rainy names the storm.
    [{ weatherCode: 95, precipitationProbability: 90 }, 'storm'],
  ] as const)('%j -> %s', (o, kind) => {
    expect(commuteWeatherKind(forecast(o))).toBe(kind);
  });
});

describe('buildCommuteMessage', () => {
  it('good weather: title, weather, ETA, tap hint', () => {
    const m = buildCommuteMessage(input());
    expect(m.title).toBe('Your 08:00 ride to work');
    expect(m.body).toBe(
      '12°, 10% chance of rain, wind 12 km/h. Safe route: 22 min, 5.4 km. Tap to check today’s hazards.',
    );
    expect(m.tone).toBe('good');
  });

  it('bad weather is a caution with the warning line', () => {
    const m = buildCommuteMessage(input({ forecast: forecast({ precipitationProbability: 80 }) }));
    expect(m.body.startsWith('Rain likely (80%), 12°.')).toBe(true);
    expect(m.tone).toBe('caution');
  });

  it('leaves out what it does not know', () => {
    const m = buildCommuteMessage(input({ forecast: null, route: null }));
    expect(m.body).toBe('Tap to check today’s hazards.');
  });

  it('adds the lights note after dark, and uses the home title', () => {
    const m = buildCommuteMessage(
      input({ direction: 'to_home', departTime: '18:30', departAt: new Date('2026-10-21T16:30:00Z') }),
    );
    expect(m.title).toBe('Your 18:30 ride home');
    expect(m.body).toContain('It will be dark: lights on.');
  });

  it('uses the rider’s units', () => {
    const m = buildCommuteMessage(input({ units: 'imperial' }));
    expect(m.body).toContain('mph');
    expect(m.body).toContain('mi');
    expect(m.body).not.toContain('km');
  });

  it.each(['en', 'ro', 'es'] as Locale[])('%s has every key', (locale) => {
    const kinds = [{}, { weatherCode: 95 }, { weatherCode: 73 }, { temperature: -2 }, { precipitationProbability: 60 }, { windSpeed: 45 }];
    for (const k of kinds) {
      for (const direction of ['to_work', 'to_home'] as const) {
        for (const pace of [null, MY_PACE]) {
          const m = buildCommuteMessage(
            input({
              direction,
              forecast: forecast(k),
              pace,
              departAt: new Date('2026-10-21T16:30:00Z'),
              t: (key, vars) => translate(locale, key, vars),
            }),
          );
          expect(`${m.title} ${m.body}`).not.toMatch(/commute\.|\{\{/);
        }
      }
    }
  });
});

const MY_PACE = { kmh: 18, personal: true, rideCount: 7 };

describe('ETA at the rider’s pace', () => {
  const route = (climbMeters?: number | null) => ({ ...input().route!, climbMeters });

  it('with a router factor: the router time scaled to the rider, and says so', () => {
    // 1,320 s x 0.9 = 1,188 s, 20 min.
    const m = buildCommuteMessage(input({ route: route(30), pace: { ...MY_PACE, routerFactor: 0.9 } }));
    expect(m.body).toContain('Safe route: about 20 min at your pace, 5.4 km.');
    expect(commuteRideSeconds(route(30), { ...MY_PACE, routerFactor: 0.9 })).toBe(1188);
  });

  it('too few rides, no factor yet, or no history: the router time and the plain wording', () => {
    const few = { kmh: 15, personal: false, rideCount: 2 };
    for (const pace of [few, MY_PACE, null]) {
      const m = buildCommuteMessage(input({ route: route(30), pace }));
      expect(m.body).toContain('Safe route: 22 min, 5.4 km.');
      expect(m.body).not.toContain('your pace');
    }
  });
});
