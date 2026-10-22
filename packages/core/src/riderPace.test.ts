import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PACE_KMH,
  MIN_RIDES_FOR_PACE,
  personalRideSeconds,
  resolveEtaPace,
  rideMinutes,
  riderPace,
  riderPaces,
  routerTimeIsEstimate,
} from './riderPace';

/** A ride of `km` covered in `minutes`. */
const ride = (km: number, minutes: number, startedAt = '2026-09-01T08:00:00Z') => ({
  distanceMeters: km * 1000,
  startedAt,
  endedAt: new Date(Date.parse(startedAt) + minutes * 60_000).toISOString(),
});

describe('riderPace', () => {
  it('falls back to the default with no history', () => {
    const pace = riderPace([]);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
    expect(pace.personal).toBe(false);
  });

  it('waits for enough rides before trusting them', () => {
    // One ride is an anecdote. An estimate that lurches after each ride reads
    // as broken rather than personal.
    const pace = riderPace([ride(20, 40), ride(20, 40)]);
    expect(pace.personal).toBe(false);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
    expect(MIN_RIDES_FOR_PACE).toBe(3);
  });

  it('uses the rider’s own speed once there are enough rides', () => {
    // Three rides at 30 km/h.
    const pace = riderPace([ride(15, 30), ride(20, 40), ride(10, 20)]);
    expect(pace.personal).toBe(true);
    expect(pace.kmh).toBeCloseTo(30, 5);
    expect(pace.rideCount).toBe(3);
  });

  it('is not dragged down by one ride that sat paused', () => {
    // The reason this is a median. A 90-minute coffee stop on a 20 km ride
    // reads as 13 km/h; pooling distance over time would apply that to every
    // future estimate.
    const median = riderPace([ride(20, 40), ride(20, 40), ride(20, 40), ride(20, 130)]);
    expect(median.kmh).toBeCloseTo(30, 1);
  });

  it('drops rides that cannot be bicycle rides', () => {
    // A stopped clock reads as an absurd speed and would otherwise become the
    // middle value on a short history.
    const pace = riderPace([
      ride(20, 40),
      ride(20, 40),
      ride(20, 40),
      ride(50, 3), // 1000 km/h
      ride(1, 600), // 0.1 km/h
    ]);
    expect(pace.kmh).toBeCloseTo(30, 1);
    expect(pace.rideCount).toBe(3);
  });

  it('ignores rides that never ended, and trivial ones', () => {
    const pace = riderPace([
      { distanceMeters: 20_000, startedAt: '2026-09-01T08:00:00Z', endedAt: null },
      ride(0.2, 5),
      { distanceMeters: undefined, startedAt: '2026-09-01T08:00:00Z', endedAt: '2026-09-01T09:00:00Z' },
    ]);
    expect(pace.personal).toBe(false);
  });

  it('survives unparseable timestamps', () => {
    const pace = riderPace([
      { distanceMeters: 20_000, startedAt: 'not-a-date', endedAt: 'nor-this' },
    ]);
    expect(pace.kmh).toBe(DEFAULT_PACE_KMH);
  });
});

describe('rideMinutes', () => {
  it('is distance over pace on the flat', () => {
    expect(rideMinutes(30_000, 0, 15)).toBe(120);
    expect(rideMinutes(30_000, null, 15)).toBe(120);
  });

  it('costs time for climbing', () => {
    // Wrong in the direction that leaves someone out after dark is the failure
    // that matters, so a hilly loop must not be quoted at flat-ground pace.
    const flat = rideMinutes(30_000, 0, 15);
    const hilly = rideMinutes(30_000, 600, 15);
    expect(hilly).toBeGreaterThan(flat);
  });

  it('never returns zero or a negative', () => {
    expect(rideMinutes(0, null, 15)).toBe(1);
    expect(rideMinutes(-100, null, 15)).toBe(1);
    expect(rideMinutes(10_000, null, 0)).toBeGreaterThan(0);
  });
});

const MINE = { kmh: 18, personal: true, rideCount: 7 };
const DEFAULT = { kmh: DEFAULT_PACE_KMH, personal: false, rideCount: 2 };

const EBIKE = { kmh: 24, personal: true, rideCount: 4 };

describe('resolveEtaPace', () => {
  it('the normal bike’s pace when switched on, on a normal bike', () => {
    expect(resolveEtaPace({ paces: { normal: MINE, ebike: EBIKE }, enabled: true, ebikeOwner: false })).toBe(MINE);
  });

  it('the e-bike’s own pace with E-bike selected', () => {
    expect(resolveEtaPace({ paces: { normal: MINE, ebike: EBIKE }, enabled: true, ebikeOwner: true })).toBe(EBIKE);
  });

  it.each([
    ['switched off', { paces: { normal: MINE, ebike: EBIKE }, enabled: false, ebikeOwner: false }],
    ['too few e-bike rides', { paces: { normal: MINE, ebike: DEFAULT }, enabled: true, ebikeOwner: true }],
    ['not enough rides', { paces: { normal: DEFAULT, ebike: DEFAULT }, enabled: true, ebikeOwner: false }],
    ['no pace read yet', { paces: null, enabled: true, ebikeOwner: false }],
  ])('router time when %s', (_label, input) => {
    expect(resolveEtaPace(input)).toBeNull();
  });
});

/** A completed, never-rerouted ride the router predicted at `plannedMinutes`. */
const predicted = (
  km: number,
  minutes: number,
  plannedMinutes: number,
  extra: Record<string, unknown> = {},
) => ({
  ...ride(km, minutes),
  plannedDurationSeconds: plannedMinutes * 60,
  rerouteCount: 0,
  endReason: 'completed',
  ...extra,
});

describe('riderPace: router factor', () => {
  it('median of actual / predicted, once three rides carry a prediction', () => {
    const pace = riderPace([predicted(6, 18, 20), predicted(6, 22, 20), predicted(6, 24, 20)]);
    expect(pace.routerFactor).toBeCloseTo(1.1, 5);
  });

  it('no factor from fewer than three', () => {
    const pace = riderPace([predicted(6, 18, 20), predicted(6, 22, 20), ride(6, 20)]);
    expect(pace.personal).toBe(true);
    expect(pace.routerFactor).toBeUndefined();
  });

  it.each([
    ['a rerouted ride', { rerouteCount: 1 }],
    ['an unknown reroute count', { rerouteCount: undefined }],
    ['a stopped ride', { endReason: 'stopped' }],
    ['a ride under 1 km', { distanceMeters: 900 }],
    ['an implausible ratio', { plannedDurationSeconds: 60 }],
  ])('leaves out %s', (_label, extra) => {
    const pace = riderPace([predicted(6, 18, 20), predicted(6, 22, 20), predicted(6, 24, 20, extra)]);
    expect(pace.routerFactor).toBeUndefined();
  });
});

describe('routerTimeIsEstimate', () => {
  it.each([
    ['a GPX course', 'gpx_course', false, true],
    ['a loop on an e-bike', 'generated_loop', true, true],
    ['a loop on a normal bike', 'generated_loop', false, false],
    ['a routed A-to-B on an e-bike', 'custom_osrm', true, false],
  ])('%s', (_label, source, isEbike, expected) => {
    expect(routerTimeIsEstimate({ source }, isEbike)).toBe(expected);
  });
});

describe('riderPaces: one pace per bike', () => {
  const normalRide = (minutes: number) => ({ ...ride(10, minutes), isEbike: false });
  const ebikeRide = (minutes: number) => ({ ...ride(10, minutes), isEbike: true });
  const unrecorded = (minutes: number) => ride(10, minutes);

  it('splits recorded rides by bike', () => {
    const paces = riderPaces([normalRide(40), normalRide(40), normalRide(40), ebikeRide(25), ebikeRide(25), ebikeRide(25)]);
    expect(paces.normal.kmh).toBeCloseTo(15, 5);
    expect(paces.ebike.kmh).toBeCloseTo(24, 5);
  });

  it('a ride with no bike counts for the normal bike', () => {
    const paces = riderPaces([unrecorded(40), unrecorded(40), normalRide(40)]);
    expect(paces.normal).toMatchObject({ personal: true, rideCount: 3 });
    expect(paces.ebike.personal).toBe(false);
  });

  it('e-bike rides do not take rides away from the normal pace', () => {
    const paces = riderPaces([unrecorded(40), unrecorded(40), normalRide(40), ebikeRide(25)]);
    expect(paces.normal).toMatchObject({ personal: true, rideCount: 3 });
    expect(paces.ebike.rideCount).toBe(1);
  });
});

describe('personalRideSeconds', () => {
  const route = { distanceMeters: 5400, climbMeters: 30, routerSeconds: 1320 };

  it('at the rider’s pace, climb as extra distance', () => {
    // (5.4 km + 30 m / 10 m-per-km) / 18 km/h = 28 min.
    expect(personalRideSeconds(route, MINE)).toBe(28 * 60);
  });

  it('no climb figure counts distance only', () => {
    expect(personalRideSeconds({ ...route, climbMeters: undefined }, MINE)).toBe(18 * 60);
  });

  it('the router’s time, untouched, without a personal pace', () => {
    expect(personalRideSeconds(route, null)).toBe(1320);
    expect(personalRideSeconds(route, DEFAULT)).toBe(1320);
  });

  it('with a router factor: the router’s time scaled to this rider', () => {
    expect(personalRideSeconds(route, { ...MINE, routerFactor: 1.25 })).toBe(1650);
  });

  it('not on a time no router made (a GPX course): the pace instead', () => {
    expect(
      personalRideSeconds({ ...route, routerIsEstimate: true }, { ...MINE, routerFactor: 1.25 }),
    ).toBe(28 * 60);
  });
});
