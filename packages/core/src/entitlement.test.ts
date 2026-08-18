import { describe, expect, it } from 'vitest';

import {
  canDownloadAnotherPack,
  canSaveAnotherRoute,
  canStartFlatRoute,
  daysSince,
  freeSnapshot,
  historyRetentionCutoff,
  isCoolRoutingEntitled,
  isGrandfatheredAccount,
  offlinePackPolicy,
  resolveCoolRoutingAvailability,
  resolveEntitlement,
  type EntitlementSnapshot,
  type ResolvedEntitlement,
} from './entitlement';
import { DEFAULT_FLAT_ROUTE_METER, type FlatRouteMeterState } from './flatRouteMeter';
import {
  FREE_LIMITS,
  PLUS_LAUNCH_AT_ISO,
  PLUS_LIMITS,
  PLUS_OFFLINE_GRACE_DAYS,
} from './premiumCatalog';

const NOW = '2026-08-15T12:00:00.000Z';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysBefore = (iso: string, days: number): string =>
  new Date(Date.parse(iso) - days * MS_PER_DAY).toISOString();

const daysAfter = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * MS_PER_DAY).toISOString();

/**
 * Derived from the catalog constant rather than hardcoded, so these stay
 * meaningful once PLUS_LAUNCH_AT_ISO is set to the real reveal timestamp.
 */
const PRE_LAUNCH_ACCOUNT = daysBefore(PLUS_LAUNCH_AT_ISO, 30);
const POST_LAUNCH_ACCOUNT = daysAfter(PLUS_LAUNCH_AT_ISO, 30);

const snapshot = (overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot => ({
  status: 'active',
  expiresAt: daysAfter(NOW, 20),
  productId: 'pedal_plus_monthly',
  store: 'play',
  observedAt: NOW,
  ...overrides,
});

/** A resolved entitlement without going through resolution. */
const resolved = (overrides: Partial<ResolvedEntitlement> = {}): ResolvedEntitlement => ({
  tier: 'free',
  isTrial: false,
  isInBillingRetry: false,
  isGrandfathered: false,
  source: 'none',
  isStale: false,
  expiresAt: null,
  ...overrides,
});

const meter = (overrides: Partial<FlatRouteMeterState> = {}): FlatRouteMeterState => ({
  ...DEFAULT_FLAT_ROUTE_METER,
  periodKey: '2026-08',
  ...overrides,
});

// ---------------------------------------------------------------------------

describe('daysSince', () => {
  it('is Infinity when the timestamp is missing or unparseable', () => {
    expect(daysSince(null, NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(daysSince('nonsense', NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('clamps to zero when the device clock has been rewound', () => {
    expect(daysSince(daysAfter(NOW, 5), NOW)).toBe(0);
  });
});

describe('resolveEntitlement — source precedence', () => {
  it('grants Plus from a fresh server snapshot', () => {
    const result = resolveEntitlement({
      server: snapshot(),
      cached: null,
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('plus');
    expect(result.source).toBe('server');
    expect(result.isStale).toBe(false);
  });

  it('lets the server revoke Plus even when the cache still says otherwise', () => {
    const result = resolveEntitlement({
      server: freeSnapshot(NOW),
      cached: snapshot(),
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('free');
    expect(result.source).toBe('server');
  });

  it('falls back to a cached snapshot when the server is unreachable', () => {
    const result = resolveEntitlement({
      server: null,
      cached: snapshot({ observedAt: daysBefore(NOW, 2) }),
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('plus');
    expect(result.source).toBe('cache');
    expect(result.isStale).toBe(true);
  });

  it('honours a cache exactly at the grace boundary', () => {
    const result = resolveEntitlement({
      server: null,
      cached: snapshot({
        observedAt: daysBefore(NOW, PLUS_OFFLINE_GRACE_DAYS),
        expiresAt: daysAfter(NOW, 20),
      }),
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('plus');
  });

  it('drops a cache past the grace boundary', () => {
    const result = resolveEntitlement({
      server: null,
      cached: snapshot({
        observedAt: daysBefore(NOW, PLUS_OFFLINE_GRACE_DAYS + 1),
        expiresAt: daysAfter(NOW, 20),
      }),
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('free');
    expect(result.source).toBe('none');
  });

  it('is free with no server and no cache', () => {
    const result = resolveEntitlement({
      server: null,
      cached: null,
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.tier).toBe('free');
    expect(result.source).toBe('none');
  });

  it('keeps grandfathered status even with no server and no cache', () => {
    // Grandfathering is a fact about the account, not the subscription, so
    // an offline rider must never lose it.
    const result = resolveEntitlement({
      server: null,
      cached: null,
      accountCreatedAt: PRE_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });
    expect(result.isGrandfathered).toBe(true);
  });
});

describe('resolveEntitlement — subscription status', () => {
  const resolveWith = (s: Partial<EntitlementSnapshot>) =>
    resolveEntitlement({
      server: snapshot(s),
      cached: null,
      accountCreatedAt: POST_LAUNCH_ACCOUNT,
      nowIso: NOW,
    });

  it('grants Plus during a trial and flags it', () => {
    const result = resolveWith({ status: 'trialing' });
    expect(result.tier).toBe('plus');
    expect(result.isTrial).toBe(true);
  });

  it('grants Plus during billing retry even though the period has lapsed', () => {
    const result = resolveWith({ status: 'grace', expiresAt: daysBefore(NOW, 2) });
    expect(result.tier).toBe('plus');
    expect(result.isInBillingRetry).toBe(true);
  });

  it('keeps Plus after cancellation until the paid period ends', () => {
    expect(resolveWith({ status: 'cancelled', expiresAt: daysAfter(NOW, 5) }).tier).toBe('plus');
  });

  it('drops Plus once a cancelled period has ended', () => {
    expect(resolveWith({ status: 'cancelled', expiresAt: daysBefore(NOW, 1) }).tier).toBe('free');
  });

  it('does not grant Plus from a stale active row whose period has lapsed', () => {
    expect(resolveWith({ status: 'active', expiresAt: daysBefore(NOW, 1) }).tier).toBe('free');
  });

  it('does not grant Plus for expired or never-subscribed', () => {
    expect(resolveWith({ status: 'expired' }).tier).toBe('free');
    expect(resolveWith({ status: 'none', expiresAt: null }).tier).toBe('free');
  });

  it('does not grant Plus when an active row has no expiry at all', () => {
    expect(resolveWith({ status: 'active', expiresAt: null }).tier).toBe('free');
  });
});

describe('isGrandfatheredAccount', () => {
  it('is true strictly before the launch instant', () => {
    expect(isGrandfatheredAccount(PRE_LAUNCH_ACCOUNT)).toBe(true);
  });

  it('is false at and after the launch instant', () => {
    expect(isGrandfatheredAccount(PLUS_LAUNCH_AT_ISO)).toBe(false);
    expect(isGrandfatheredAccount(POST_LAUNCH_ACCOUNT)).toBe(false);
  });

  it('fails safe to grandfathered on a missing or malformed date', () => {
    expect(isGrandfatheredAccount(null)).toBe(true);
    expect(isGrandfatheredAccount('not-a-date')).toBe(true);
  });
});

describe('saved routes and offline packs', () => {
  const free = resolved({ tier: 'free' });
  const plus = resolved({ tier: 'plus' });

  it('allows a free rider up to the cap', () => {
    expect(canSaveAnotherRoute(free, FREE_LIMITS.savedRoutes! - 1)).toBe(true);
    expect(canSaveAnotherRoute(free, FREE_LIMITS.savedRoutes!)).toBe(false);
  });

  it('allows Plus regardless of count', () => {
    expect(canSaveAnotherRoute(plus, 500)).toBe(true);
  });

  it('does NOT exempt grandfathered riders from the saved-route cap', () => {
    // Grandfathering preserves existing content; it does not grant unlimited
    // new additions. Locking this so the two promises never get merged.
    const grandfathered = resolved({ tier: 'free', isGrandfathered: true });
    expect(canSaveAnotherRoute(grandfathered, FREE_LIMITS.savedRoutes!)).toBe(false);
  });

  it('caps offline packs for free and not for Plus', () => {
    expect(canDownloadAnotherPack(free, FREE_LIMITS.offlinePacks!)).toBe(false);
    expect(canDownloadAnotherPack(plus, 50)).toBe(true);
  });

  it('exposes the retention policy the cleanup pass should apply', () => {
    expect(offlinePackPolicy(free)).toEqual({
      maxPacks: FREE_LIMITS.offlinePacks,
      expiryDays: FREE_LIMITS.offlinePackExpiryDays,
      storageBudgetBytes: FREE_LIMITS.offlinePackStorageBudgetBytes,
    });
    expect(offlinePackPolicy(plus).expiryDays).toBeNull();
    expect(offlinePackPolicy(plus).storageBudgetBytes).toBe(
      PLUS_LIMITS.offlinePackStorageBudgetBytes,
    );
  });
});

describe('historyRetentionCutoff', () => {
  it('returns a cutoff one window back for free riders', () => {
    const cutoff = historyRetentionCutoff(resolved({ tier: 'free' }), NOW);
    expect(cutoff).toBe(daysBefore(NOW, FREE_LIMITS.historyWindowDays!));
  });

  it('returns null for Plus — the full history', () => {
    expect(historyRetentionCutoff(resolved({ tier: 'plus' }), NOW)).toBeNull();
  });

  it('returns null rather than a bogus date when now is unparseable', () => {
    expect(historyRetentionCutoff(resolved({ tier: 'free' }), 'nonsense')).toBeNull();
  });
});

describe('cool routing availability', () => {
  const free = resolved({ tier: 'free' });
  const plus = resolved({ tier: 'plus' });

  it('is available for Plus in a covered country', () => {
    expect(resolveCoolRoutingAvailability(plus, 'RO')).toBe('available');
    expect(isCoolRoutingEntitled(plus, 'RO')).toBe(true);
  });

  it('asks a free rider in a covered country to upgrade', () => {
    expect(resolveCoolRoutingAvailability(free, 'RO')).toBe('requires_plus');
  });

  it('reports country_unavailable ahead of requires_plus — never sell coverage that does not exist', () => {
    expect(resolveCoolRoutingAvailability(free, 'ES')).toBe('country_unavailable');
    expect(resolveCoolRoutingAvailability(plus, 'ES')).toBe('country_unavailable');
  });

  it('treats an unknown country as unavailable', () => {
    expect(resolveCoolRoutingAvailability(plus, null)).toBe('country_unavailable');
  });
});

describe('canStartFlatRoute', () => {
  const gate = (
    entitlement: ResolvedEntitlement,
    state: FlatRouteMeterState = meter(),
  ) => canStartFlatRoute({ entitlement, meter: state, nowIso: NOW, timeZone: 'UTC' });

  it('is unlimited for Plus', () => {
    const decision = gate(resolved({ tier: 'plus' }));
    expect(decision).toMatchObject({ allowed: true, reason: 'entitled' });
    expect(decision.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('is unlimited for a grandfathered account — the feature shipped free and stays free', () => {
    const decision = gate(resolved({ tier: 'free', isGrandfathered: true }));
    expect(decision).toMatchObject({ allowed: true, reason: 'grandfathered' });
    expect(decision.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('meters a post-launch free account', () => {
    const decision = gate(resolved({ tier: 'free' }));
    expect(decision).toMatchObject({ allowed: true, reason: 'within_quota' });
    expect(decision.remaining).toBe(FREE_LIMITS.flatRidesPerMonth);
  });

  it('refuses once the monthly allowance is spent', () => {
    const spent = meter({ syncedCount: FREE_LIMITS.flatRidesPerMonth! });
    const decision = gate(resolved({ tier: 'free' }), spent);
    expect(decision).toMatchObject({
      allowed: false,
      reason: 'quota_exhausted',
      remaining: 0,
    });
  });

  it('counts pending offline rides against the allowance', () => {
    const spent = meter({ syncedCount: 1, pendingCount: FREE_LIMITS.flatRidesPerMonth! - 1 });
    expect(gate(resolved({ tier: 'free' }), spent).allowed).toBe(false);
  });

  it('restores the allowance when the month rolls over', () => {
    const lastMonth = meter({ periodKey: '2026-07', syncedCount: 99 });
    const decision = gate(resolved({ tier: 'free' }), lastMonth);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(FREE_LIMITS.flatRidesPerMonth);
  });

  it('returns the period key the caller should persist against', () => {
    expect(gate(resolved({ tier: 'free' })).periodKey).toBe('2026-08');
  });

  it('meters against the rider timezone, not UTC', () => {
    const decision = canStartFlatRoute({
      entitlement: resolved({ tier: 'free' }),
      meter: meter({ periodKey: '2026-09', syncedCount: FREE_LIMITS.flatRidesPerMonth! }),
      nowIso: '2026-08-31T12:00:00.000Z',
      timeZone: 'Pacific/Kiritimati',
    });
    // Already September for this rider, so September's spent quota applies.
    expect(decision.allowed).toBe(false);
  });
});
