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
import {
  FREE_LIMITS,
  PLUS_OFFLINE_GRACE_DAYS,
  isCoolRoutingPromoActive,
} from '@defensivepedal/core';

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
    // Never sell coverage that does not exist — but the shade graph now routes
    // in every covered country, so only an unresolved country is "unavailable".
    // Country coverage is checked before entitlement, so this holds during the
    // launch promotion too.
    expect(read().coolRouting(null as never)).toBe('country_unavailable');
  });

  /*
   * Cool routing is free to everyone until COOL_ROUTING_FREE_UNTIL, so a free
   * rider in a covered country is currently 'available', not 'requires_plus'.
   * `usePremium` reads the wall clock, so this asserts the promotion is in
   * force rather than hard-coding the post-promotion answer — and it will fail
   * loudly on the day the promotion ends, which is the reminder that the
   * request-level enforcement still has to be built by then.
   */
  it('gives a free rider cool routing while the launch promotion runs', () => {
    expect(isCoolRoutingPromoActive()).toBe(true);
    expect(read().coolRouting('ES')).toBe('available');
    expect(read().coolRouting('RO')).toBe('available');
  });

  it('unlocks cool routing for plus in a covered country only', () => {
    seed();
    expect(read().coolRouting('RO')).toBe('available');
    expect(read().coolRouting('ES')).toBe('available');
    expect(read().coolRouting(null as never)).toBe('country_unavailable');
  });
});

describe('usePremium — flat routing is free and unlimited', () => {
  /*
   * The 3/month flat meter was removed on 2026-09-18. It never metered
   * anything — the gate and the consume action were both unreachable, so the
   * counter never moved — and its only surface was a loop-planner label
   * permanently reading "3 left this month" for a quota that did not exist.
   * Flat loops stay covered by the loop-search meter.
   */
  it('allows every rider regardless of tier or meter state', () => {
    for (const seedArgs of [
      { tier: 'free' as const, isGrandfathered: false, expiresAt: null },
      { tier: 'free' as const, isGrandfathered: true, expiresAt: null },
      undefined,
    ]) {
      seedArgs ? seed(seedArgs) : seed();
      const r = read();
      expect(r.flatRoute().allowed).toBe(true);
      expect(r.flatRoutesLeft()).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('charges nothing, so the meter can never be spent', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null });
    const periodKey = read().flatRoute().periodKey;
    act(() => {
      for (let i = 0; i < 10; i += 1) {
        useAppStore.getState().consumeFlatRouteLocally(periodKey);
      }
    });
    expect(read().flatRoute().allowed).toBe(true);
    expect(read().flatRoutesLeft()).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('usePremium — enforcement is dark-gated', () => {
  // The single most important property of the whole rollout: with the paywall
  // hidden, NOTHING a rider can do today starts being refused. Every screen
  // goes through these helpers precisely so this cannot be forgotten at a call
  // site.
  it('never blocks a save while the paywall is dark, even far over the limit', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: false });
    expect(read().blockSaveRoute(9999)).toBe(false);
  });

  it('never blocks a pack download while the paywall is dark', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: false });
    expect(read().blockDownloadPack(9999)).toBe(false);
  });

  it('charges no flat-route quota while the paywall is dark', () => {
    // Otherwise a reveal would find riders already part-way through an
    // allowance they never knew existed.
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: false });
    expect(read().flatRideToCharge()).toBeNull();
  });

  it('reports enforcement off while dark and on once revealed', () => {
    seed({ tier: 'free', expiresAt: null, uiEnabled: false });
    expect(read().enforcementEnabled).toBe(false);
    seed({ tier: 'free', expiresAt: null, uiEnabled: true });
    expect(read().enforcementEnabled).toBe(true);
  });

  it('blocks a save over the limit once the paywall is revealed', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: true });
    expect(read().blockSaveRoute(FREE_LIMITS.savedRoutes!)).toBe(true);
    expect(read().blockSaveRoute(FREE_LIMITS.savedRoutes! - 1)).toBe(false);
  });

  it('never blocks a subscriber', () => {
    seed({ uiEnabled: true });
    expect(read().blockSaveRoute(9999)).toBe(false);
    expect(read().blockDownloadPack(9999)).toBe(false);
  });

  /*
   * `flatRideToCharge` now always returns null: flat routing became unmetered
   * on 2026-09-18, so there is no rider left to charge. Kept as an assertion
   * rather than deleted, because a future re-metering must not silently start
   * charging a counter whose UI was removed.
   */
  it('charges nobody, because flat routing is no longer metered', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: true });
    expect(read().flatRideToCharge()).toBeNull();
  });

  it('charges nothing for a grandfathered rider — the counter is meaningless there', () => {
    seed({ tier: 'free', isGrandfathered: true, expiresAt: null, uiEnabled: true });
    expect(read().flatRideToCharge()).toBeNull();
  });

  it('charges nothing for a subscriber', () => {
    seed({ uiEnabled: true });
    expect(read().flatRideToCharge()).toBeNull();
  });

  it('charges nothing once the allowance is spent', () => {
    seed({ tier: 'free', isGrandfathered: false, expiresAt: null, uiEnabled: true });
    const periodKey = read().flatRoute().periodKey;
    act(() => {
      for (let i = 0; i < FREE_LIMITS.flatRidesPerMonth!; i += 1) {
        useAppStore.getState().consumeFlatRouteLocally(periodKey);
      }
    });
    expect(read().flatRideToCharge()).toBeNull();
  });
});
