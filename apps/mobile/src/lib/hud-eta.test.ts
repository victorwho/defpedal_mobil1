import { describe, expect, it } from 'vitest';

import { hudRemainingSeconds } from './hud-eta';

const MINE = { kmh: 18, personal: true, rideCount: 7 };
/** 3 km in 10 min: 18 km/h, past the point the observed speed weighs 0.7. */
const RIDDEN_FAST = { distanceMeters: 3000, movingSeconds: 600 };
const LEG = {
  remainingDistanceMeters: 6000,
  remainingClimbMeters: 0,
  routerSeconds: 1800,
  riddenClimbMeters: 0,
  routerIsEstimate: false,
};

describe('hudRemainingSeconds', () => {
  it('switched off: the router’s time, nothing learned', () => {
    expect(hudRemainingSeconds({ ...LEG, pace: null, ridden: null })).toBe(1800);
  });

  it('before riding, no router factor yet: the router’s time; a course: the rider’s pace', () => {
    const none = { distanceMeters: 0, movingSeconds: 0 };
    expect(hudRemainingSeconds({ ...LEG, pace: MINE, ridden: none })).toBe(1800);
    // 6 km at 18 km/h = 20 min.
    expect(hudRemainingSeconds({ ...LEG, pace: MINE, ridden: none, routerIsEstimate: true })).toBe(1200);
  });

  it('a router factor scales the router’s time, but not a course’s', () => {
    const fast = { ...MINE, routerFactor: 0.8 };
    const none = { distanceMeters: 0, movingSeconds: 0 };
    expect(hudRemainingSeconds({ ...LEG, pace: fast, ridden: none })).toBe(1440);
    expect(hudRemainingSeconds({ ...LEG, pace: fast, ridden: none, routerIsEstimate: true })).toBe(1200);
  });

  it('an e-bike on a course or e-bike loop: a fixed 17 km/h, even with a pace or switched off', () => {
    const none = { distanceMeters: 0, movingSeconds: 0 };
    const leg = { ...LEG, routerIsEstimate: true, ebike: true };
    // 6 km at 17 km/h = 1271 s.
    expect(hudRemainingSeconds({ ...leg, pace: MINE, ridden: none })).toBe(1271);
    expect(hudRemainingSeconds({ ...leg, pace: null, ridden: null })).toBe(1271);
    // A router-timed route is untouched.
    expect(hudRemainingSeconds({ ...LEG, ebike: true, pace: null, ridden: null })).toBe(1800);
  });

  it('during the ride: blends in the speed actually ridden', () => {
    // Router prior 1800 s (e-bike or no pace), ridden 18 km/h -> 1200 s; 0.3/0.7.
    expect(hudRemainingSeconds({ ...LEG, pace: null, ridden: RIDDEN_FAST })).toBe(1380);
  });
});
