// @vitest-environment happy-dom
// The single read path for Plus. These tests pin the behaviour a rider
// actually experiences, especially the offline story:
//   - a recently confirmed snapshot is a live answer
//   - an older one still counts, inside the grace window, so a paying rider
//     out of coverage keeps what they paid for
//   - past the grace window it decays to free rather than granting forever
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { ProfilePremium } from '@defensivepedal/core';
import { FREE_LIMITS, PLUS_OFFLINE_GRACE_DAYS } from '@defensivepedal/core';

import { useAppStore } from '../../store/appStore';
import { usePremium } from '../usePremium';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();
const aheadIso = (ms: number) => new Date(Date.now() + ms).toISOString();

const premium = (overrides: Partial<ProfilePremium> = {}): ProfilePremium => ({
  tier: 'plus',
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: false,
  expiresAt: aheadIso(30 * MS_PER_DAY),
  uiEnabled: false,
  ...overrides,
});

const seed = (p: Partial<ProfilePremium> = {}, observedAt = new Date().toISOString()) => {
  useAppStore.getState().setPremiumFromProfile(premium(p), observedAt);
};

beforeEach(() => {
  useAppStore.getState().clearPremiumState();
});

const read = () => renderHook(() => usePremium()).result.current;

describe('usePremium — resolution', () => {
  it('is free with no snapshot at all', () => {
    const r = read();
    expect(r.isPlus).toBe(false);
    expect(r.limits).toEqual(FREE_LIMITS);
  });

  it('grants plus from a freshly confirmed snapshot', () => {
    seed();
    const r = read();
    expect(r.isPlus).toBe(true);
    expect(r.isStale).toBe(false);
  });

  it('honours a day-old snapshot but marks it stale', () => {
    seed({}, agoIso(MS_PER_DAY));
    const r = read();
    expect(r.isPlus).toBe(true);
    expect(r.isStale).toBe(true);
  });

  it('still honours a snapshot at the edge of the grace window', () => {
    seed({}, agoIso(PLUS_OFFLINE_GRACE_DAYS * MS_PER_DAY - MS_PER_MINUTE));
    expect(read().isPlus).toBe(true);
  });

  it('decays to free past the grace window', () => {
    // Otherwise a cancelled rider keeps Plus forever by staying offline.
    seed({}, agoIso((PLUS_OFFLINE_GRACE_DAYS + 1) * MS_PER_DAY));
    expect(read().isPlus).toBe(false);
  });

  it('drops plus once the paid period has ended', () => {
    seed({ expiresAt: agoIso(MS_PER_DAY) });
    expect(read().isPlus).toBe(false);
  });

  it('keeps plus during billing retry even with a lapsed period', () => {
    seed({ isInBillingRetry: true, expiresAt: agoIso(MS_PER_DAY) });
    expect(read().isPlus).toBe(true);
  });

  it('keeps plus during a trial', () => {
    seed({ isTrial: true });
    expect(read().isPlus).toBe(true);
  });
});

describe('usePremium — visibility is not entitlement', () => {
  it('reports uiEnabled separately from tier', () => {
    seed({ tier: 'free', uiEnabled: true });
    const r = read();
    expect(r.isPlus).toBe(false);
    expect(r.uiEnabled).toBe(true);
  });

  it('keeps a subscriber entitled while the paywall is hidden', () => {
    seed({ uiEnabled: false });
    const r = read();
    expect(r.isPlus).toBe(true);
    expect(r.uiEnabled).toBe(false);
  });

  it('defaults uiEnabled to false with no snapshot — the dark state', () => {
    expect(read().uiEnabled).toBe(false);
  });
});

describe('usePremium — gates', () => {
  it('caps saved routes for free and not for plus', () => {
    expect(read().canSaveRoute(FREE_LIMITS.savedRoutes!)).toBe(false);
    expect(read().canSaveRoute(FREE_LIMITS.savedRoutes! - 1)).toBe(true);
    seed();
    expect(read().canSaveRoute(500)).toBe(true);
  });

  it('caps offline packs for free and not for plus', () => {
    expect(read().canDownloadPack(FREE_LIMITS.offlinePacks!)).toBe(false);
    seed();
    expect(read().canDownloadPack(50)).toBe(true);
  });

  it('reports a history cutoff for free and none for plus', () => {
    expect(read().historyCutoff()).not.toBeNull();
    seed();
    expect(read().historyCutoff()).toBeNull();
  });

  it('lifts the pack expiry for plus', () => {
    expect(read().packPolicy.expiryDays).toBe(FREE_LIMITS.offlinePackExpiryDays);
    seed();
    expect(read().packPolicy.expiryDays).toBeNull();
  });

  it('tells a free rider in an uncovered country the truth about cool routing', () => {
    // Never sell coverage that does not exist.
    expect(read().coolRouting('ES')).toBe('country_unavailable');
    expect(read().coolRouting('RO')).toBe('requires_plus');
  });

  it('unlocks cool routing for plus in a covered country only', () => {
    seed();
    expect(read().coolRouting('RO')).toBe('available');
    expect(read().coolRouting('ES')).toBe('country_unavailable');
  });
});

describe('usePremium — flat routing', () => {
  it('meters a non-grandfathered free rider', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null });
    const r = read();
    expect(r.flatRoute()).toMatchObject({ allowed: true, reason: 'within_quota' });
    expect(r.flatRoutesLeft()).toBe(FREE_LIMITS.flatRidesPerMonth);
  });

  it('never meters a grandfathered account', () => {
    // The feature shipped free and unlimited; metering it would be a takeaway.
    seed({ tier: 'free', isGrandfathered: true, expiresAt: null });
    expect(read().flatRoute()).toMatchObject({ allowed: true, reason: 'grandfathered' });
  });

  it('never meters plus', () => {
    seed();
    expect(read().flatRoute()).toMatchObject({ allowed: true, reason: 'entitled' });
  });

  it('refuses once the monthly allowance is spent', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null });
    const periodKey = read().flatRoute().periodKey;
    act(() => {
      for (let i = 0; i < FREE_LIMITS.flatRidesPerMonth!; i += 1) {
        useAppStore.getState().consumeFlatRouteLocally(periodKey);
      }
    });
    const r = read();
    expect(r.flatRoute()).toMatchObject({ allowed: false, reason: 'quota_exhausted' });
    expect(r.flatRoutesLeft()).toBe(0);
  });

  it('counts rides taken offline against the allowance', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null });
    const periodKey = read().flatRoute().periodKey;
    act(() => {
      useAppStore.getState().consumeFlatRouteLocally(periodKey);
    });
    expect(read().flatRoutesLeft()).toBe(FREE_LIMITS.flatRidesPerMonth! - 1);
  });

  it('reports an unlimited allowance for plus', () => {
    seed();
    expect(read().flatRoutesLeft()).toBe(Number.POSITIVE_INFINITY);
  });
});
