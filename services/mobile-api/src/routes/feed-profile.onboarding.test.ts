// @vitest-environment node
//
// HTTP-level coverage for the onboarding rollout switch on the profile read
// (docs/plans/onboarding-first-ride.md [D12]).
//
// Two properties the switch depends on, neither visible to a lib test:
//  - Fastify strips undeclared response fields (gotcha #9), so the field must
//    survive serialisation.
//  - Onboarding runs BEFORE signup, so an ANONYMOUS session must receive it.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const profileRow: Record<string, unknown> = {
  id: 'anon-1',
  display_name: '',
  username: null,
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
  created_at: '2026-10-16T00:00:00.000Z',
  premium_ui_enabled: false,
};

vi.mock('../lib/supabaseAdmin', () => {
  const single = () => Promise.resolve({ data: { ...profileRow }, error: null });
  return {
    supabaseAdmin: {
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ single, maybeSingle: single })) })),
          };
        }
        if (table === 'subscriptions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          };
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) };
      }),
    },
  };
});

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    dependencies: {
      // Anonymous Supabase session: no email.
      authenticateUser: async () => ({ id: 'anon-1', email: null }),
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  delete process.env.ONBOARDING_FIRST_RIDE_ENABLED;
  delete process.env.ONBOARDING_ANONYMOUS_RIDE_ENABLED;
});

const getProfile = () =>
  app.inject({
    method: 'GET',
    url: '/v1/profile',
    headers: { authorization: 'Bearer test-token' },
  });

describe('GET /v1/profile — onboardingFirstRideEnabled', () => {
  it('reaches an anonymous session and defaults to false', async () => {
    const res = await getProfile();
    expect(res.statusCode).toBe(200);
    expect(res.json().onboardingFirstRideEnabled).toBe(false);
  });

  it('is true when the env switch is on', async () => {
    process.env.ONBOARDING_FIRST_RIDE_ENABLED = 'true';
    const res = await getProfile();
    expect(res.statusCode).toBe(200);
    expect(res.json().onboardingFirstRideEnabled).toBe(true);
  });

  it('carries the anonymous-first-ride switch to an anonymous session, default off', async () => {
    expect((await getProfile()).json().onboardingAnonymousRideEnabled).toBe(false);
    process.env.ONBOARDING_ANONYMOUS_RIDE_ENABLED = 'true';
    expect((await getProfile()).json().onboardingAnonymousRideEnabled).toBe(true);
  });

  it('treats anything other than an explicit on value as off', async () => {
    process.env.ONBOARDING_FIRST_RIDE_ENABLED = 'yes please';
    expect((await getProfile()).json().onboardingFirstRideEnabled).toBe(false);
  });
});
