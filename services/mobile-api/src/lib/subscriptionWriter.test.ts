// Persistence half of the billing webhook. The mapper is tested separately;
// what matters here is everything that only goes wrong against a database:
//   - a retried delivery must be recognised, not re-applied
//   - an out-of-order delivery must not overwrite newer state
//   - an event we cannot attribute must still be recorded, never dropped
//   - "no such account" and "not one of our ids" are different problems and
//     must be reported differently, because only one of them is retryable
import { beforeEach, describe, expect, it } from 'vitest';

import { PLUS_ENTITLEMENT_ID } from '@defensivepedal/core';

import { applyRevenueCatWebhook } from './subscriptionWriter';

const OPTIONS = { entitlementId: PLUS_ENTITLEMENT_ID, allowSandbox: false };

const USER = '3f1c2e40-9b7a-4c1e-8f2d-6a5b4c3d2e1f';
const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const body = (event: Record<string, unknown> = {}) => ({
  event: {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    product_id: 'pedal_plus_monthly',
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
    period_type: 'NORMAL',
    expiration_at_ms: NOW_MS + 30 * DAY_MS,
    event_timestamp_ms: NOW_MS,
    ...event,
  },
});

interface StubConfig {
  /** Error returned by the subscription_events insert. */
  eventInsertError?: { code: string } | null;
  /** Error returned by the retry insert (user_id nulled). */
  eventRetryError?: { code: string } | null;
  /** Existing subscriptions row. */
  existing?: { last_event_at: string | null } | null;
  upsertError?: { code: string } | null;
}

let eventInserts: Array<Record<string, unknown>> = [];
let upserts: Array<Record<string, unknown>> = [];

const makeDb = (config: StubConfig = {}) => {
  let eventInsertCalls = 0;

  return {
    from: (table: string) => {
      if (table === 'subscription_events') {
        return {
          insert: (row: Record<string, unknown>) => {
            eventInserts.push(row);
            eventInsertCalls += 1;
            const error =
              eventInsertCalls === 1
                ? (config.eventInsertError ?? null)
                : (config.eventRetryError ?? null);
            return Promise.resolve({ error });
          },
        };
      }

      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: config.existing ?? null,
                  error: null,
                }),
            }),
          }),
          upsert: (row: Record<string, unknown>) => {
            upserts.push(row);
            return Promise.resolve({ error: config.upsertError ?? null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
};

beforeEach(() => {
  eventInserts = [];
  upserts = [];
});

// ---------------------------------------------------------------------------

describe('applyRevenueCatWebhook — happy path', () => {
  it('writes the subscription and reports applied', async () => {
    const result = await applyRevenueCatWebhook(makeDb(), body(), OPTIONS);
    expect(result).toMatchObject({ kind: 'applied', userId: USER, eventId: 'evt-1' });
  });

  it('persists the mapped state', async () => {
    await applyRevenueCatWebhook(makeDb(), body(), OPTIONS);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      user_id: USER,
      status: 'active',
      store: 'play',
      product_id: 'pedal_plus_monthly',
      expires_at: new Date(NOW_MS + 30 * DAY_MS).toISOString(),
      revenuecat_app_user_id: USER,
      last_event_at: new Date(NOW_MS).toISOString(),
    });
  });

  it('records the raw event for audit', async () => {
    await applyRevenueCatWebhook(makeDb(), body(), OPTIONS);
    expect(eventInserts).toHaveLength(1);
    expect(eventInserts[0]).toMatchObject({
      event_id: 'evt-1',
      user_id: USER,
      event_type: 'INITIAL_PURCHASE',
    });
  });
});

describe('applyRevenueCatWebhook — idempotency', () => {
  it('reports a duplicate and does not write the subscription', async () => {
    const db = makeDb({ eventInsertError: { code: '23505' } });
    const result = await applyRevenueCatWebhook(db, body(), OPTIONS);
    expect(result).toMatchObject({ kind: 'duplicate', eventId: 'evt-1' });
    expect(upserts).toHaveLength(0);
  });

  it('recognises a duplicate before attribution, so retries stay quiet', async () => {
    // An unattributable event that is retried must report duplicate the second
    // time rather than re-raising the attribution problem every delivery.
    const db = makeDb({ eventInsertError: { code: '23505' } });
    const result = await applyRevenueCatWebhook(
      db,
      body({ app_user_id: '$RCAnonymousID:abc123' }),
      OPTIONS,
    );
    expect(result.kind).toBe('duplicate');
  });
});

describe('applyRevenueCatWebhook — ordering', () => {
  it('applies an event newer than stored state', async () => {
    const db = makeDb({ existing: { last_event_at: new Date(NOW_MS - DAY_MS).toISOString() } });
    expect((await applyRevenueCatWebhook(db, body(), OPTIONS)).kind).toBe('applied');
  });

  it('refuses an out-of-order older event', async () => {
    // The failure this prevents: a delayed EXPIRATION landing after a RENEWAL
    // and marking a paying rider expired.
    const db = makeDb({ existing: { last_event_at: new Date(NOW_MS + DAY_MS).toISOString() } });
    const result = await applyRevenueCatWebhook(
      db,
      body({ type: 'EXPIRATION' }),
      OPTIONS,
    );
    expect(result).toMatchObject({ kind: 'stale' });
    expect(upserts).toHaveLength(0);
  });

  it('applies when there is no stored event time yet', async () => {
    const db = makeDb({ existing: { last_event_at: null } });
    expect((await applyRevenueCatWebhook(db, body(), OPTIONS)).kind).toBe('applied');
  });
});

describe('applyRevenueCatWebhook — attribution', () => {
  it('reports unattributable for a RevenueCat anonymous id', async () => {
    const result = await applyRevenueCatWebhook(
      makeDb(),
      body({ app_user_id: '$RCAnonymousID:abc123' }),
      OPTIONS,
    );
    expect(result).toMatchObject({ kind: 'unattributable' });
    expect(upserts).toHaveLength(0);
  });

  it('still records an unattributable event rather than discarding a real purchase', async () => {
    await applyRevenueCatWebhook(
      makeDb(),
      body({ app_user_id: '$RCAnonymousID:abc123' }),
      OPTIONS,
    );
    expect(eventInserts).toHaveLength(1);
    expect(eventInserts[0]).toMatchObject({ user_id: null });
  });

  it('reports unknown_user when the account does not exist yet', async () => {
    // Distinct from unattributable: this id is well-formed, so the webhook is
    // probably just racing account creation and a retry may succeed.
    const db = makeDb({ upsertError: { code: '23503' } });
    const result = await applyRevenueCatWebhook(db, body(), OPTIONS);
    expect(result).toMatchObject({ kind: 'unknown_user', userId: USER });
  });

  it('retries the audit insert with a null user when the FK rejects it', async () => {
    const db = makeDb({ eventInsertError: { code: '23503' }, eventRetryError: null });
    const result = await applyRevenueCatWebhook(db, body(), OPTIONS);
    expect(eventInserts).toHaveLength(2);
    expect(eventInserts[1]).toMatchObject({ user_id: null });
    expect(result.kind).toBe('applied');
  });
});

describe('applyRevenueCatWebhook — non-applying outcomes', () => {
  it('reports invalid for a malformed payload and touches nothing', async () => {
    const result = await applyRevenueCatWebhook(makeDb(), { nope: true }, OPTIONS);
    expect(result.kind).toBe('invalid');
    expect(eventInserts).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it('reports ignored for a sandbox event and never writes the subscription', async () => {
    const result = await applyRevenueCatWebhook(
      makeDb(),
      body({ environment: 'SANDBOX' }),
      OPTIONS,
    );
    expect(result).toMatchObject({ kind: 'ignored', reason: 'sandbox_event' });
    expect(upserts).toHaveLength(0);
  });

  it('records ignored events so a TRANSFER stays visible for review', async () => {
    await applyRevenueCatWebhook(makeDb(), body({ type: 'TRANSFER' }), OPTIONS);
    expect(eventInserts).toHaveLength(1);
    expect(eventInserts[0]).toMatchObject({ event_type: 'TRANSFER' });
  });

  it('reports error when the event cannot be recorded', async () => {
    const db = makeDb({ eventInsertError: { code: '08006' } });
    const result = await applyRevenueCatWebhook(db, body(), OPTIONS);
    expect(result.kind).toBe('error');
    expect(upserts).toHaveLength(0);
  });

  it('reports error when the subscription write fails for an unknown reason', async () => {
    const db = makeDb({ upsertError: { code: '08006' } });
    expect((await applyRevenueCatWebhook(db, body(), OPTIONS)).kind).toBe('error');
  });

  it('never throws when the database throws', async () => {
    const exploding = {
      from: () => {
        throw new Error('connection reset');
      },
    };
    const result = await applyRevenueCatWebhook(exploding, body(), OPTIONS);
    expect(result.kind).toBe('error');
  });
});
