// Table-driven coverage of the RevenueCat event mapper. The cases that matter
// are the ones where a wrong answer is silent money or silent loss of access:
//   - a SANDBOX event must never grant production entitlement
//   - a refund must end access without needing its own code path
//   - an unknown event type must change nothing rather than fall through
//   - an out-of-order delivery must not overwrite newer state
import { describe, expect, it } from 'vitest';

import { PLUS_ENTITLEMENT_ID } from '@defensivepedal/core';

import {
  isNewerEvent,
  mapRevenueCatEvent,
  type RevenueCatEventOutcome,
} from './revenuecatWebhook';

const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const PROD = { entitlementId: PLUS_ENTITLEMENT_ID, allowSandbox: false };

const body = (event: Record<string, unknown> = {}) => ({
  api_version: '1.0',
  event: {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user-1',
    product_id: 'pedal_plus_monthly',
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
    period_type: 'NORMAL',
    purchased_at_ms: NOW_MS,
    expiration_at_ms: NOW_MS + 30 * DAY_MS,
    event_timestamp_ms: NOW_MS,
    ...event,
  },
});

/** Narrow to the apply case so tests can read `.state` without casting. */
const applied = (outcome: RevenueCatEventOutcome) => {
  if (outcome.kind !== 'apply') {
    throw new Error(`expected apply, got ${outcome.kind}`);
  }
  return outcome;
};

// ---------------------------------------------------------------------------

describe('mapRevenueCatEvent — validation', () => {
  it.each([
    ['a non-object payload', 'nope'],
    ['null', null],
    ['an array', []],
  ])('rejects %s', (_label, payload) => {
    expect(mapRevenueCatEvent(payload, PROD).kind).toBe('invalid');
  });

  it.each([
    ['event', { api_version: '1.0' }],
    ['id', body({ id: undefined })],
    ['type', body({ type: undefined })],
    ['app_user_id', body({ app_user_id: undefined })],
    ['event_timestamp_ms', body({ event_timestamp_ms: undefined })],
  ])('rejects a payload missing %s', (_label, payload) => {
    expect(mapRevenueCatEvent(payload, PROD).kind).toBe('invalid');
  });

  it('rejects a non-numeric timestamp rather than coercing it', () => {
    expect(mapRevenueCatEvent(body({ event_timestamp_ms: '1234' }), PROD).kind).toBe('invalid');
  });

  it('never throws on arbitrary junk', () => {
    const junk = [undefined, 0, false, { event: 42 }, { event: { id: {} } }];
    for (const payload of junk) {
      expect(() => mapRevenueCatEvent(payload, PROD)).not.toThrow();
    }
  });
});

describe('mapRevenueCatEvent — sandbox gate', () => {
  it('ignores a SANDBOX event in production', () => {
    const outcome = mapRevenueCatEvent(body({ environment: 'SANDBOX' }), PROD);
    expect(outcome).toMatchObject({ kind: 'ignore', reason: 'sandbox_event' });
  });

  it('ignores sandbox regardless of event type', () => {
    const outcome = mapRevenueCatEvent(
      body({ environment: 'SANDBOX', type: 'RENEWAL' }),
      PROD,
    );
    expect(outcome).toMatchObject({ kind: 'ignore', reason: 'sandbox_event' });
  });

  it('accepts SANDBOX when explicitly allowed', () => {
    const outcome = mapRevenueCatEvent(body({ environment: 'SANDBOX' }), {
      ...PROD,
      allowSandbox: true,
    });
    expect(outcome.kind).toBe('apply');
  });

  it('accepts PRODUCTION events', () => {
    expect(mapRevenueCatEvent(body(), PROD).kind).toBe('apply');
  });
});

describe('mapRevenueCatEvent — entitlement filtering', () => {
  it('ignores an event for a different entitlement', () => {
    const outcome = mapRevenueCatEvent(body({ entitlement_ids: ['some_other_thing'] }), PROD);
    expect(outcome).toMatchObject({ kind: 'ignore', reason: 'other_entitlement' });
  });

  it('applies when our entitlement is one of several', () => {
    const outcome = mapRevenueCatEvent(
      body({ entitlement_ids: ['other', PLUS_ENTITLEMENT_ID] }),
      PROD,
    );
    expect(outcome.kind).toBe('apply');
  });

  it('applies when the field is absent — absence must not drop a real change', () => {
    expect(mapRevenueCatEvent(body({ entitlement_ids: undefined }), PROD).kind).toBe('apply');
  });
});

describe('mapRevenueCatEvent — status mapping', () => {
  it('maps an initial purchase to active', () => {
    expect(applied(mapRevenueCatEvent(body(), PROD)).state.status).toBe('active');
  });

  it('maps a trial purchase to trialing', () => {
    const outcome = applied(mapRevenueCatEvent(body({ period_type: 'TRIAL' }), PROD));
    expect(outcome.state.status).toBe('trialing');
  });

  it('maps a renewal to active', () => {
    const outcome = applied(mapRevenueCatEvent(body({ type: 'RENEWAL' }), PROD));
    expect(outcome.state.status).toBe('active');
  });

  it('maps a trial conversion renewal to active, not trialing', () => {
    const outcome = applied(
      mapRevenueCatEvent(
        body({ type: 'RENEWAL', period_type: 'NORMAL', is_trial_conversion: true }),
        PROD,
      ),
    );
    expect(outcome.state.status).toBe('active');
  });

  it('maps cancellation to cancelled, preserving the paid-through date', () => {
    const expiry = NOW_MS + 12 * DAY_MS;
    const outcome = applied(
      mapRevenueCatEvent(
        body({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', expiration_at_ms: expiry }),
        PROD,
      ),
    );
    expect(outcome.state.status).toBe('cancelled');
    expect(outcome.state.expiresAt).toBe(new Date(expiry).toISOString());
  });

  it('maps a refund to cancelled with a past expiry — no special case needed', () => {
    // The core resolver drops Plus for a cancelled period that has ended, so
    // this alone revokes access.
    const outcome = applied(
      mapRevenueCatEvent(
        body({
          type: 'CANCELLATION',
          cancel_reason: 'CUSTOMER_SUPPORT',
          expiration_at_ms: NOW_MS - DAY_MS,
        }),
        PROD,
      ),
    );
    expect(outcome.state.status).toBe('cancelled');
    expect(Date.parse(outcome.state.expiresAt!)).toBeLessThan(NOW_MS);
  });

  it('maps uncancellation back to active', () => {
    expect(applied(mapRevenueCatEvent(body({ type: 'UNCANCELLATION' }), PROD)).state.status)
      .toBe('active');
  });

  it('maps a billing issue to grace', () => {
    expect(applied(mapRevenueCatEvent(body({ type: 'BILLING_ISSUE' }), PROD)).state.status)
      .toBe('grace');
  });

  it('prefers the grace-period expiry on a billing issue', () => {
    const graceEnd = NOW_MS + 16 * DAY_MS;
    const outcome = applied(
      mapRevenueCatEvent(
        body({
          type: 'BILLING_ISSUE',
          expiration_at_ms: NOW_MS - DAY_MS,
          grace_period_expiration_at_ms: graceEnd,
        }),
        PROD,
      ),
    );
    expect(outcome.state.expiresAt).toBe(new Date(graceEnd).toISOString());
  });

  it('falls back to the normal expiry when no grace date is given', () => {
    const expiry = NOW_MS + 2 * DAY_MS;
    const outcome = applied(
      mapRevenueCatEvent(
        body({ type: 'BILLING_ISSUE', expiration_at_ms: expiry }),
        PROD,
      ),
    );
    expect(outcome.state.expiresAt).toBe(new Date(expiry).toISOString());
  });

  it('maps expiration to expired', () => {
    expect(applied(mapRevenueCatEvent(body({ type: 'EXPIRATION' }), PROD)).state.status)
      .toBe('expired');
  });

  it('maps a paused subscription to expired — a pause grants nothing', () => {
    expect(applied(mapRevenueCatEvent(body({ type: 'SUBSCRIPTION_PAUSED' }), PROD)).state.status)
      .toBe('expired');
  });

  it('keeps a product change entitled and records the new plan', () => {
    const outcome = applied(
      mapRevenueCatEvent(
        body({
          type: 'PRODUCT_CHANGE',
          product_id: 'pedal_plus_monthly',
          new_product_id: 'pedal_plus_annual',
        }),
        PROD,
      ),
    );
    expect(outcome.state.status).toBe('active');
    expect(outcome.state.productId).toBe('pedal_plus_annual');
  });

  it('maps a subscription extension to active', () => {
    expect(applied(mapRevenueCatEvent(body({ type: 'SUBSCRIPTION_EXTENDED' }), PROD)).state.status)
      .toBe('active');
  });
});

describe('mapRevenueCatEvent — ignored types', () => {
  it.each([
    ['TEST', 'test_event'],
    ['TRANSFER', 'transfer_needs_review'],
    ['INVOICE_ISSUANCE', 'unsupported_event_type'],
    ['NON_RENEWING_PURCHASE', 'unsupported_event_type'],
  ])('ignores %s', (type, reason) => {
    expect(mapRevenueCatEvent(body({ type }), PROD)).toMatchObject({ kind: 'ignore', reason });
  });

  it('ignores an event type RevenueCat has not invented yet', () => {
    expect(mapRevenueCatEvent(body({ type: 'SOMETHING_NEW_IN_2027' }), PROD)).toMatchObject({
      kind: 'ignore',
      reason: 'unsupported_event_type',
    });
  });
});

describe('mapRevenueCatEvent — store mapping', () => {
  it.each([
    ['PLAY_STORE', 'play'],
    ['APP_STORE', 'app_store'],
    ['MAC_APP_STORE', 'app_store'],
    ['PROMOTIONAL', 'manual'],
  ])('maps %s to %s', (store, expected) => {
    expect(applied(mapRevenueCatEvent(body({ store }), PROD)).state.store).toBe(expected);
  });

  it('maps an unrecognised store to null without dropping the entitlement', () => {
    const outcome = applied(mapRevenueCatEvent(body({ store: 'AMAZON' }), PROD));
    expect(outcome.state.store).toBeNull();
    expect(outcome.state.status).toBe('active');
  });
});

describe('mapRevenueCatEvent — identity and idempotency inputs', () => {
  it('returns the event id so the caller can dedupe on it', () => {
    expect(applied(mapRevenueCatEvent(body({ id: 'evt-abc' }), PROD)).eventId).toBe('evt-abc');
  });

  it('returns the app user id and event time', () => {
    const outcome = applied(mapRevenueCatEvent(body({ app_user_id: 'user-9' }), PROD));
    expect(outcome.appUserId).toBe('user-9');
    expect(outcome.eventAt).toBe(new Date(NOW_MS).toISOString());
  });

  it('is deterministic — the same payload always maps identically', () => {
    const payload = body({ type: 'RENEWAL' });
    expect(mapRevenueCatEvent(payload, PROD)).toEqual(mapRevenueCatEvent(payload, PROD));
  });

  it('exposes the event id on ignores too, so duplicates stay traceable', () => {
    const outcome = mapRevenueCatEvent(body({ id: 'evt-x', type: 'TEST' }), PROD);
    expect(outcome).toMatchObject({ kind: 'ignore', eventId: 'evt-x' });
  });
});

describe('isNewerEvent', () => {
  const t0 = '2026-08-15T12:00:00.000Z';
  const t1 = '2026-08-15T13:00:00.000Z';

  it('applies the first event we have ever seen', () => {
    expect(isNewerEvent(null, t0)).toBe(true);
  });

  it('applies a newer event', () => {
    expect(isNewerEvent(t0, t1)).toBe(true);
  });

  it('rejects an out-of-order older event', () => {
    // The failure this prevents: a delayed EXPIRATION landing after a RENEWAL
    // and marking a paying rider expired.
    expect(isNewerEvent(t1, t0)).toBe(false);
  });

  it('applies an event with an identical timestamp — retries must still settle', () => {
    expect(isNewerEvent(t0, t0)).toBe(true);
  });

  it('applies when the stored timestamp is unparseable rather than freezing the row', () => {
    expect(isNewerEvent('garbage', t0)).toBe(true);
  });
});
