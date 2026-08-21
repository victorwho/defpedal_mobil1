// Post-purchase entitlement refresh.
//
// This exists because a store purchase returns as soon as Google takes payment,
// while our entitlement arrives via RevenueCat's server-to-server webhook a
// moment later. Without the poll a rider pays and sees no change until the next
// cold start — the "I paid and nothing happened" report.
//
// The other property worth pinning: a FAILED refresh must never be read as
// "free". Revoking someone's features over one bad request is worse than
// showing stale Plus for a few seconds.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProfile } = vi.hoisted(() => ({ getProfile: vi.fn() }));
vi.mock('./api', () => ({ mobileApi: { getProfile } }));

import { useAppStore } from '../store/appStore';
import {
  awaitPremiumActivation,
  PREMIUM_ACTIVATION_DELAYS_MS,
  refreshPremiumEntitlement,
} from './premiumRefresh';

const premium = (tier: 'free' | 'plus') => ({
  tier,
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: false,
  expiresAt: tier === 'plus' ? '2026-09-20T00:00:00.000Z' : null,
  uiEnabled: true,
});

beforeEach(() => {
  useAppStore.getState().clearPremiumState();
  getProfile.mockReset();
});

describe('refreshPremiumEntitlement', () => {
  it('stores the premium block and returns the tier', async () => {
    getProfile.mockResolvedValue({ premium: premium('plus') });
    expect(await refreshPremiumEntitlement()).toBe('plus');
    expect(useAppStore.getState().premiumSnapshot?.tier).toBe('plus');
  });

  it('returns null on a failed request and leaves the cache untouched', async () => {
    // Treating a network failure as "free" would revoke a paying rider's
    // features over one bad request.
    getProfile.mockResolvedValue({ premium: premium('plus') });
    await refreshPremiumEntitlement();

    getProfile.mockRejectedValue(new Error('offline'));
    expect(await refreshPremiumEntitlement()).toBeNull();
    expect(useAppStore.getState().premiumSnapshot?.tier).toBe('plus');
  });

  it('returns null when the response carries no premium block', async () => {
    getProfile.mockResolvedValue({});
    expect(await refreshPremiumEntitlement()).toBeNull();
  });

  it('applies a downgrade the server reports', async () => {
    getProfile.mockResolvedValue({ premium: premium('plus') });
    await refreshPremiumEntitlement();
    getProfile.mockResolvedValue({ premium: premium('free') });
    expect(await refreshPremiumEntitlement()).toBe('free');
    expect(useAppStore.getState().premiumSnapshot?.tier).toBe('free');
  });
});

describe('awaitPremiumActivation', () => {
  const noDelays = [0, 0, 0, 0];

  it('polls long enough to outlast a slow webhook', () => {
    // Measured: a real purchase had the webhook land ~10s after the store
    // returned. The schedule must comfortably exceed that, or the rider sees
    // nothing until their next cold start.
    const total = PREMIUM_ACTIVATION_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(30_000);
    expect(PREMIUM_ACTIVATION_DELAYS_MS[0]).toBe(0); // first attempt immediate
  });

  it('succeeds immediately when the webhook already landed', async () => {
    getProfile.mockResolvedValue({ premium: premium('plus') });
    expect(await awaitPremiumActivation(noDelays)).toBe(true);
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while the server still reports free, then succeeds', async () => {
    // The actual race: the store returned before the webhook was processed.
    getProfile
      .mockResolvedValueOnce({ premium: premium('free') })
      .mockResolvedValueOnce({ premium: premium('free') })
      .mockResolvedValueOnce({ premium: premium('plus') });

    expect(await awaitPremiumActivation(noDelays)).toBe(true);
    expect(getProfile).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().premiumSnapshot?.tier).toBe('plus');
  });

  it('gives up after the last attempt without claiming failure', async () => {
    // False means "not yet", not "the purchase failed" — callers must not show
    // an error, because the next profile sync will still pick it up.
    getProfile.mockResolvedValue({ premium: premium('free') });
    expect(await awaitPremiumActivation(noDelays)).toBe(false);
    expect(getProfile).toHaveBeenCalledTimes(noDelays.length);
  });

  it('survives transient errors mid-poll', async () => {
    getProfile
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce({ premium: premium('plus') });
    expect(await awaitPremiumActivation(noDelays)).toBe(true);
  });

  it('stops as soon as Plus is confirmed rather than exhausting the schedule', async () => {
    getProfile.mockResolvedValue({ premium: premium('plus') });
    await awaitPremiumActivation(noDelays);
    expect(getProfile).toHaveBeenCalledTimes(1);
  });
});
