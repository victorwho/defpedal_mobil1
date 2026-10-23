import { describe, expect, it } from 'vitest';

import { adaptiveRemainingSeconds, riddenSoFar } from './adaptiveEta';

/**
 * Synthetic trails: a fix every 2 s riding due north, as the app samples.
 * No recorded production trail is used here; the stop shapes (a short wait
 * at lights, a long cafe stop with GPS jitter) are built to match what the
 * sampler produces when the rider stands still.
 */
const DEG_PER_METER = 1 / 111_195;
const START = Date.parse('2026-10-21T08:00:00Z');

type Crumb = { lat: number; lon: number; ts: number };

const trail = (legs: ReadonlyArray<{ mps: number; seconds: number }>): Crumb[] => {
  const crumbs: Crumb[] = [];
  let meters = 0;
  let t = 0;
  for (const leg of legs) {
    for (let s = 0; s < leg.seconds; s += 2) {
      // Standing still still wobbles a few metres.
      const jitter = leg.mps === 0 ? ((s / 2) % 3) - 1 : 0;
      crumbs.push({ lat: 44.4 + (meters + jitter * 3) * DEG_PER_METER, lon: 26.1, ts: START + t * 1000 });
      meters += leg.mps * 2;
      t += 2;
    }
  }
  return crumbs;
};

describe('riddenSoFar', () => {
  it('a steady ride: distance and the whole time', () => {
    const r = riddenSoFar(trail([{ mps: 5, seconds: 600 }]));
    expect(r.distanceMeters).toBeCloseTo(2990, -1);
    expect(r.movingSeconds).toBeCloseTo(598, 0);
  });

  it('a minute at lights stays in the riding time', () => {
    const r = riddenSoFar(
      trail([{ mps: 5, seconds: 300 }, { mps: 0, seconds: 60 }, { mps: 5, seconds: 300 }]),
    );
    expect(r.movingSeconds).toBeGreaterThan(650);
  });

  it('a ten-minute cafe stop comes out of it', () => {
    const r = riddenSoFar(
      trail([{ mps: 5, seconds: 300 }, { mps: 0, seconds: 600 }, { mps: 5, seconds: 300 }]),
    );
    expect(r.movingSeconds).toBeLessThan(620);
    expect(r.movingSeconds).toBeGreaterThan(590);
  });
});

describe('adaptiveRemainingSeconds', () => {
  const base = { remainingDistanceMeters: 6000, remainingClimbMeters: 0, priorSeconds: 1800, riddenClimbMeters: 0 };

  it('nothing ridden yet: the prior estimate', () => {
    const ridden = { distanceMeters: 150, movingSeconds: 40 };
    expect(adaptiveRemainingSeconds({ ...base, ridden })).toBe(1800);
  });

  it('after 3 km the observed speed carries 0.7 of the estimate', () => {
    // 3 km in 600 s = 5 m/s, so 6 km more is 1200 s; 0.3 x 1800 + 0.7 x 1200.
    const ridden = { distanceMeters: 3000, movingSeconds: 600 };
    expect(adaptiveRemainingSeconds({ ...base, ridden })).toBeCloseTo(1380, 5);
  });

  it('the weight grows with distance: half of it at 1.5 km', () => {
    const ridden = { distanceMeters: 1500, movingSeconds: 300 };
    expect(adaptiveRemainingSeconds({ ...base, ridden })).toBeCloseTo(0.65 * 1800 + 0.35 * 1200, 5);
  });

  it('climb ridden is credited back, climb ahead is charged', () => {
    // 3 km + 180 m climb (= 3 flat km) in 600 s: 10 m/s on the flat.
    const ridden = { distanceMeters: 3000, movingSeconds: 600 };
    const flatAhead = adaptiveRemainingSeconds({ ...base, ridden, riddenClimbMeters: 180 });
    expect(flatAhead).toBeCloseTo(0.3 * 1800 + 0.7 * 600, 5);
    const hillAhead = adaptiveRemainingSeconds({
      ...base,
      ridden,
      riddenClimbMeters: 180,
      remainingClimbMeters: 360,
    });
    expect(hillAhead).toBeCloseTo(0.3 * 1800 + 0.7 * 1200, 5);
  });
});
