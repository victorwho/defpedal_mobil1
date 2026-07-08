import { describe, expect, it } from 'vitest';
import {
  currentHHMMInTimezone,
  evaluateEligibility,
  isInQuietHours,
  type UserNudgeProfile,
  type NudgeWindowContext,
} from './eligibility';

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

// Fixed "now" inside the daytime window (noon Bucharest = 10:00 UTC in winter,
// 09:00 UTC in summer). We pick a UTC clock that is 12:00 in Bucharest year-round
// regardless of DST by setting noon LOCAL — Intl handles the conversion.
// Use 2026-05-25T10:00:00Z which is 13:00 in Bucharest (CEST, UTC+3).
const NOON_BUCHAREST = new Date('2026-05-25T10:00:00Z');
// Midnight Bucharest in CEST = 21:00 UTC the prior day.
const MIDNIGHT_BUCHAREST = new Date('2026-05-25T21:00:00Z');

describe('isInQuietHours — overnight window', () => {
  it('matches inside the overnight window (22:30 → 22:00–07:00)', () => {
    expect(isInQuietHours('22:30', '22:00', '07:00')).toBe(true);
  });
  it('matches at the start edge (22:00)', () => {
    expect(isInQuietHours('22:00', '22:00', '07:00')).toBe(true);
  });
  it('does not match at the end edge (07:00)', () => {
    expect(isInQuietHours('07:00', '22:00', '07:00')).toBe(false);
  });
  it('matches at 03:00 inside the overnight window', () => {
    expect(isInQuietHours('03:00', '22:00', '07:00')).toBe(true);
  });
  it('does not match midday', () => {
    expect(isInQuietHours('13:00', '22:00', '07:00')).toBe(false);
  });
});

describe('isInQuietHours — same-day window', () => {
  it('matches inside same-day (13:00 → 12:00–14:00)', () => {
    expect(isInQuietHours('13:00', '12:00', '14:00')).toBe(true);
  });
  it('does not match outside same-day', () => {
    expect(isInQuietHours('15:00', '12:00', '14:00')).toBe(false);
  });
  it('returns false when start === end (no window)', () => {
    expect(isInQuietHours('13:00', '13:00', '13:00')).toBe(false);
  });
});

describe('currentHHMMInTimezone', () => {
  it('formats noon Bucharest correctly during CEST', () => {
    expect(currentHHMMInTimezone('Europe/Bucharest', NOON_BUCHAREST)).toBe('13:00');
  });
  it('formats midnight Bucharest correctly', () => {
    expect(currentHHMMInTimezone('Europe/Bucharest', MIDNIGHT_BUCHAREST)).toBe('00:00');
  });
});

describe('evaluateEligibility — anonymous gate', () => {
  it('rejects anonymous (no email) for every trigger', () => {
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: { ...baseProfile, hasEmail: false },
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_anonymous');
  });
});

describe('evaluateEligibility — master opt-out (audit 2026-07-05 UX-14)', () => {
  it('rejects EVERY trigger when notifyPedalNudges is false — including P0 celebrations', () => {
    for (const [trigger, priority] of [
      ['post_ride_celebration', 0],
      ['post_hazard_thanks', 0],
      ['milestone_celebration', 0],
      ['streak_at_risk_dramatic', 1],
      ['daily_ride_reminder', 2],
      ['lapsed_reengagement', 3],
      ['community_signal', 3],
    ] as const) {
      const result = evaluateEligibility({
        trigger,
        priority,
        profile: { ...baseProfile, notifyPedalNudges: false },
        window: baseWindow,
        now: NOON_BUCHAREST,
      });
      expect(result.eligible).toBe(false);
      expect(result.outcome).toBe('suppressed_category_pref');
    }
  });
  it('anonymous suppression still wins over the master switch (ordering)', () => {
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: { ...baseProfile, hasEmail: false, notifyPedalNudges: false },
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.outcome).toBe('suppressed_anonymous');
  });
});

describe('evaluateEligibility — category opt-out', () => {
  it('rejects streak-at-risk when notifyStreak is false', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: { ...baseProfile, notifyStreak: false },
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_category_pref');
  });
  it('rejects milestone when notifyStreak is false', () => {
    const result = evaluateEligibility({
      trigger: 'milestone_celebration',
      priority: 0,
      profile: { ...baseProfile, notifyStreak: false },
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_category_pref');
  });
  it('does NOT reject post_ride_celebration on notifyStreak=false', () => {
    // post_ride is its own surface, not the streak-category surface.
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: { ...baseProfile, notifyStreak: false },
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
});

describe('evaluateEligibility — qualified-already short-circuit', () => {
  it('suppresses streak-at-risk_mild if qualified today', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_mild',
      priority: 3,
      profile: baseProfile,
      window: { ...baseWindow, qualifiedStreakToday: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_qualified_already');
  });
  it('suppresses streak-at-risk_dramatic if qualified today', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: { ...baseWindow, qualifiedStreakToday: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_qualified_already');
  });
  it('does NOT short-circuit milestone or apology when qualified', () => {
    const m = evaluateEligibility({
      trigger: 'milestone_celebration',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, qualifiedStreakToday: true },
      now: NOON_BUCHAREST,
    });
    expect(m.eligible).toBe(true);

    const a = evaluateEligibility({
      trigger: 'streak_lost_apology',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, qualifiedStreakToday: true },
      now: NOON_BUCHAREST,
    });
    expect(a.eligible).toBe(true);
  });
});

describe('evaluateEligibility — P0 bypass governance', () => {
  it('P0 post_ride sends through quiet hours', () => {
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: baseProfile,
      window: baseWindow,
      now: MIDNIGHT_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
  it('P0 post_ride sends through bad weather + after sunset', () => {
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, badWeatherNow: true, afterSunset: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
  it('P0 post_ride sends through daily cap exceeded', () => {
    const result = evaluateEligibility({
      trigger: 'post_ride_celebration',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 99 },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });

  // Review 2026-06-12: cron-sourced P0 (milestone backstop) must respect
  // quiet hours so it never buzzes overnight, while keeping the cap + safety
  // bypass and while real-time P0 still bypasses everything.
  it('cron P0 (enforceQuietHours) is suppressed during quiet hours', () => {
    const result = evaluateEligibility({
      trigger: 'milestone_celebration',
      priority: 0,
      profile: baseProfile,
      window: baseWindow,
      enforceQuietHours: true,
      now: MIDNIGHT_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_quiet_hours');
  });
  it('cron P0 (enforceQuietHours) still bypasses cap + safety outside quiet hours', () => {
    const result = evaluateEligibility({
      trigger: 'milestone_celebration',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 99, badWeatherNow: true, afterSunset: true },
      enforceQuietHours: true,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
});

describe('evaluateEligibility — safety gating', () => {
  it('suppresses streak-at-risk during bad weather', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: { ...baseWindow, badWeatherNow: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_weather');
  });
  it('suppresses streak-at-risk after sunset', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: { ...baseWindow, afterSunset: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_sunset');
  });
  it('suppresses daily_ride_reminder during bad weather', () => {
    const result = evaluateEligibility({
      trigger: 'daily_ride_reminder',
      priority: 2,
      profile: baseProfile,
      window: { ...baseWindow, badWeatherNow: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_weather');
  });
  it('does NOT safety-gate post-loss apology', () => {
    // The apology is a celebration of a completed action — it doesn't
    // ask for a ride, so weather/sunset don't apply.
    const result = evaluateEligibility({
      trigger: 'streak_lost_apology',
      priority: 0,
      profile: baseProfile,
      window: { ...baseWindow, badWeatherNow: true, afterSunset: true },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
});

describe('evaluateEligibility — quiet hours apply to non-P0', () => {
  it('suppresses lapsed_reengagement during 22:00–07:00', () => {
    const result = evaluateEligibility({
      trigger: 'lapsed_reengagement',
      priority: 3,
      profile: baseProfile,
      window: baseWindow,
      now: MIDNIGHT_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_quiet_hours');
  });
  it('allows daily_ride_reminder outside quiet hours', () => {
    const result = evaluateEligibility({
      trigger: 'daily_ride_reminder',
      priority: 2,
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
});

describe('evaluateEligibility — daily cap', () => {
  it('suppresses non-P0 when pushesLast24h >= cap', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 2 },
      dailyCap: 2,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_cap');
  });
  it('allows non-P0 when under the cap', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 1 },
      dailyCap: 2,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
  });
  it('uses default cap = 2 when not supplied', () => {
    const result = evaluateEligibility({
      trigger: 'lapsed_reengagement',
      priority: 3,
      profile: baseProfile,
      window: { ...baseWindow, pushesLast24h: 2 },
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(false);
    expect(result.outcome).toBe('suppressed_cap');
  });
});

describe('evaluateEligibility — happy path', () => {
  it('returns eligible for a healthy P1 trigger', () => {
    const result = evaluateEligibility({
      trigger: 'streak_at_risk_dramatic',
      priority: 1,
      profile: baseProfile,
      window: baseWindow,
      now: NOON_BUCHAREST,
    });
    expect(result.eligible).toBe(true);
    expect(result.outcome).toBe('eligible');
  });
});
