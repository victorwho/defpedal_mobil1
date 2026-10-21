import { describe, expect, it } from 'vitest';

import { hudRemainingSeconds } from './hud-eta';

const MINE = { kmh: 18, personal: true, rideCount: 7 };
/** 3 km in 10 min: 18 km/h, past the point the observed speed weighs 0.7. */
const RIDDEN_FAST = { distanceMeters: 3000, movingSeconds: 600 };
const LEG = { remainingDistanceMeters: 6000, remainingClimbMeters: 0, routerSeconds: 1800, riddenClimbMeters: 0 };

describe('hudRemainingSeconds', () => {
  it('switched off: the router’s time, nothing learned', () => {
    expect(hudRemainingSeconds({ ...LEG, pace: null, ridden: null })).toBe(1800);
  });

  it('before riding: the rider’s pace', () => {
    // 6 km at 18 km/h = 20 min.
    expect(hudRemainingSeconds({ ...LEG, pace: MINE, ridden: { distanceMeters: 0, movingSeconds: 0 } })).toBe(1200);
  });

  it('during the ride: blends in the speed actually ridden', () => {
    // Router prior 1800 s (e-bike or no pace), ridden 18 km/h -> 1200 s; 0.3/0.7.
    expect(hudRemainingSeconds({ ...LEG, pace: null, ridden: RIDDEN_FAST })).toBe(1380);
  });
});
