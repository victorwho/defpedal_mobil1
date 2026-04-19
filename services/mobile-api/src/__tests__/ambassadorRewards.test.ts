// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── dispatchNotification is the side-effecting seam — mock and assert priority
const dispatchNotificationMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/notifications', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotificationMock(...args),
}));

// ── supabaseAdmin — we stub the count query chain that powers the
//    "first 3/day high-priority" bypass. Each test rebuilds the chain with
//    its own mock count.
let todayCount = 0;
const buildChain = () => {
  const headPromise = { count: todayCount, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    contains: vi.fn(() => Promise.resolve(headPromise)),
  };
  return chain;
};
const from = vi.fn(() => buildChain());
vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => from(...args) },
}));

import { dispatchAmbassadorRewardNotification } from '../lib/ambassadorRewards';
import type { ClaimRewardsAll } from '../lib/routeShareService';

const rewardsFactory = (over: Partial<ClaimRewardsAll> = {}): ClaimRewardsAll => ({
  inviteeXpAwarded: 50,
  inviteeNewBadges: [],
  inviterXpAwarded: 100,
  inviterNewBadges: [],
  inviterUserId: 'inviter-uuid-001',
  miaMilestoneAdvanced: false,
  ...over,
});

describe('dispatchAmbassadorRewardNotification', () => {
  beforeEach(() => {
    dispatchNotificationMock.mockClear();
    from.mockClear();
    todayCount = 0;
  });

  it('no-ops when the inviter did not earn anything (monthly cap hit)', async () => {
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory({ inviterXpAwarded: null, inviterNewBadges: [] }),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: 'Bob',
    });
    expect(result.dispatched).toBe(false);
    expect(dispatchNotificationMock).not.toHaveBeenCalled();
  });

  it('no-ops when inviterUserId is empty (defensive)', async () => {
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory({ inviterUserId: '' }),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: 'Bob',
    });
    expect(result.dispatched).toBe(false);
    expect(dispatchNotificationMock).not.toHaveBeenCalled();
  });

  it('sends with priority:high for the first 3 referral pushes of the day', async () => {
    // 0 prior today → bypass
    todayCount = 0;
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory(),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: 'Bob',
    });
    expect(result).toEqual({ dispatched: true, priority: 'high' });
    expect(dispatchNotificationMock).toHaveBeenCalledTimes(1);
    expect(dispatchNotificationMock).toHaveBeenCalledWith(
      'inviter-uuid-001',
      'community',
      expect.objectContaining({
        title: 'Someone joined via your share!',
        body: expect.stringContaining('100 XP'),
        data: expect.objectContaining({ kind: 'referral', deepLink: '/my-shares' }),
      }),
      { priority: 'high' },
    );
  });

  it('still high priority at exactly the 2nd of the day', async () => {
    todayCount = 2;
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory(),
      sharerDisplayName: null,
      inviteeDisplayName: null,
    });
    expect(result.priority).toBe('high');
  });

  it('falls back to priority:normal on the 4th+ referral push of the day', async () => {
    todayCount = 3;
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory(),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: null,
    });
    expect(result.priority).toBe('normal');
  });

  it('includes the badge name in the push body when a new badge was earned', async () => {
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory({
        inviterNewBadges: [
          {
            badgeKey: 'ambassador_bronze',
            name: 'Ambassador',
            flavorText: 'Your first convert. The ripple begins.',
            iconKey: 'ambassador_bronze',
            tier: 1,
          },
        ],
      }),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: 'Bob',
    });
    expect(result.dispatched).toBe(true);
    const [, , payload] = dispatchNotificationMock.mock.calls[0];
    expect(payload.body).toMatch(/Ambassador badge/);
    expect(payload.data.newBadgeKeys).toEqual(['ambassador_bronze']);
  });

  it('dispatches even when inviterXpAwarded is null as long as a new badge fires', async () => {
    // Edge case: monthly cap hit for XP but threshold-crossing badge still
    // awarded. The notification still has something to celebrate.
    const result = await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory({
        inviterXpAwarded: null,
        inviterNewBadges: [
          {
            badgeKey: 'ambassador_silver',
            name: 'Ambassador',
            flavorText: 'Five riders safer because of you.',
            iconKey: 'ambassador_silver',
            tier: 2,
          },
        ],
      }),
      sharerDisplayName: 'Jane',
      inviteeDisplayName: 'Bob',
    });
    expect(result.dispatched).toBe(true);
    const [, , payload] = dispatchNotificationMock.mock.calls[0];
    // No XP suffix in this branch.
    expect(payload.body).not.toMatch(/XP/);
    expect(payload.body).toMatch(/Ambassador badge/);
  });

  it('uses "Someone" when inviteeDisplayName is null', async () => {
    await dispatchAmbassadorRewardNotification({
      rewards: rewardsFactory(),
      sharerDisplayName: null,
      inviteeDisplayName: null,
    });
    const [, , payload] = dispatchNotificationMock.mock.calls[0];
    expect(payload.body.startsWith('Someone ')).toBe(true);
  });
});
