// @vitest-environment node
//
// HTTP-level coverage for the Pedal Plus block on the profile read.
//
// Why this exists separately from the lib tests: Fastify strips any response
// field not declared in the response JSON Schema (gotcha #9). Every lib test
// can pass while the endpoint silently returns no `premium` at all, so the
// only way to catch that is to assert on the serialised HTTP body.
//
// Also pins the dark-launch default (uiEnabled false) and the property that
// makes the flag safe: visibility never affects entitlement.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const profileRow: Record<string, unknown> = {
  id: 'user-1',
  display_name: 'Rider',
  username: 'rider',
  avatar_url: null,
  auto_share_rides: false,
  trim_route_endpoints: false,
  cycling_goal: null,
  is_private: false,
  share_conversion_feed_optin: true,
  keep_full_gps_history: false,
  notify_weather: true,
  notify_hazard: true,
  notify_community: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  created_at: '2020-01-01T00:00:00.000Z',
  premium_ui_enabled: false,
};

let subscriptionRow: Record<string, unknown> | null = null;

vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profileRow }, error: null })),
              maybeSingle: vi.fn(() => Promise.resolve({ data: { ...profileRow }, error: null })),
            })),
          })),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { ...profileRow }, error: null })),
            })),
          })),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: subscriptionRow, error: null }),
              ),
            })),
          })),
        };
      }
      return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    }),
  },
}));

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    dependencies: {
      authenticateUser: async () => ({ id: 'user-1', email: 'rider@example.com' }),
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  subscriptionRow = null;
  profileRow.premium_ui_enabled = false;
  profileRow.created_at = '2020-01-01T00:00:00.000Z';
});

const getProfile = () =>
  app.inject({
    method: 'GET',
    url: '/v1/profile',
    headers: { authorization: 'Bearer test-token' },
  });

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('GET /v1/profile — premium block', () => {
  it('is present in the serialised response', async () => {
    // The gotcha-#9 canary: if the response schema omits `premium`, Fastify
    // drops it and this fails while every lib test still passes.
    const res = await getProfile();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('premium');
  });

  it('carries every declared field', async () => {
    const { premium } = res2json(await getProfile());
    expect(Object.keys(premium).sort()).toEqual(
      ['expiresAt', 'isGrandfathered', 'isInBillingRetry', 'isTrial', 'tier', 'uiEnabled'].sort(),
    );
  });

  it('reports the dark-launch default for a rider with no subscription', async () => {
    const { premium } = res2json(await getProfile());
    expect(premium).toMatchObject({ tier: 'free', uiEnabled: false, isTrial: false });
  });

  it('grants plus from an active subscription', async () => {
    subscriptionRow = {
      status: 'active',
      store: 'play',
      product_id: 'pedal_plus_monthly',
      expires_at: future,
    };
    const { premium } = res2json(await getProfile());
    expect(premium.tier).toBe('plus');
    expect(premium.expiresAt).toBe(future);
  });

  it('flags a trial', async () => {
    subscriptionRow = { status: 'trialing', store: 'play', product_id: 'm', expires_at: future };
    expect(res2json(await getProfile()).premium).toMatchObject({ tier: 'plus', isTrial: true });
  });

  it('drops plus for an expired period', async () => {
    subscriptionRow = { status: 'active', store: 'play', product_id: 'm', expires_at: past };
    expect(res2json(await getProfile()).premium.tier).toBe('free');
  });

  it('keeps entitlement independent of paywall visibility', async () => {
    // The property that makes premium_ui_enabled safe as a kill switch: hiding
    // the paywall must never revoke what someone paid for.
    profileRow.premium_ui_enabled = false;
    subscriptionRow = { status: 'active', store: 'play', product_id: 'm', expires_at: future };
    const { premium } = res2json(await getProfile());
    expect(premium).toMatchObject({ tier: 'plus', uiEnabled: false });
  });

  it('surfaces the flag when enabled for an account', async () => {
    profileRow.premium_ui_enabled = true;
    expect(res2json(await getProfile()).premium.uiEnabled).toBe(true);
  });

  it('marks a pre-launch account grandfathered', async () => {
    expect(res2json(await getProfile()).premium.isGrandfathered).toBe(true);
  });

  it('does not disturb the rest of the profile payload', async () => {
    const body = res2json(await getProfile());
    expect(body).toMatchObject({
      id: 'user-1',
      displayName: 'Rider',
      notifyWeather: true,
      quietHoursStart: null,
    });
  });
});

/** Typed accessor so tests can read `.premium` without repeating the cast. */
function res2json(res: { json: () => unknown }): {
  premium: Record<string, unknown> & { tier: string; expiresAt: string | null; uiEnabled: boolean };
  [k: string]: unknown;
} {
  return res.json() as never;
}
