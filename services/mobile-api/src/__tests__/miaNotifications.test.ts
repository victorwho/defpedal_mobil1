/**
 * Mia Notifications — Unit Tests
 *
 * Tests weekly budget check, 6 trigger functions, and the evaluation pipeline.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/notifications', () => ({
  dispatchNotification: (...args: unknown[]) => mockDispatch(...args),
}));

const {
  getMiaWeeklyCount,
  isUnderMiaWeeklyBudget,
  checkFirstRideNudge,
  checkPostFirstRide,
  checkLevelUpAvailable,
  checkWeatherInvitation,
  checkMilestoneApproaching,
  checkLapsedReengagement,
  evaluateMiaNotifications,
} = await import('../lib/miaNotifications');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDb = (overrides: Record<string, unknown> = {}) => {
  const selectMock = vi.fn().mockReturnThis();
  const eqMock = vi.fn().mockReturnThis();
  const ilikeMock = vi.fn().mockReturnThis();
  const gteMock = vi.fn().mockReturnThis();

  const defaultResult = { count: 0, error: null };
  const chainEnd = { ...defaultResult, ...overrides };

  // Create a chain that always returns itself until terminal call
  const chain: any = {
    select: selectMock,
    eq: (...args: any[]) => { eqMock(...args); return chain; },
    ilike: (...args: any[]) => { ilikeMock(...args); return chain; },
    gte: (...args: any[]) => { gteMock(...args); return chain; },
    // Terminal — returns the result
    then: (resolve: (v: any) => void) => resolve(chainEnd),
    count: chainEnd.count,
    error: chainEnd.error,
  };

  // Make it thenable so `await` works
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: any) => void) => resolve(chainEnd),
  });

  const from = vi.fn().mockReturnValue(chain);

  return { from, _chain: chain, _selectMock: selectMock };
};

const makeProfile = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'user-1',
  persona: 'mia',
  mia_journey_level: 1,
  mia_journey_status: 'active',
  mia_total_rides: 0,
  mia_rides_with_destination: 0,
  mia_started_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 3 days ago
  notify_mia: true,
  created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  last_ride_at: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMiaWeeklyCount', () => {
  it('returns 0 when no notifications sent', async () => {
    const db = makeDb({ count: 0 });
    const count = await getMiaWeeklyCount(db as any, 'user-1');
    expect(count).toBe(0);
  });

  it('returns count from database', async () => {
    const db = makeDb({ count: 2 });
    const count = await getMiaWeeklyCount(db as any, 'user-1');
    expect(count).toBe(2);
  });
});

describe('isUnderMiaWeeklyBudget', () => {
  it('returns true when under budget', async () => {
    const db = makeDb({ count: 1 });
    expect(await isUnderMiaWeeklyBudget(db as any, 'user-1')).toBe(true);
  });

  it('returns false when at budget', async () => {
    const db = makeDb({ count: 2 });
    expect(await isUnderMiaWeeklyBudget(db as any, 'user-1')).toBe(false);
  });
});

describe('checkFirstRideNudge', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('sends notification when 48h+ since signup with no rides', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_total_rides: 0 });
    const result = await checkFirstRideNudge(db as any, profile as any);
    expect(result.sent).toBe(true);
    expect(result.template).toBe('first_ride_nudge');
    expect(mockDispatch).toHaveBeenCalledOnce();
  });

  it('skips when user has rides', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_total_rides: 1 });
    const result = await checkFirstRideNudge(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('has_rides');
  });

  it('skips when too early (< 48h)', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({
      mia_started_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24h ago
    });
    const result = await checkFirstRideNudge(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('too_early');
  });

  it('skips when already sent', async () => {
    const db = makeDb({ count: 1 }); // already sent
    const profile = makeProfile();
    const result = await checkFirstRideNudge(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('already_sent');
  });
});

describe('checkPostFirstRide', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('sends 24h after first ride', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({
      mia_total_rides: 1,
      last_ride_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    });
    const result = await checkPostFirstRide(db as any, profile as any);
    expect(result.sent).toBe(true);
  });

  it('skips when not exactly 1 ride', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_total_rides: 2 });
    const result = await checkPostFirstRide(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('not_exactly_one_ride');
  });
});

describe('checkLevelUpAvailable', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('sends when 1 ride away from next level', async () => {
    const db = makeDb({ count: 0 });
    // Level 2 needs 1 ride, user has 0 rides → 1 away? No, LEVEL_THRESHOLDS[3] = 3 rides.
    // At level 2 with 2 rides → 3-2 = 1 ride away from level 3
    const profile = makeProfile({ mia_journey_level: 2, mia_total_rides: 2 });
    const result = await checkLevelUpAvailable(db as any, profile as any);
    expect(result.sent).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith('user-1', 'mia', expect.objectContaining({
      body: expect.stringContaining('Cafe Rider'),
    }));
  });

  it('skips when at max level', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_journey_level: 5 });
    const result = await checkLevelUpAvailable(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('max_level');
  });
});

describe('checkMilestoneApproaching', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('sends when 2 rides away from next level', async () => {
    const db = makeDb({ count: 0 });
    // Level 2 → needs 3 rides for level 3. User has 1 ride → 3-1 = 2 away
    const profile = makeProfile({ mia_journey_level: 2, mia_total_rides: 1 });
    const result = await checkMilestoneApproaching(db as any, profile as any);
    expect(result.sent).toBe(true);
  });

  it('skips when not exactly 2 away', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_journey_level: 2, mia_total_rides: 0 });
    const result = await checkMilestoneApproaching(db as any, profile as any);
    expect(result.sent).toBe(false);
  });
});

describe('checkLapsedReengagement', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('sends when 21+ days since last ride and under max', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({
      mia_total_rides: 2,
      last_ride_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = await checkLapsedReengagement(db as any, profile as any);
    expect(result.sent).toBe(true);
  });

  it('skips when under 21 days', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({
      last_ride_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = await checkLapsedReengagement(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('not_lapsed');
  });

  it('skips when max 2 lapsed already sent', async () => {
    const db = makeDb({ count: 2 });
    const profile = makeProfile({
      last_ride_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = await checkLapsedReengagement(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('max_lapsed_reached');
  });

  it('skips when user never rode', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ last_ride_at: null });
    const result = await checkLapsedReengagement(db as any, profile as any);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('never_rode');
  });
});

describe('evaluateMiaNotifications', () => {
  beforeEach(() => { mockDispatch.mockClear(); });

  it('returns budget_exceeded when over weekly limit', async () => {
    const db = makeDb({ count: 2 }); // at budget
    const profile = makeProfile();
    const results = await evaluateMiaNotifications(db as any, profile as any);
    expect(results).toHaveLength(1);
    expect(results[0].reason).toBe('weekly_budget_exceeded');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('stops after first successful send', async () => {
    const db = makeDb({ count: 0 });
    const profile = makeProfile({ mia_total_rides: 0 }); // triggers first_ride_nudge
    const results = await evaluateMiaNotifications(db as any, profile as any);
    const sentResults = results.filter((r) => r.sent);
    expect(sentResults).toHaveLength(1);
    expect(sentResults[0].template).toBe('first_ride_nudge');
  });
});
