// Review finding G-25: weather_invitation used to promise "Perfect cycling
// weather this weekend" from the UTC weekday alone — no forecast was ever
// fetched. These tests pin the new contract: the template stays silent
// unless a real forecast at the rider's own location clears the
// good-cycling-day window, and every template speaks the rider's language.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CyclingForecast } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Chainable Supabase mock. Each table resolves a configurable result, and
// every filter call is recorded so the dedupe query shape can be asserted.
// ---------------------------------------------------------------------------

interface TableResult {
  data?: unknown;
  error?: null;
  count?: number;
}

/**
 * A table maps to one result reused for every query, or to a queue consumed
 * in call order — `notification_log` is read twice per evaluation (weekly
 * budget, then the template's own guard) and the two need different counts.
 */
const resultsByTable: Record<string, TableResult | TableResult[]> = {};
const orFilters: string[] = [];

const makeChain = (table: string) => {
  const result = () => {
    const configured = resultsByTable[table];
    if (Array.isArray(configured)) {
      return configured.shift() ?? { data: null, error: null, count: 0 };
    }
    return configured ?? { data: null, error: null, count: 0 };
  };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'not', 'in', 'gte', 'ilike', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.or = vi.fn((filter: string) => {
    orFilters.push(filter);
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(result()));
  (chain as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (v: unknown) => unknown,
  ) => Promise.resolve(result()).then(resolve, reject);
  return chain;
};

const db = {
  from: (table: string) => makeChain(table),
} as never;

const dispatchSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('./notifications', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchSpy(...args),
}));

const forecastSpy = vi.fn<[number, number], Promise<CyclingForecast | null>>();
vi.mock('./clients/openMeteo', () => ({
  fetchCyclingForecast: (lat: number, lon: number) => forecastSpy(lat, lon),
}));

import {
  checkFirstRideNudge,
  checkLapsedReengagement,
  checkWeatherInvitation,
  evaluateFirstRideNotifications,
  type FirstRideProfile,
} from './firstRideNotifications';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 2026-08-14 is a Friday — the weekend send window (guarded below). */
const FRIDAY = new Date('2026-08-14T10:00:00Z');
const WEDNESDAY = new Date('2026-08-12T10:00:00Z');

const MADRID = { lat: 40.42, lon: -3.7 };

const GOOD_WEATHER: CyclingForecast = {
  tempMin: 15,
  tempMax: 24,
  precipitationProbability: 10,
  windSpeedMax: 12,
  weatherCode: 1,
};

const RAINY: CyclingForecast = {
  tempMin: 15,
  tempMax: 24,
  precipitationProbability: 90,
  windSpeedMax: 12,
  weatherCode: 61,
};

const profile = (overrides: Partial<FirstRideProfile> = {}): FirstRideProfile => ({
  id: 'user-1',
  total_rides: 4,
  notify_mia: true,
  created_at: '2026-01-01T00:00:00Z',
  last_ride_at: '2026-08-01T10:00:00Z', // 13 days ago on FRIDAY
  is_anonymous: false,
  location: MADRID,
  ...overrides,
});

const sentPayload = () => dispatchSpy.mock.calls[0]![2] as { title: string; body: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FRIDAY);
  dispatchSpy.mockClear();
  forecastSpy.mockReset();
  forecastSpy.mockResolvedValue(GOOD_WEATHER);
  orFilters.length = 0;
  for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// weather_invitation — the G-25 fix
// ---------------------------------------------------------------------------

describe('checkWeatherInvitation — forecast gate', () => {
  it('the fixture dates really are Friday / Wednesday', () => {
    expect(FRIDAY.getUTCDay()).toBe(5);
    expect(WEDNESDAY.getUTCDay()).toBe(3);
  });

  it('sends when a real forecast at the rider location is a good cycling day', async () => {
    const result = await checkWeatherInvitation(db, profile());

    expect(result).toEqual({ template: 'weather_invitation', sent: true });
    expect(forecastSpy).toHaveBeenCalledWith(MADRID.lat, MADRID.lon);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('stays silent when no forecast could be fetched', async () => {
    forecastSpy.mockResolvedValue(null);

    const result = await checkWeatherInvitation(db, profile());

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_forecast');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('stays silent when the forecast is outside the good-cycling window', async () => {
    forecastSpy.mockResolvedValue(RAINY);

    const result = await checkWeatherInvitation(db, profile());

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('bad_weather');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('fails closed with no resolved location — never guesses a city', async () => {
    const result = await checkWeatherInvitation(db, profile({ location: null }));

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_location');
    expect(forecastSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch a forecast outside the weekend window', async () => {
    vi.setSystemTime(WEDNESDAY);

    const result = await checkWeatherInvitation(db, profile());

    expect(result.reason).toBe('not_weekend');
    expect(forecastSpy).not.toHaveBeenCalled();
  });

  it('skips riders who rode in the last 3 days before touching the forecast', async () => {
    const result = await checkWeatherInvitation(
      db,
      profile({ last_ride_at: '2026-08-13T10:00:00Z' }),
    );

    expect(result.reason).toBe('rode_recently');
    expect(forecastSpy).not.toHaveBeenCalled();
  });

  it('claims only the day it verified — no unbacked weekend promise', async () => {
    await checkWeatherInvitation(db, profile());

    expect(sentPayload().body).toBe(
      'The weather looks good for cycling today. A short ride through quiet streets?',
    );
  });
});

// ---------------------------------------------------------------------------
// Locale selection
// ---------------------------------------------------------------------------

describe('template locale selection', () => {
  it('renders Romanian copy for preferred_locale = ro', async () => {
    await checkWeatherInvitation(db, profile({ preferred_locale: 'ro' }));

    expect(sentPayload().title).toBe('Zi bună de pedalat');
    expect(sentPayload().body).toContain('Vremea arată bine');
  });

  it('renders Spanish copy for a region tag like es-ES', async () => {
    await checkWeatherInvitation(db, profile({ preferred_locale: 'es-ES' }));

    expect(sentPayload().title).toBe('Buen día para rodar');
    expect(sentPayload().body).toContain('el tiempo acompaña');
  });

  it('falls back to English for null, unknown, or non-string locales', async () => {
    for (const locale of [null, undefined, 'de', 'nonsense', 42 as unknown as string]) {
      dispatchSpy.mockClear();
      await checkWeatherInvitation(db, profile({ preferred_locale: locale }));
      expect(sentPayload().title, `locale ${String(locale)}`).toBe('Good Day for a Ride');
    }
  });

  it('localizes the other templates too', async () => {
    await checkFirstRideNudge(
      db,
      profile({ total_rides: 0, preferred_locale: 'es', last_ride_at: null }),
    );

    expect(sentPayload().title).toBe('Tu primera ruta te espera');
  });
});

// ---------------------------------------------------------------------------
// Dedupe across locales
// ---------------------------------------------------------------------------

describe('already-sent guards survive localization', () => {
  it('matches the legacy English marker and both new locale markers', async () => {
    await checkFirstRideNudge(db, profile({ total_rides: 0, last_ride_at: null }));

    expect(orFilters).toHaveLength(1);
    expect(orFilters[0]).toContain('body.ilike.*first route*');
    expect(orFilters[0]).toContain('body.ilike.*prima ta rută*');
    expect(orFilters[0]).toContain('body.ilike.*tu primera ruta*');
  });

  it('suppresses a repeat when a prior send is found in any locale', async () => {
    resultsByTable.notification_log = { data: null, error: null, count: 1 };

    const result = await checkFirstRideNudge(
      db,
      profile({ total_rides: 0, last_ride_at: null }),
    );

    expect(result).toEqual({
      template: 'first_ride_nudge',
      sent: false,
      reason: 'already_sent',
    });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('caps lapsed re-engagement at 2 lifetime sends', async () => {
    resultsByTable.notification_log = { data: null, error: null, count: 2 };

    const result = await checkLapsedReengagement(db, profile());

    expect(result.reason).toBe('max_lapsed_reached');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('stamps the template id on the payload for future dedupe', async () => {
    await checkWeatherInvitation(db, profile());

    const data = (dispatchSpy.mock.calls[0]![2] as { data: Record<string, unknown> }).data;
    expect(data.template).toBe('weather_invitation');
    expect(data.type).toBe('first_ride');
  });
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

describe('evaluateFirstRideNotifications', () => {
  it('stops after the first send', async () => {
    const results = await evaluateFirstRideNotifications(db, profile());

    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the weather gate closes the only open template', async () => {
    forecastSpy.mockResolvedValue(RAINY);
    // Query order for this profile: weekly budget (0 = under budget), then
    // the lapsed guard (2 = lifetime cap reached). That leaves
    // weather_invitation as the only candidate, so the run turns entirely on
    // the forecast.
    resultsByTable.notification_log = [
      { data: null, error: null, count: 0 },
      { data: null, error: null, count: 2 },
    ];

    const results = await evaluateFirstRideNotifications(db, profile());

    expect(results.every((r) => !r.sent)).toBe(true);
    expect(results).toContainEqual({
      template: 'weather_invitation',
      sent: false,
      reason: 'bad_weather',
    });
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('stops before the forecast when the weekly budget is spent', async () => {
    resultsByTable.notification_log = { data: null, error: null, count: 2 };

    const results = await evaluateFirstRideNotifications(db, profile());

    expect(results[0]!.reason).toBe('weekly_budget_exceeded');
    expect(forecastSpy).not.toHaveBeenCalled();
  });
});
