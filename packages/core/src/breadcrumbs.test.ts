import { describe, expect, it } from 'vitest';

import {
  isPlausibleStep,
  MAX_CYCLING_SPEED_MPS,
  MAX_SEGMENT_METERS,
  sanitizeBreadcrumbs,
} from './breadcrumbs';

// Reference points used across the suite.
const BUCHAREST = { lat: 44.4268, lon: 26.1025 };
const MADRID = { lat: 40.4168, lon: -3.7038 };
const MADRID_1KM_N = { lat: 40.4268, lon: -3.7038 }; // ~1.1 km north of MADRID

describe('isPlausibleStep', () => {
  it('accepts a normal cycling step (no timestamps → distance gate)', () => {
    expect(isPlausibleStep(MADRID, MADRID_1KM_N)).toBe(true);
  });

  it('rejects an inter-city jump (no timestamps → distance gate)', () => {
    expect(isPlausibleStep(MADRID, BUCHAREST)).toBe(false);
  });

  it('rejects a jump that exceeds the cycling speed ceiling', () => {
    const base = 1_700_000_000_000;
    // 2,470 km in 2 s is wildly over MAX_CYCLING_SPEED_MPS.
    expect(
      isPlausibleStep(
        { ...MADRID, ts: base },
        { ...BUCHAREST, ts: base + 2_000 },
      ),
    ).toBe(false);
  });

  it('accepts a long but slow gap when timestamps justify it', () => {
    const base = 1_700_000_000_000;
    // ~1.1 km over 220 s ≈ 5 m/s — a plausible signal-gap segment.
    expect(
      isPlausibleStep(
        { ...MADRID, ts: base },
        { ...MADRID_1KM_N, ts: base + 220_000 },
      ),
    ).toBe(true);
  });

  it('uses the distance cap, not speed, when timestamps are missing', () => {
    // A 60 km segment without timestamps is treated as an outlier (> 50 km cap).
    expect(MAX_SEGMENT_METERS).toBe(50_000);
    expect(MAX_CYCLING_SPEED_MPS).toBe(30);
  });
});

describe('sanitizeBreadcrumbs', () => {
  it('returns the trail unchanged when every step is plausible', () => {
    const trail = [MADRID, MADRID_1KM_N];
    expect(sanitizeBreadcrumbs(trail)).toEqual(trail);
  });

  it('trims a stale fix at the head of the trail (the reported bug)', () => {
    const trail = [BUCHAREST, MADRID, MADRID_1KM_N];
    expect(sanitizeBreadcrumbs(trail)).toEqual([MADRID, MADRID_1KM_N]);
  });

  it('skips a cached fix injected mid-ride without losing real points after it', () => {
    const trail = [MADRID, BUCHAREST, MADRID_1KM_N];
    // BUCHAREST is dropped; MADRID_1KM_N is measured against MADRID, not BUCHAREST.
    expect(sanitizeBreadcrumbs(trail)).toEqual([MADRID, MADRID_1KM_N]);
  });

  it('drops fixes stamped before the ride began', () => {
    const startedAtMs = 1_700_000_100_000;
    const trail = [
      { ...BUCHAREST, ts: startedAtMs - 60_000 }, // captured a minute before start
      { ...MADRID, ts: startedAtMs + 1_000 },
      { ...MADRID_1KM_N, ts: startedAtMs + 221_000 },
    ];
    const result = sanitizeBreadcrumbs(trail, startedAtMs);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject(MADRID);
    expect(result[1]).toMatchObject(MADRID_1KM_N);
  });

  it('preserves a legitimately empty or single-point trail', () => {
    expect(sanitizeBreadcrumbs([])).toEqual([]);
    expect(sanitizeBreadcrumbs([MADRID])).toEqual([MADRID]);
  });
});
