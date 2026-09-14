import { describe, expect, it } from 'vitest';

import {
  PLAN_MIN_INTERVAL_MS,
  buildPlanKey,
  rememberPlan,
  shouldRecordPlan,
  type PlanMemory,
} from './routePlanTelemetry';

const BRASOV = { originLat: 45.6570, originLon: 25.6010 };
const DEST = { destLat: 44.4268, destLon: 26.1025 };

describe('buildPlanKey', () => {
  it('is stable for the same origin and destination', () => {
    expect(buildPlanKey({ ...BRASOV, ...DEST })).toBe(buildPlanKey({ ...BRASOV, ...DEST }));
  });

  it('absorbs GPS jitter below ~11 m on the origin', () => {
    // The preview remounts with a slightly different fix; that is the same
    // planning intent, not a new one.
    const a = buildPlanKey({ ...BRASOV, ...DEST });
    const b = buildPlanKey({ originLat: 45.65701, originLon: 25.60104, ...DEST });
    expect(a).toBe(b);
  });

  it('separates genuinely different destinations', () => {
    const a = buildPlanKey({ ...BRASOV, ...DEST });
    const b = buildPlanKey({ ...BRASOV, destLat: 46.7712, destLon: 23.6236 });
    expect(a).not.toBe(b);
  });
});

describe('shouldRecordPlan', () => {
  it('records a key never seen before', () => {
    expect(shouldRecordPlan('k', {}, 1_000)).toBe(true);
  });

  it('suppresses the same plan inside the window', () => {
    // The behaviour that keeps the count honest: cycling Safe -> Fast -> Flat
    // refetches the preview three times for ONE planning intent.
    const seen: PlanMemory = { k: 1_000 };
    expect(shouldRecordPlan('k', seen, 1_000 + PLAN_MIN_INTERVAL_MS - 1)).toBe(false);
  });

  it('records the same plan again once the window has passed', () => {
    const seen: PlanMemory = { k: 1_000 };
    expect(shouldRecordPlan('k', seen, 1_000 + PLAN_MIN_INTERVAL_MS)).toBe(true);
  });

  it('records when the clock jumps backwards rather than locking out', () => {
    const seen: PlanMemory = { k: 10_000 };
    expect(shouldRecordPlan('k', seen, 5_000)).toBe(true);
  });
});

describe('rememberPlan', () => {
  it('does not mutate the memory it is given', () => {
    const seen: PlanMemory = { a: 1 };
    const next = rememberPlan('b', seen, 2);
    expect(seen).toEqual({ a: 1 });
    expect(next).toEqual({ a: 1, b: 2 });
  });

  it('evicts the oldest entries past the cap', () => {
    let seen: PlanMemory = {};
    for (let i = 0; i < 5; i += 1) {
      seen = rememberPlan(`k${i}`, seen, i, 3);
    }
    expect(Object.keys(seen).sort()).toEqual(['k2', 'k3', 'k4']);
  });

  it('keeps the newest entry when evicting', () => {
    const seen: PlanMemory = { old: 1, mid: 2 };
    const next = rememberPlan('new', seen, 3, 2);
    expect(next.new).toBe(3);
    expect(next.old).toBeUndefined();
  });
});
