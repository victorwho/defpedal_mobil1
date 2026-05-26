import { describe, expect, it } from 'vitest';
import {
  STREAK_MILESTONES,
  STREAK_TIERS,
  didTierAdvance,
  getNextMilestone,
  getTierForStreak,
  isMilestoneDay,
} from './streakTiers';

describe('getTierForStreak — boundary mapping', () => {
  it('returns kindling for 0 days (dormant)', () => {
    expect(getTierForStreak(0).tier).toBe('kindling');
  });

  it('returns kindling for day 1 (first day)', () => {
    expect(getTierForStreak(1).tier).toBe('kindling');
  });

  it('returns kindling for day 6 (upper edge)', () => {
    expect(getTierForStreak(6).tier).toBe('kindling');
  });

  it('returns spark for day 7 (lower edge)', () => {
    expect(getTierForStreak(7).tier).toBe('spark');
  });

  it('returns spark for day 20 (upper edge)', () => {
    expect(getTierForStreak(20).tier).toBe('spark');
  });

  it('returns commute for day 21 (lower edge)', () => {
    expect(getTierForStreak(21).tier).toBe('commute');
  });

  it('returns commute for day 41 (upper edge)', () => {
    expect(getTierForStreak(41).tier).toBe('commute');
  });

  it('returns endurance for day 42 (lower edge)', () => {
    expect(getTierForStreak(42).tier).toBe('endurance');
  });

  it('returns endurance for day 87 (upper edge)', () => {
    expect(getTierForStreak(87).tier).toBe('endurance');
  });

  it('returns binary for day 88 (lower edge)', () => {
    expect(getTierForStreak(88).tier).toBe('binary');
  });

  it('returns binary for day 99 (upper edge)', () => {
    expect(getTierForStreak(99).tier).toBe('binary');
  });

  it('returns century for day 100', () => {
    expect(getTierForStreak(100).tier).toBe('century');
  });

  it('returns century for day 364 (upper edge)', () => {
    expect(getTierForStreak(364).tier).toBe('century');
  });

  it('returns legend for day 365 (lower edge)', () => {
    expect(getTierForStreak(365).tier).toBe('legend');
  });

  it('returns legend for very large streak (10_000)', () => {
    expect(getTierForStreak(10000).tier).toBe('legend');
  });
});

describe('getTierForStreak — defensive handling', () => {
  it('returns kindling for negative input', () => {
    expect(getTierForStreak(-5).tier).toBe('kindling');
  });

  it('returns kindling for NaN', () => {
    expect(getTierForStreak(Number.NaN).tier).toBe('kindling');
  });

  it('returns kindling for Infinity (coerced from non-finite to dormant)', () => {
    // Infinity is non-finite so we coerce to 0 → kindling. By design: we
    // never want a junk value to surface "legend" tier rendering.
    expect(getTierForStreak(Number.POSITIVE_INFINITY).tier).toBe('kindling');
  });

  it('floors fractional days', () => {
    expect(getTierForStreak(6.9).tier).toBe('kindling');
    expect(getTierForStreak(7.0).tier).toBe('spark');
  });
});

describe('Tier metadata is internally consistent', () => {
  it('each tier carries a flame color and pose', () => {
    for (const t of STREAK_TIERS) {
      expect(t.flameColor).toBeTruthy();
      expect(t.mascotPose).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });

  it('tier ranges are contiguous and non-overlapping', () => {
    for (let i = 1; i < STREAK_TIERS.length; i++) {
      const prev = STREAK_TIERS[i - 1]!;
      const curr = STREAK_TIERS[i]!;
      // Previous tier's max + 1 should equal current tier's min.
      expect(prev.maxDays).not.toBeNull();
      expect(curr.minDays).toBe((prev.maxDays as number) + 1);
    }
  });

  it('last tier is open-ended', () => {
    expect(STREAK_TIERS[STREAK_TIERS.length - 1]!.maxDays).toBeNull();
  });
});

describe('isMilestoneDay', () => {
  it('returns true for each milestone in the locked ladder', () => {
    for (const day of STREAK_MILESTONES) {
      expect(isMilestoneDay(day)).toBe(true);
    }
  });

  it('returns false for non-milestone days', () => {
    expect(isMilestoneDay(1)).toBe(false);
    expect(isMilestoneDay(8)).toBe(false);
    expect(isMilestoneDay(89)).toBe(false);
    expect(isMilestoneDay(366)).toBe(false);
  });

  it('returns false for negative / NaN', () => {
    expect(isMilestoneDay(-1)).toBe(false);
    expect(isMilestoneDay(Number.NaN)).toBe(false);
  });
});

describe('getNextMilestone', () => {
  it('returns 7 for day 0 / 1 / 6', () => {
    expect(getNextMilestone(0)).toBe(7);
    expect(getNextMilestone(1)).toBe(7);
    expect(getNextMilestone(6)).toBe(7);
  });

  it('returns 21 when between 7 and 21', () => {
    expect(getNextMilestone(7)).toBe(21);
    expect(getNextMilestone(20)).toBe(21);
  });

  it('returns next milestone in the ladder', () => {
    expect(getNextMilestone(21)).toBe(30);
    expect(getNextMilestone(30)).toBe(42);
    expect(getNextMilestone(42)).toBe(88);
    expect(getNextMilestone(88)).toBe(100);
    expect(getNextMilestone(100)).toBe(365);
  });

  it('returns null past the final milestone', () => {
    expect(getNextMilestone(365)).toBeNull();
    expect(getNextMilestone(1000)).toBeNull();
  });
});

describe('didTierAdvance', () => {
  it('detects advance from kindling to spark', () => {
    expect(didTierAdvance(6, 7)).toBe(true);
  });

  it('detects advance from spark to commute', () => {
    expect(didTierAdvance(20, 21)).toBe(true);
  });

  it('detects advance into legend', () => {
    expect(didTierAdvance(364, 365)).toBe(true);
  });

  it('returns false for same-tier increments', () => {
    expect(didTierAdvance(1, 2)).toBe(false);
    expect(didTierAdvance(8, 9)).toBe(false);
    expect(didTierAdvance(100, 200)).toBe(false);
  });

  it('returns false for non-increasing transitions', () => {
    expect(didTierAdvance(7, 7)).toBe(false);
    expect(didTierAdvance(7, 6)).toBe(false);
  });
});
