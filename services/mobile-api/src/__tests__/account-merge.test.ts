import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mutable mock state (hoisted-safe via top-level lets)
// ---------------------------------------------------------------------------

type MockUser = { id: string; is_anonymous?: boolean; email?: string | null };

let mockAnonUser: MockUser | null = null;
let mockAnonError: { message: string } | null = null;
let mockRpcResult: { data: unknown; error: { message: string } | null } = {
  data: { merged: true },
  error: null,
};
let mockDeleteUserResult: { error: { message: string } | null } = { error: null };
const rpcSpy = vi.fn();
const deleteUserSpy = vi.fn(async () => mockDeleteUserResult);
const getUserSpy = vi.fn(async () => ({ data: { user: mockAnonUser }, error: mockAnonError }));

vi.mock('../lib/supabaseAuth', () => ({
  supabaseAuthClient: { auth: { getUser: (token: string) => getUserSpy() } },
}));

vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => {
      rpcSpy(...args);
      return Promise.resolve(mockRpcResult);
    },
    auth: {
      admin: {
        deleteUser: (id: string) => deleteUserSpy(id),
      },
    },
  },
}));

import { buildApp } from '../app';
import type { MobileApiDependencies } from '../lib/dependencies';

const TARGET_ID = '00000000-0000-4000-8000-000000000002';
const ANON_ID = '00000000-0000-4000-8000-000000000099';

const fullUserHeaders = { authorization: 'Bearer target-token', 'content-type': 'application/json' };

const buildTestApp = (overrides: Partial<MobileApiDependencies> = {}) =>
  buildApp({
    dependencies: {
      authenticateUser: vi
        .fn()
        .mockResolvedValue({ id: TARGET_ID, email: 'real@user.com' }),
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });

describe('POST /v1/account/merge-anonymous', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
    getUserSpy.mockClear();
    deleteUserSpy.mockClear();
    mockAnonUser = { id: ANON_ID, is_anonymous: true, email: null };
    mockAnonError = null;
    mockRpcResult = { data: { merged: true }, error: null };
    mockDeleteUserResult = { error: null };
  });

  it('401 when unauthenticated', async () => {
    const app = buildTestApp({ authenticateUser: vi.fn().mockResolvedValue(null) });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('403 when the caller is anonymous (no email)', async () => {
    const app = buildTestApp({
      authenticateUser: vi.fn().mockResolvedValue({ id: TARGET_ID, email: null }),
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('400 when anonymousAccessToken is missing', async () => {
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses (merged:false) when the source token is NOT anonymous', async () => {
    mockAnonUser = { id: ANON_ID, is_anonymous: false, email: 'someone@else.com' };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'not-anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merged: false, reason: 'source_not_anonymous' });
    expect(rpcSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuses (merged:false) when source and target are the same user', async () => {
    mockAnonUser = { id: TARGET_ID, is_anonymous: true, email: null };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merged: false, reason: 'same_user' });
    expect(rpcSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('401 when the anonymous token is invalid', async () => {
    mockAnonUser = null;
    mockAnonError = { message: 'invalid token' };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'invalid-token-string' },
    });
    expect(res.statusCode).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('calls the merge RPC with both verified ids and returns its result', async () => {
    mockRpcResult = { data: { merged: false, reason: 'target_not_empty' }, error: null };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(rpcSpy).toHaveBeenCalledWith('merge_anonymous_account', {
      p_anon_id: ANON_ID,
      p_target_id: TARGET_ID,
    });
    expect(res.json()).toEqual({ merged: false, reason: 'target_not_empty' });
    await app.close();
  });

  // ── Replay guard, token layer (audit 2026-07-05 SEC-1) ──

  it('deletes the anonymous auth user after a successful merge', async () => {
    mockRpcResult = { data: { merged: true }, error: null };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merged: true });
    expect(deleteUserSpy).toHaveBeenCalledWith(ANON_ID);
    await app.close();
  });

  it('does NOT delete the anonymous auth user when the merge is refused', async () => {
    mockRpcResult = { data: { merged: false, reason: 'target_not_empty' }, error: null };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(deleteUserSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('still returns merged:true when the anon-user delete fails (SQL merged_at guard covers replay)', async () => {
    mockRpcResult = { data: { merged: true }, error: null };
    mockDeleteUserResult = { error: { message: 'admin API unavailable' } };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merged: true });
    expect(deleteUserSpy).toHaveBeenCalledWith(ANON_ID);
    await app.close();
  });

  it('refusal reason source_already_merged passes through to the client', async () => {
    mockRpcResult = { data: { merged: false, reason: 'source_already_merged' }, error: null };
    const app = buildTestApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/account/merge-anonymous',
      headers: fullUserHeaders,
      payload: { anonymousAccessToken: 'anon-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merged: false, reason: 'source_already_merged' });
    expect(deleteUserSpy).not.toHaveBeenCalled();
    await app.close();
  });
});
