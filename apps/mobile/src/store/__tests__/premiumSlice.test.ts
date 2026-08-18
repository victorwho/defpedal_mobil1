// Pedal Plus client state. Two invariants carry the weight here:
//
//   1. Entitlement is USER-scoped. A subscription surviving an account switch
//      would grant Plus to whoever signs in next on the same phone, and a spent
//      flat-route quota would follow them too.
//   2. The snapshot is the offline cache. It must be persisted, because that is
//      what lets a paying rider with no signal keep what they paid for.
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProfilePremium } from '@defensivepedal/core';
import { DEFAULT_FLAT_ROUTE_METER } from '@defensivepedal/core';

import { useAppStore } from '../appStore';

const premium = (overrides: Partial<ProfilePremium> = {}): ProfilePremium => ({
  tier: 'plus',
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: false,
  expiresAt: '2026-09-15T12:00:00.000Z',
  uiEnabled: false,
  ...overrides,
});

const NOW = '2026-08-15T12:00:00.000Z';

beforeEach(() => {
  useAppStore.getState().clearPremiumState();
});

describe('premium slice — defaults', () => {
  it('starts with no snapshot and an empty meter', () => {
    const s = useAppStore.getState();
    expect(s.premiumSnapshot).toBeNull();
    expect(s.flatRouteMeter).toEqual(DEFAULT_FLAT_ROUTE_METER);
  });
});

describe('setPremiumFromProfile', () => {
  it('stores the block with the observation time', () => {
    useAppStore.getState().setPremiumFromProfile(premium(), NOW);
    expect(useAppStore.getState().premiumSnapshot).toEqual({
      tier: 'plus',
      isTrial: false,
      isInBillingRetry: false,
      isGrandfathered: false,
      expiresAt: '2026-09-15T12:00:00.000Z',
      uiEnabled: false,
      observedAt: NOW,
    });
  });

  it('overwrites a previous snapshot so a downgrade takes effect immediately', () => {
    useAppStore.getState().setPremiumFromProfile(premium(), NOW);
    useAppStore
      .getState()
      .setPremiumFromProfile(premium({ tier: 'free', expiresAt: null }), NOW);
    expect(useAppStore.getState().premiumSnapshot?.tier).toBe('free');
  });

  it('carries the visibility flag independently of the tier', () => {
    useAppStore
      .getState()
      .setPremiumFromProfile(premium({ tier: 'free', uiEnabled: true }), NOW);
    const snap = useAppStore.getState().premiumSnapshot;
    expect(snap?.tier).toBe('free');
    expect(snap?.uiEnabled).toBe(true);
  });
});

describe('flat-route meter', () => {
  it('counts a consumed ride as pending', () => {
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    expect(useAppStore.getState().flatRouteMeter).toEqual({
      periodKey: '2026-08',
      syncedCount: 0,
      pendingCount: 1,
    });
  });

  it('accumulates across an offline stretch', () => {
    const store = useAppStore.getState();
    store.consumeFlatRouteLocally('2026-08');
    store.consumeFlatRouteLocally('2026-08');
    store.consumeFlatRouteLocally('2026-08');
    expect(useAppStore.getState().flatRouteMeter.pendingCount).toBe(3);
  });

  it('resets when the month rolls over', () => {
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    useAppStore.getState().consumeFlatRouteLocally('2026-09');
    expect(useAppStore.getState().flatRouteMeter).toEqual({
      periodKey: '2026-09',
      syncedCount: 0,
      pendingCount: 1,
    });
  });

  it('merges a server count without losing local pending rides', () => {
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    useAppStore.getState().mergeFlatRouteMeterFromServer({
      periodKey: '2026-08',
      syncedCount: 1,
      pendingCount: 0,
    });
    expect(useAppStore.getState().flatRouteMeter).toEqual({
      periodKey: '2026-08',
      syncedCount: 1,
      pendingCount: 1,
    });
  });

  it('moves acknowledged rides into the synced count without changing the total', () => {
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    useAppStore.getState().acknowledgeFlatRoutesLocally(2);
    expect(useAppStore.getState().flatRouteMeter).toEqual({
      periodKey: '2026-08',
      syncedCount: 2,
      pendingCount: 0,
    });
  });
});

describe('account switch — resetUserScopedState', () => {
  it('clears the entitlement snapshot', () => {
    // The failure this prevents: signing out of a Plus account and handing the
    // phone to someone else, who signs in and finds themselves subscribed.
    useAppStore.getState().setPremiumFromProfile(premium(), NOW);
    useAppStore.getState().resetUserScopedState();
    expect(useAppStore.getState().premiumSnapshot).toBeNull();
  });

  it('clears the flat-route meter', () => {
    useAppStore.getState().consumeFlatRouteLocally('2026-08');
    useAppStore.getState().resetUserScopedState();
    expect(useAppStore.getState().flatRouteMeter).toEqual(DEFAULT_FLAT_ROUTE_METER);
  });

  it('clears premium state regardless of ride-data disposition', () => {
    useAppStore.getState().setPremiumFromProfile(premium(), NOW);
    useAppStore.getState().resetUserScopedState({ rideDataDisposition: 'dead' });
    expect(useAppStore.getState().premiumSnapshot).toBeNull();
  });
});

describe('persistence', () => {
  it('includes premium state in the persisted partition', async () => {
    // The offline cache only works if it is actually written. If these fall out
    // of `partialize`, a paying rider reopens the app as a free user.
    const mod = await import('../appStore');
    const persistOptions = (mod.useAppStore as unknown as {
      persist: { getOptions: () => { partialize?: (s: unknown) => Record<string, unknown> } };
    }).persist.getOptions();

    useAppStore.getState().setPremiumFromProfile(premium(), NOW);
    useAppStore.getState().consumeFlatRouteLocally('2026-08');

    const partialized = persistOptions.partialize?.(useAppStore.getState()) ?? {};
    expect(partialized).toHaveProperty('premiumSnapshot');
    expect(partialized).toHaveProperty('flatRouteMeter');
    expect((partialized.premiumSnapshot as { tier: string }).tier).toBe('plus');
    expect((partialized.flatRouteMeter as { pendingCount: number }).pendingCount).toBe(1);
  });
});
