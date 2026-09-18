import { describe, expect, it } from 'vitest';

import {
  canDownloadAnotherPack,
  canImportAnotherCourse,
  canSaveAnotherRoute,
  canStartFlatRoute,
  daysSince,
  freeSnapshot,
  historyRetentionCutoff,
  COOL_ROUTING_FREE_UNTIL,
  isCoolRoutingEntitled,
  isExemptFromCeilings,
  isCoolRoutingPromoActive,
  resolveCoolRoutingAvailability,
  isGrandfatheredAccount,
  offlinePackPolicy,
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
/** An instant after the cool-routing launch promotion has ended. */
const AFTER_COOL_PROMO = new Date('2026-10-02T00:00:00.000Z');
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

  /*
   * Policy change, 2026-09-18: grandfathering was widened from the two meters
   * to the ceilings as well.
   *
   * The previous rule ("existing content stays usable, new additions are
   * capped") did not survive the case it produces: a rider with twelve saved
   * routes keeps all twelve and then cannot save a thirteenth. Their app got
   * worse because we introduced a price. Plus is sold to riders who arrive
   * after the launch date, and to everyone on features that did not exist
   * before it.
   */
  it('exempts grandfathered riders from every ceiling', () => {
    const grandfathered = resolved({ tier: 'free', isGrandfathered: true });
    expect(canSaveAnotherRoute(grandfathered, 500)).toBe(true);
    expect(canImportAnotherCourse(grandfathered, 500)).toBe(true);
    expect(canDownloadAnotherPack(grandfathered, 500)).toBe(true);
    expect(historyRetentionCutoff(grandfathered, NOW)).toBeNull();
    expect(offlinePackPolicy(grandfathered).maxPacks).toBeNull();
    expect(offlinePackPolicy(grandfathered).expiryDays).toBeNull();
  });

  it('still caps a free rider who arrived after the launch date', () => {
    expect(canSaveAnotherRoute(free, FREE_LIMITS.savedRoutes!)).toBe(false);
  });

  /*
   * ⚠️ THE ONE THING GRANDFATHERING MUST NOT GIVE AWAY.
   *
   * Cool is a feature gate, not a ceiling, and it is the only thing Pedal Plus
   * has to offer riders who predate it — the in-app notice told them, in three
   * languages, that it becomes part of Plus. If `resolveCoolRoutingAvailability`
   * ever started consulting `isExemptFromCeilings`, Plus would sell nothing at
   * all to the existing base and that notice would become untrue.
   */
  it('does NOT give grandfathered riders cool routing once the promo ends', () => {
    const grandfathered = resolved({ tier: 'free', isGrandfathered: true });
    expect(isExemptFromCeilings(grandfathered)).toBe(true);
    expect(resolveCoolRoutingAvailability(grandfathered, 'RO', AFTER_COOL_PROMO)).toBe(
      'requires_plus',
    );
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

  /*
   * These now pass an explicit instant AFTER the launch promotion.
   *
   * Without it they read the wall clock, so they failed the day cool routing
   * went free to everyone and would have started passing again by themselves
   * on 2026-10-01 — a test that changes its answer depending on the day it is
   * run is worse than one that fails, because the failure is at least visible.
   * `AFTER_COOL_PROMO` is the post-promotion contract; the promotion itself is
   * covered in its own describe block below.
   */
  it('asks a free rider in a covered country to upgrade', () => {
    expect(resolveCoolRoutingAvailability(free, 'RO', AFTER_COOL_PROMO)).toBe(
      'requires_plus',
    );
  });

  it('is sold everywhere the shade graph routes — Spain included', () => {
    expect(resolveCoolRoutingAvailability(free, 'ES', AFTER_COOL_PROMO)).toBe(
      'requires_plus',
    );
    expect(resolveCoolRoutingAvailability(plus, 'ES', AFTER_COOL_PROMO)).toBe('available');
  });

  it('treats an unknown country as unavailable', () => {
    expect(resolveCoolRoutingAvailability(plus, null)).toBe('country_unavailable');
  });
});

describe('canStartFlatRoute — flat routing is free and unlimited', () => {
  /*
   * The 3/month flat meter was removed on 2026-09-18 (FREE_LIMITS
   * .flatRidesPerMonth is null). It never metered anything: the gate and the
   * consume action were both called from nowhere, so the counter never moved,
   * and its only surface was a loop-planner label permanently reading
   * "3 left this month" for a quota that did not exist.
   *
   * Flat routing has shipped free for months as a core routing mode, so
   * metering it now would take away a shipped feature. Flat LOOPS remain
   * covered: loop searches are metered, and a flat loop is a loop.
   *
   * The meter's own mechanics stay covered by `flatRouteMeter.test.ts` (30
   * specs) until that dead subsystem is deleted.
   */
  it('allows every rider, whatever the meter says', () => {
    const spent = meter({ used: 999 });
    for (const entitlement of [
      resolved({ tier: 'free' }),
      resolved({ tier: 'plus' }),
      resolved({ tier: 'free', isGrandfathered: true }),
    ]) {
      const decision = canStartFlatRoute({
        entitlement,
        meter: spent,
        nowIso: NOW,
        timeZone: 'UTC',
      });
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('keeps the free limit unmetered in the catalog', () => {
    expect(FREE_LIMITS.flatRidesPerMonth).toBeNull();
  });
});

describe('canImportAnotherCourse', () => {
  const free = resolved();
  const plus = resolved({ tier: 'plus' });

  it('allows a free rider up to the free ceiling', () => {
    expect(canImportAnotherCourse(free, 0)).toBe(true);
    expect(canImportAnotherCourse(free, 1)).toBe(true);
  });

  it('refuses a free rider at the ceiling', () => {
    expect(canImportAnotherCourse(free, 2)).toBe(false);
    expect(canImportAnotherCourse(free, 9)).toBe(false);
  });

  it('never limits Plus', () => {
    expect(canImportAnotherCourse(plus, 0)).toBe(true);
    expect(canImportAnotherCourse(plus, 500)).toBe(true);
  });

  it('reads its ceiling from the catalog, not a literal', () => {
    const limit = FREE_LIMITS.importedCourses;
    expect(limit).not.toBeNull();
    expect(canImportAnotherCourse(free, limit! - 1)).toBe(true);
    expect(canImportAnotherCourse(free, limit!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cool routing promotion window
// ---------------------------------------------------------------------------

describe('cool routing promotion', () => {
  const dayBefore = new Date('2026-09-30T23:59:59Z');
  const atCutoff = new Date('2026-10-01T00:00:00Z');
  const afterCutoff = new Date('2026-10-01T00:00:01Z');

  const freeRider = resolveEntitlement({
    server: freeSnapshot(NOW),
    cached: null,
    accountCreatedAt: POST_LAUNCH_ACCOUNT,
    nowIso: NOW,
  });
  const plusRider = resolveEntitlement({
    server: snapshot(),
    cached: null,
    accountCreatedAt: POST_LAUNCH_ACCOUNT,
    nowIso: NOW,
  });

  describe('isCoolRoutingPromoActive', () => {
    it('is active through the last free day', () => {
      expect(isCoolRoutingPromoActive(dayBefore)).toBe(true);
    });

    // Exclusive boundary: the cutoff instant is the first chargeable moment.
    it('is over at the cutoff instant itself', () => {
      expect(isCoolRoutingPromoActive(atCutoff)).toBe(false);
      expect(isCoolRoutingPromoActive(afterCutoff)).toBe(false);
    });
  });

  describe('resolveCoolRoutingAvailability', () => {
    it('gives a free rider cool routing during the promotion', () => {
      expect(resolveCoolRoutingAvailability(freeRider, 'RO', dayBefore)).toBe('available');
    });

    it('asks a free rider for Plus once the promotion ends', () => {
      expect(resolveCoolRoutingAvailability(freeRider, 'RO', atCutoff)).toBe('requires_plus');
    });

    it('never changes anything for a Plus rider', () => {
      expect(resolveCoolRoutingAvailability(plusRider, 'RO', dayBefore)).toBe('available');
      expect(resolveCoolRoutingAvailability(plusRider, 'RO', atCutoff)).toBe('available');
    });

    /*
     * Country coverage is checked FIRST and still wins. The promotion must not
     * promise a rider in a country with no shade graph something that cannot
     * work for them — that would be selling coverage that does not exist.
     */
    it('does not let the promotion override missing country coverage', () => {
      expect(resolveCoolRoutingAvailability(freeRider, null, dayBefore)).toBe(
        'country_unavailable',
      );
    });
  });

  /*
   * The date is a promise made to riders in three languages and enforced by a
   * gate. One constant so they cannot drift apart.
   */
  it('exposes the cutoff as a single UTC instant', () => {
    expect(COOL_ROUTING_FREE_UNTIL.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
