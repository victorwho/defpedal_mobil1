// @vitest-environment node
//
// Billing webhook endpoint. This is the only writer for `subscriptions`, so the
// checks that matter are the ones where being wrong hands out paid features:
//   - an unset secret must fail CLOSED (500), never accept the request
//   - a wrong or missing secret must be rejected
//   - sandbox events must not grant production entitlement
// Status codes are also asserted deliberately, because RevenueCat retries 5xx
// and gives up on 4xx: a retryable failure returned as 4xx is a lost purchase.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const eventInserts: Array<Record<string, unknown>> = [];
const upserts: Array<Record<string, unknown>> = [];
const state: { eventInsertError: { code: string } | null; upsertError: { code: string } | null } = {
  eventInsertError: null,
  upsertError: null,
};
const meterState = { existing: 0 };
const meterUpserts: Array<Record<string, unknown>> = [];

vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'subscription_events') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            eventInserts.push(row);
            return Promise.resolve({ error: state.eventInsertError });
          }),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
          upsert: vi.fn((row: Record<string, unknown>) => {
            upserts.push(row);
            return Promise.resolve({ error: state.upsertError });
          }),
        };
      }
      if (table === 'usage_meters') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: { count: meterState.existing }, error: null }),
                  ),
                })),
              })),
            })),
          })),
          upsert: vi.fn((row: Record<string, unknown>) => {
            meterUpserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    }),
  },
}));

import type { FastifyInstance } from 'fastify';

import { PLUS_ENTITLEMENT_ID } from '@defensivepedal/core';

import { buildApp } from '../app';

const SECRET = 'test-webhook-secret';
const USER = '3f1c2e40-9b7a-4c1e-8f2d-6a5b4c3d2e1f';
const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');

let app: FastifyInstance;
let originalSecret: string | undefined;
let originalSandbox: string | undefined;

beforeAll(async () => {
  originalSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  originalSandbox = process.env.REVENUECAT_ALLOW_SANDBOX;
  app = buildApp({ dependencies: { authenticateUser: async () => ({ id: 'u', email: null }) } });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  if (originalSecret === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
  else process.env.REVENUECAT_WEBHOOK_SECRET = originalSecret;
  if (originalSandbox === undefined) delete process.env.REVENUECAT_ALLOW_SANDBOX;
  else process.env.REVENUECAT_ALLOW_SANDBOX = originalSandbox;
});

beforeEach(() => {
  eventInserts.length = 0;
  upserts.length = 0;
  state.eventInsertError = null;
  state.upsertError = null;
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
  delete process.env.REVENUECAT_ALLOW_SANDBOX;
  meterState.existing = 0;
  meterUpserts.length = 0;
});

const payload = (event: Record<string, unknown> = {}) => ({
  event: {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    product_id: 'pedal_plus_monthly',
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
    period_type: 'NORMAL',
    expiration_at_ms: NOW_MS + 30 * 24 * 60 * 60 * 1000,
    event_timestamp_ms: NOW_MS,
    ...event,
  },
});

const post = (body: unknown, authorization?: string) =>
  app.inject({
    method: 'POST',
    url: '/v1/billing/webhook',
    headers: {
      'content-type': 'application/json',
      ...(authorization === undefined ? {} : { authorization }),
    },
    payload: body as Record<string, unknown>,
  });

// ---------------------------------------------------------------------------

describe('POST /v1/billing/webhook — authentication', () => {
  it('rejects a missing Authorization header', async () => {
    const res = await post(payload());
    expect(res.statusCode).toBe(401);
    expect(upserts).toHaveLength(0);
  });

  it('rejects a wrong secret', async () => {
    const res = await post(payload(), 'Bearer not-the-secret');
    expect(res.statusCode).toBe(401);
    expect(upserts).toHaveLength(0);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    // Must never be an open writer: anyone could grant themselves Plus.
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    const res = await post(payload(), 'Bearer anything');
    expect(res.statusCode).toBe(500);
    expect(upserts).toHaveLength(0);
  });

  it('accepts the bare secret', async () => {
    expect((await post(payload(), SECRET)).statusCode).toBe(200);
  });

  it('accepts a Bearer-prefixed secret', async () => {
    expect((await post(payload(), `Bearer ${SECRET}`)).statusCode).toBe(200);
  });

  it('rejects a secret that is merely a prefix of the real one', async () => {
    expect((await post(payload(), SECRET.slice(0, -1))).statusCode).toBe(401);
  });
});

describe('POST /v1/billing/webhook — outcomes', () => {
  it('applies a purchase', async () => {
    const res = await post(payload(), `Bearer ${SECRET}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'applied', eventId: 'evt-1' });
    expect(upserts[0]).toMatchObject({ user_id: USER, status: 'active' });
  });

  it('returns 200 for a duplicate so RevenueCat stops retrying', async () => {
    state.eventInsertError = { code: '23505' };
    const res = await post(payload(), `Bearer ${SECRET}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'duplicate' });
  });

  it('returns 400 for a malformed payload — retrying cannot help', async () => {
    const res = await post({ not: 'an event' }, `Bearer ${SECRET}`);
    expect(res.statusCode).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('ignores a sandbox event without granting entitlement', async () => {
    const res = await post(payload({ environment: 'SANDBOX' }), `Bearer ${SECRET}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'ignored:sandbox_event' });
    expect(upserts).toHaveLength(0);
  });

  it('accepts a sandbox event only when explicitly allowed', async () => {
    process.env.REVENUECAT_ALLOW_SANDBOX = 'true';
    const res = await post(payload({ environment: 'SANDBOX' }), `Bearer ${SECRET}`);
    expect(res.json()).toMatchObject({ outcome: 'applied' });
  });

  it('treats any value other than "true" as sandbox-disallowed', async () => {
    process.env.REVENUECAT_ALLOW_SANDBOX = '1';
    const res = await post(payload({ environment: 'SANDBOX' }), `Bearer ${SECRET}`);
    expect(res.json()).toMatchObject({ outcome: 'ignored:sandbox_event' });
  });

  it('returns 500 for an account that does not exist yet so the retry can win the race', async () => {
    state.upsertError = { code: '23503' };
    const res = await post(payload(), `Bearer ${SECRET}`);
    expect(res.statusCode).toBe(500);
  });

  it('returns 200 for an unattributable purchase — a retry would never resolve it', async () => {
    const res = await post(
      payload({ app_user_id: '$RCAnonymousID:abc' }),
      `Bearer ${SECRET}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'unattributable' });
  });

  it('returns 500 on a transient database failure so RevenueCat retries', async () => {
    state.upsertError = { code: '08006' };
    expect((await post(payload(), `Bearer ${SECRET}`)).statusCode).toBe(500);
  });
});


// ---------------------------------------------------------------------------
// Flat-route meter reconcile.
//
// The first version of this endpoint shipped with the period-key regex
// duplicated into the JSON Schema as '^\d{4}-\d{2}$'. The backslashes were
// lost in transit, so the deployed pattern was '^d{4}-d{2}$' and EVERY valid
// key was rejected — the endpoint was 100% unusable and no test noticed,
// because it had none. These are those tests.
// ---------------------------------------------------------------------------

const postMeter = (body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/v1/premium/usage/flat-route',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    payload: body as Record<string, unknown>,
  });

describe('POST /v1/premium/usage/flat-route', () => {
  it('accepts a well-formed period key', () => {
    // The canary for the escaping bug above.
    return postMeter({ periodKey: '2026-08', pending: 2 }).then((res) => {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ periodKey: '2026-08', total: 2, accepted: 2 });
    });
  });

  it('adds to an existing count', async () => {
    meterState.existing = 1;
    const res = await postMeter({ periodKey: '2026-08', pending: 2 });
    expect(res.json()).toMatchObject({ total: 3, accepted: 2 });
  });

  it('rejects a malformed period key with 400, not a retryable 503', async () => {
    const res = await postMeter({ periodKey: 'nope-08', pending: 1 });
    expect(res.statusCode).toBe(400);
    expect(meterUpserts).toHaveLength(0);
  });

  it('rejects a wrong-length period key at the schema', async () => {
    expect((await postMeter({ periodKey: '2026-8', pending: 1 })).statusCode).toBe(400);
  });

  it('rejects a negative pending', async () => {
    expect((await postMeter({ periodKey: '2026-08', pending: -1 })).statusCode).toBe(400);
  });

  it('rejects an absurd pending at the schema ceiling', async () => {
    expect((await postMeter({ periodKey: '2026-08', pending: 10000 })).statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/premium/usage/flat-route',
      headers: { 'content-type': 'application/json' },
      payload: { periodKey: '2026-08', pending: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a zero-pending poll without writing', async () => {
    meterState.existing = 3;
    const res = await postMeter({ periodKey: '2026-08', pending: 0 });
    expect(res.json()).toMatchObject({ total: 3, accepted: 0 });
    expect(meterUpserts).toHaveLength(0);
  });
});
