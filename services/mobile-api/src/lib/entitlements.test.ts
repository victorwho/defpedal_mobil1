// Phase 1 entitlement resolution. The properties worth pinning are the ones
// that are silent when broken:
//   - a MISSING `subscriptions` table (migration not yet applied) must yield
//     free-tier defaults, never an exception — this code runs on the
//     session-bootstrap profile read, so throwing here 502s every app open
//   - an unknown account age must resolve as grandfathered, because failing
//     the other way silently takes a shipped feature off a rider
//   - visibility (`uiEnabled`) must never influence entitlement (`tier`)
import { describe, expect, it } from 'vitest';

import {
  FALLBACK_PREMIUM_FIELDS,
  loadPremiumProfileFields,
  loadSubscriptionSnapshot,
} from './entitlements';

const NOW = '2026-08-15T12:00:00.000Z';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const later = (days: number) => new Date(Date.parse(NOW) + days * MS_PER_DAY).toISOString();
const earlier = (days: number) => new Date(Date.parse(NOW) - days * MS_PER_DAY).toISOString();

interface TableResult {
  data?: unknown;
  error?: unknown;
  throws?: boolean;
}

/**
 * Minimal Supabase chain stub. Each table resolves to a canned result, or
 * throws to simulate a table that does not exist.
 */
const makeDb = (tables: Record<string, TableResult>) => ({
  from: (table: string) => {
    const result = tables[table];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => {
      if (!result) return Promise.resolve({ data: null, error: { message: 'no such table' } });
      if (result.throws) throw new Error('relation does not exist');
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    };
    return chain;
  },
});

const profileRow = (overrides: Record<string, unknown> = {}) => ({
  data: { created_at: earlier(400), premium_ui_enabled: false, ...overrides },
});

const activeSub = (overrides: Record<string, unknown> = {}) => ({
  data: {
    status: 'active',
    store: 'play',
    product_id: 'pedal_plus_monthly',
    expires_at: later(20),
    ...overrides,
  },
});

// ---------------------------------------------------------------------------

describe('loadSubscriptionSnapshot', () => {
  it('maps a subscription row into a core snapshot', async () => {
    const db = makeDb({ subscriptions: activeSub() });
    const snapshot = await loadSubscriptionSnapshot(db, 'user-1', NOW);
    expect(snapshot).toEqual({
      status: 'active',
      store: 'play',
      productId: 'pedal_plus_monthly',
      expiresAt: later(20),
      observedAt: NOW,
    });
  });

  it('returns null when the rider has no subscription row', async () => {
    const db = makeDb({ subscriptions: { data: null } });
    expect(await loadSubscriptionSnapshot(db, 'user-1', NOW)).toBeNull();
  });

  it('returns null instead of throwing when the table does not exist', async () => {
    const db = makeDb({ subscriptions: { throws: true } });
    expect(await loadSubscriptionSnapshot(db, 'user-1', NOW)).toBeNull();
  });

  it('coerces an unrecognised status to none rather than trusting it', async () => {
    const db = makeDb({ subscriptions: activeSub({ status: 'wat' }) });
    const snapshot = await loadSubscriptionSnapshot(db, 'user-1', NOW);
    expect(snapshot?.status).toBe('none');
  });

  it('coerces an unrecognised store to null', async () => {
    const db = makeDb({ subscriptions: activeSub({ store: 'amazon' }) });
    expect((await loadSubscriptionSnapshot(db, 'user-1', NOW))?.store).toBeNull();
  });

  it('nulls an unparseable expiry rather than emitting a bogus date', async () => {
    const db = makeDb({ subscriptions: activeSub({ expires_at: 'not-a-date' }) });
    expect((await loadSubscriptionSnapshot(db, 'user-1', NOW))?.expiresAt).toBeNull();
  });
});

describe('loadPremiumProfileFields', () => {
  it('grants Plus from an active subscription', async () => {
    const db = makeDb({ profiles: profileRow(), subscriptions: activeSub() });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.tier).toBe('plus');
    expect(fields.expiresAt).toBe(later(20));
  });

  it('reports free when there is no subscription row', async () => {
    const db = makeDb({ profiles: profileRow(), subscriptions: { data: null } });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.tier).toBe('free');
  });

  it('degrades to free defaults when the subscriptions table is absent', async () => {
    // The migration-not-applied case. Must not throw: this runs on the
    // session-bootstrap profile read.
    const db = makeDb({ profiles: profileRow(), subscriptions: { throws: true } });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.tier).toBe('free');
    expect(fields.uiEnabled).toBe(false);
  });

  it('degrades when the profiles premium column is absent too', async () => {
    const db = makeDb({ profiles: { throws: true }, subscriptions: { throws: true } });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields).toEqual({ ...FALLBACK_PREMIUM_FIELDS, isGrandfathered: true });
  });

  it('treats an unknown account age as grandfathered', async () => {
    const db = makeDb({
      profiles: profileRow({ created_at: null }),
      subscriptions: { data: null },
    });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.isGrandfathered).toBe(true);
  });

  it('surfaces the dark-launch flag', async () => {
    const db = makeDb({
      profiles: profileRow({ premium_ui_enabled: true }),
      subscriptions: { data: null },
    });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.uiEnabled).toBe(true);
  });

  it('keeps visibility independent of entitlement', async () => {
    // Paywall hidden, subscription active: the rider must stay entitled.
    const db = makeDb({
      profiles: profileRow({ premium_ui_enabled: false }),
      subscriptions: activeSub(),
    });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields.tier).toBe('plus');
    expect(fields.uiEnabled).toBe(false);
  });

  it('flags a trial', async () => {
    const db = makeDb({ profiles: profileRow(), subscriptions: activeSub({ status: 'trialing' }) });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields).toMatchObject({ tier: 'plus', isTrial: true });
  });

  it('keeps Plus during billing retry even with a lapsed period', async () => {
    const db = makeDb({
      profiles: profileRow(),
      subscriptions: activeSub({ status: 'grace', expires_at: earlier(3) }),
    });
    const fields = await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW });
    expect(fields).toMatchObject({ tier: 'plus', isInBillingRetry: true });
  });

  it('drops Plus once a cancelled period has ended', async () => {
    const db = makeDb({
      profiles: profileRow(),
      subscriptions: activeSub({ status: 'cancelled', expires_at: earlier(1) }),
    });
    expect((await loadPremiumProfileFields(db, { userId: 'user-1', nowIso: NOW })).tier).toBe('free');
  });

  it('skips the profile read when the caller supplies both columns', async () => {
    let profileReads = 0;
    const inner = makeDb({ subscriptions: activeSub() });
    const db = {
      from: (table: string) => {
        if (table === 'profiles') profileReads += 1;
        return inner.from(table);
      },
    };

    const fields = await loadPremiumProfileFields(db, {
      userId: 'user-1',
      nowIso: NOW,
      profileCreatedAt: earlier(400),
      premiumUiEnabled: true,
    });

    expect(profileReads).toBe(0);
    expect(fields).toMatchObject({ tier: 'plus', uiEnabled: true });
  });
});
