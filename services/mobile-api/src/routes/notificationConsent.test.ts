// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Configurable per-test: profiles state read by the ON path, and call
// recorders for updates/deletes.
const consentRow: {
  notify_riding_tips: boolean;
  notify_riding_tips_consented_at: string | null;
} = { notify_riding_tips: false, notify_riding_tips_consented_at: null };

const profileUpdates: Array<Record<string, unknown>> = [];
const pushTokenDeletes: string[] = [];

vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: { ...consentRow }, error: null }),
              ),
              single: vi.fn(() =>
                Promise.resolve({ data: { ...consentRow }, error: null }),
              ),
            })),
          })),
          update: vi.fn((values: Record<string, unknown>) => ({
            eq: vi.fn(() => {
              profileUpdates.push(values);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }
      if (table === 'push_tokens') {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn((_col: string, userId: string) => {
              pushTokenDeletes.push(userId);
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    }),
  },
}));

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';

// Mutable auth identity: email null = anonymous Supabase session.
const authUser: { id: string; email: string | null } = {
  id: 'anon-user-1',
  email: null,
};

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    dependencies: {
      authenticateUser: async () => ({ ...authUser }),
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  profileUpdates.length = 0;
  pushTokenDeletes.length = 0;
  consentRow.notify_riding_tips = false;
  consentRow.notify_riding_tips_consented_at = null;
  authUser.id = 'anon-user-1';
  authUser.email = null;
});

const patchConsent = (ridingTips: unknown) =>
  app.inject({
    method: 'PATCH',
    url: '/v1/profile/notification-consent',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    payload: { ridingTips },
  });

describe('PATCH /v1/profile/notification-consent', () => {
  it('is anonymous-allowed: an anonymous session can record consent (ON)', async () => {
    const response = await patchConsent(true);
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ridingTips).toBe(true);
    expect(typeof body.consentedAt).toBe('string');
    expect(profileUpdates).toHaveLength(1);
    expect(profileUpdates[0].notify_riding_tips).toBe(true);
    expect(profileUpdates[0].notify_riding_tips_consented_at).toBe(body.consentedAt);
  });

  it('repeat ON never overwrites the original consent timestamp (GDPR record)', async () => {
    const originalConsent = '2026-07-01T10:00:00.000Z';
    consentRow.notify_riding_tips = true;
    consentRow.notify_riding_tips_consented_at = originalConsent;

    const response = await patchConsent(true);
    expect(response.statusCode).toBe(200);
    expect(response.json().consentedAt).toBe(originalConsent);
    expect(profileUpdates[0].notify_riding_tips_consented_at).toBe(originalConsent);
  });

  it('ON after a prior withdrawal (flag false) sets a FRESH consent timestamp', async () => {
    consentRow.notify_riding_tips = false;
    consentRow.notify_riding_tips_consented_at = null;

    const response = await patchConsent(true);
    const consentedAt = response.json().consentedAt as string;
    expect(Date.parse(consentedAt)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('OFF clears the flag, nulls the record, and deletes push tokens for ANONYMOUS users', async () => {
    const response = await patchConsent(false);
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ridingTips).toBe(false);
    expect(body.consentedAt).toBeNull();
    expect(profileUpdates[0]).toEqual({
      notify_riding_tips: false,
      notify_riding_tips_consented_at: null,
    });
    expect(pushTokenDeletes).toEqual(['anon-user-1']);
  });

  it('OFF for a REGISTERED user keeps their push tokens (other notification categories must not regress)', async () => {
    authUser.id = 'full-user-1';
    authUser.email = 'rider@example.com';

    const response = await patchConsent(false);
    expect(response.statusCode).toBe(200);
    expect(pushTokenDeletes).toHaveLength(0);
  });

  it('rejects a missing/invalid body (schema-validated)', async () => {
    const response = await patchConsent('yes-please');
    expect(response.statusCode).toBe(400);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/profile/notification-consent',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/profile/notification-consent',
      headers: { 'content-type': 'application/json' },
      payload: { ridingTips: true },
    });
    expect(response.statusCode).toBe(401);
  });
});
