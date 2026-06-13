import { describe, expect, it } from 'vitest';

import {
  CELEBRATION_PRIORITY,
  INITIAL_CELEBRATION_WANTS,
  resolveActiveCelebration,
  type CelebrationWants,
} from '../celebrationStage';

const wants = (overrides: Partial<CelebrationWants>): CelebrationWants => ({
  ...INITIAL_CELEBRATION_WANTS,
  ...overrides,
});

describe('resolveActiveCelebration', () => {
  it('returns null when nothing wants the stage', () => {
    expect(resolveActiveCelebration(null, INITIAL_CELEBRATION_WANTS)).toBeNull();
  });

  it('grants the stage to the highest-priority wanter on a same-tick race', () => {
    expect(
      resolveActiveCelebration(null, wants({ badge: true, rankup: true, meetpedal: true })),
    ).toBe('badge');
    expect(
      resolveActiveCelebration(null, wants({ rankup: true, meetpedal: true })),
    ).toBe('rankup');
    expect(
      resolveActiveCelebration(null, wants({ meetpedal: true })),
    ).toBe('meetpedal');
  });

  it('is sticky — does not preempt a showing overlay with a later higher-priority one', () => {
    // meetpedal holds the stage; a badge becomes available afterwards.
    expect(
      resolveActiveCelebration('meetpedal', wants({ badge: true, meetpedal: true })),
    ).toBe('meetpedal');
  });

  it('hands the stage to the next-highest wanter once the holder stops wanting', () => {
    // badge was showing, now dismissed (badge:false); rankup + meetpedal queued.
    expect(
      resolveActiveCelebration('badge', wants({ rankup: true, meetpedal: true })),
    ).toBe('rankup');
  });

  it('releases the stage to null when the holder stops wanting and nobody else does', () => {
    expect(resolveActiveCelebration('badge', INITIAL_CELEBRATION_WANTS)).toBeNull();
  });

  it('keeps the holder while it still wants, ignoring lower-priority wanters', () => {
    expect(
      resolveActiveCelebration('rankup', wants({ rankup: true, meetpedal: true })),
    ).toBe('rankup');
  });

  it('orders priority badge > rankup > meetpedal', () => {
    expect(CELEBRATION_PRIORITY).toEqual(['badge', 'rankup', 'meetpedal']);
  });
});
