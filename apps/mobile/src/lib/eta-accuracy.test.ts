import type { NavigationSession, RouteOption } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { etaAccuracyProperties, type EtaAccuracyInput } from './eta-accuracy';

const START = Date.parse('2026-10-21T08:00:00Z');
const MINE = { kmh: 18, personal: true, rideCount: 7 };

/** 6 km flat, router 24 min; ridden in 20 min. */
const input = (overrides: Partial<EtaAccuracyInput> = {}): EtaAccuracyInput => ({
  session: { startedAt: new Date(START).toISOString(), rerouteCount: 0 } as NavigationSession,
  route: { distanceMeters: 6000, totalClimbMeters: 0, adjustedDurationSeconds: 1440 } as RouteOption,
  riderPaces: { normal: MINE, ebike: { kmh: 15, personal: false, rideCount: 0 } },
  paceEtaEnabled: true,
  bikeTypeId: 'city',
  isEbike: false,
  nowMs: START + 20 * 60_000,
  ...overrides,
});

describe('etaAccuracyProperties', () => {
  it('records the router, personal and actual times', () => {
    // No router factor yet: the router's time stands.
    expect(etaAccuracyProperties(input())).toEqual({
      method: 'router',
      router_seconds: 1440,
      personal_seconds: 1440,
      actual_seconds: 1200,
      distance_meters: 6000,
      pace_ride_count: 7,
      is_ebike: 0,
      ebike_routing: 0,
    });
  });

  it('a router factor: method factor, the router time scaled', () => {
    const props = etaAccuracyProperties(
      input({ riderPaces: { normal: { ...MINE, routerFactor: 0.9 }, ebike: MINE } }),
    );
    expect(props).toMatchObject({ method: 'factor', personal_seconds: 1296 });
  });

  it('a GPX course: the factor does not scale its fixed-speed time', () => {
    const route = {
      source: 'gpx_course',
      distanceMeters: 6000,
      totalClimbMeters: 0,
      adjustedDurationSeconds: 1440,
    } as RouteOption;
    const props = etaAccuracyProperties(
      input({ route, riderPaces: { normal: { ...MINE, routerFactor: 0.9 }, ebike: MINE } }),
    );
    expect(props).toMatchObject({ method: 'pace', personal_seconds: 1200 }); // 6 km at 18 km/h
  });

  it('E-bike routing mode alone does not change the pace: the bike is the Profile one', () => {
    const riderPaces = { normal: { ...MINE, routerFactor: 0.9 }, ebike: MINE };
    expect(etaAccuracyProperties(input({ isEbike: true, riderPaces }))).toMatchObject({
      method: 'factor',
      is_ebike: 0,
      ebike_routing: 1,
    });
  });

  it('nothing for a rerouted ride: the prediction was for another route', () => {
    const session = { startedAt: new Date(START).toISOString(), rerouteCount: 1 } as NavigationSession;
    expect(etaAccuracyProperties(input({ session }))).toBeNull();
  });

  it('E-bike in Profile with no e-bike rides, or switched off: the router time', () => {
    for (const o of [{ bikeTypeId: 'ebike' }, { paceEtaEnabled: false }]) {
      const props = etaAccuracyProperties(input(o));
      expect(props).toMatchObject({ method: 'router', personal_seconds: 1440 });
    }
  });
});
