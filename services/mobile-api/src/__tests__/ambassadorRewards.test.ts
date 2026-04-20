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

// ---------------------------------------------------------------------------
// Slice 8: dispatchFirstViewNotification
// ---------------------------------------------------------------------------

import { dispatchFirstViewNotification } from '../lib/ambassadorRewards';

describe('dispatchFirstViewNotification', () => {
  beforeEach(() => {
    dispatchNotificationMock.mockClear();
    from.mockClear();
    todayCount = 0;
  });

  it('no-ops when sharerUserId is empty', async () => {
    const result = await dispatchFirstViewNotification({
      sharerUserId: '',
      shortCode: 'abcd1234',
    });
    expect(result.dispatched).toBe(false);
    expect(dispatchNotificationMock).not.toHaveBeenCalled();
  });

  it('sends with priority:high for the first 3 first-view pushes of the day', async () => {
    todayCount = 0;
    const result = await dispatchFirstViewNotification({
      sharerUserId: 'sharer-uuid-001',
      shortCode: 'abcd1234',
    });
    expect(result).toEqual({ dispatched: true, priority: 'high' });
    expect(dispatchNotificationMock).toHaveBeenCalledWith(
      'sharer-uuid-001',
      'community',
      expect.objectContaining({
        title: 'Someone just opened your shared route',
        data: expect.objectContaining({
          kind: 'referral_view',
          shortCode: 'abcd1234',
          deepLink: '/my-shares',
        }),
      }),
      { priority: 'high' },
    );
  });

  it('falls back to priority:normal on the 4th+ first-view push of the day', async () => {
    todayCount = 3;
    const result = await dispatchFirstViewNotification({
      sharerUserId: 'sharer-uuid-002',
      shortCode: 'xyz00001',
    });
    expect(result.priority).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// Slice 8: isBotUserAgent
// ---------------------------------------------------------------------------

import { isBotUserAgent } from '../lib/routeShareService';

describe('isBotUserAgent', () => {
  it('flags empty / missing UAs as bots', () => {
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent('')).toBe(true);
    expect(isBotUserAgent('   ')).toBe(true);
  });

  it.each([
    ['Googlebot/2.1 (+http://www.google.com/bot.html)'],
    ['Mozilla/5.0 (compatible; Bingbot/2.0)'],
    ['facebookexternalhit/1.1'],
    ['Twitterbot/1.0'],
    ['Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['WhatsApp/2.19.81 A'],
    ['curl/7.68.0'],
    ['wget/1.20.3'],
    ['python-requests/2.28.1'],
    ['node-fetch/1.0 (+https://github.com/bitinn/node-fetch)'],
    ['axios/0.21.1'],
    ['Mozilla/5.0 (Linux; Android 10) HeadlessChrome/90.0'],
  ])('flags "%s" as a bot', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'],
  ])('does NOT flag "%s" as a bot', (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});
