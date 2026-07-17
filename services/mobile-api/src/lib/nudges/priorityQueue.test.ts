import { describe, expect, it } from 'vitest';
import type { NudgeWindowContext, UserNudgeProfile } from './eligibility';
import { pickHighestPriorityTrigger } from './priorityQueue';

const baseProfile: UserNudgeProfile = {
  userId: 'user-1',
  hasEmail: true,
  notifyPedalNudges: true,
  notifyStreak: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Europe/Bucharest',
};

const baseWindow: NudgeWindowContext = {
  pushesLast24h: 0,
  badWeatherNow: false,
  afterSunset: false,
  qualifiedStreakToday: false,
};

const NOON_BUCHAREST = new Date('2026-05-25T10:00:00Z');

describe('pickHighestPriorityTrigger', () => {
  it('returns null when no candidates are eligible', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['streak_at_risk_dramatic', 'lapsed_reengagement'],
      profile: { ...baseProfile, hasEmail: false }, // anonymous → all blocked
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBeNull();
    expect(result.considered).toHaveLength(2);
    expect(result.considered.every((c) => !c.result.eligible)).toBe(true);
  });

  it('returns null when candidate list is empty', () => {
    const result = pickHighestPriorityTrigger({
      candidates: [],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBeNull();
    expect(result.considered).toHaveLength(0);
  });

  it('picks P0 milestone over P1 streak-at-risk', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['streak_at_risk_dramatic', 'milestone_celebration'],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBe('milestone_celebration');
  });

  it('picks P1 streak-at-risk_dramatic over P3 streak-at-risk_mild', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['streak_at_risk_mild', 'streak_at_risk_dramatic'],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBe('streak_at_risk_dramatic');
  });

  it('picks the only eligible trigger when most are suppressed', () => {
    // Bad weather suppresses streak-at-risk + daily_ride, but milestone (P0) survives.
    const result = pickHighestPriorityTrigger({
      candidates: [
        'streak_at_risk_dramatic',
        'daily_ride_reminder',
        'milestone_celebration',
      ],
      profile: baseProfile,
      window: { ...baseWindow, badWeatherNow: true, afterSunset: true },
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBe('milestone_celebration');
  });

  it('considered array reflects every candidate', () => {
    const result = pickHighestPriorityTrigger({
      candidates: [
        'streak_at_risk_dramatic',
        'lapsed_reengagement',
        'milestone_celebration',
      ],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.considered.map((c) => c.trigger)).toEqual([
      'streak_at_risk_dramatic',
      'lapsed_reengagement',
      'milestone_celebration',
    ]);
  });

  it('respects daily cap for non-P0 only', () => {
    // Cap hit → only the P0 milestone may fire.
    const result = pickHighestPriorityTrigger({
      candidates: ['streak_at_risk_dramatic', 'milestone_celebration'],
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 2 },
      dailyCap: 2,
      now: NOON_BUCHAREST,
    });
    expect(result.trigger).toBe('milestone_celebration');
  });

  it('tie-break uses TRIGGERS_BY_PRIORITY ordering (stable result)', () => {
    // Two P3 triggers — output must be deterministic across the cron's runs.
    const a = pickHighestPriorityTrigger({
      candidates: ['lapsed_reengagement', 'community_signal'],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    const b = pickHighestPriorityTrigger({
      candidates: ['community_signal', 'lapsed_reengagement'],
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(a.trigger).toBe(b.trigger);
  });
});

describe('pickHighestPriorityTrigger — city_riders_pulse escalation', () => {
  const pulseProfile: UserNudgeProfile = {
    ...baseProfile,
    notifyRidingTips: true,
  };

  it('loses a P3 tie without an override (ambient trigger yields)', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['city_riders_pulse', 'lapsed_reengagement'],
      profile: pulseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    // Both P3 — TRIGGERS_BY_PRIORITY order breaks the tie; city pulse is last.
    expect(result.trigger).toBe('lapsed_reengagement');
  });

  it('wins the slot when escalated to P2 on guarantee breach', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['city_riders_pulse', 'lapsed_reengagement'],
      profile: pulseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
      priorityOverrides: { city_riders_pulse: 2 },
    });
    expect(result.trigger).toBe('city_riders_pulse');
    const pulse = result.considered.find((c) => c.trigger === 'city_riders_pulse');
    expect(pulse?.priority).toBe(2);
  });

  it('still loses to P1 even when escalated', () => {
    const result = pickHighestPriorityTrigger({
      candidates: ['city_riders_pulse', 'streak_at_risk_dramatic'],
      profile: pulseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
      priorityOverrides: { city_riders_pulse: 2 },
    });
    expect(result.trigger).toBe('streak_at_risk_dramatic');
  });
});
