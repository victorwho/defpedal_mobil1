// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  authenticateDeveloperBypassToken,
  requireAuthenticatedUser,
  getAuthenticatedUserFromRequest,
  type DeveloperAuthBypassConfig,
} from '../lib/auth';
import { HttpError } from '../lib/http';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEV_BYPASS_CONFIG: DeveloperAuthBypassConfig = {
  enabled: true,
  token: 'dev-bypass-token',
  userId: 'dev-user-id',
  email: 'dev@test.local',
};

const makeRequest = (authorizationHeader?: string) =>
  ({
    headers: authorizationHeader ? { authorization: authorizationHeader } : {},
  }) as Parameters<typeof requireAuthenticatedUser>[0];

// ---------------------------------------------------------------------------
// authenticateDeveloperBypassToken
// ---------------------------------------------------------------------------

describe('authenticateDeveloperBypassToken', () => {
  it('returns user when bypass is enabled and token matches', () => {
    const user = authenticateDeveloperBypassToken('dev-bypass-token', DEV_BYPASS_CONFIG);
    expect(user).toEqual({ id: 'dev-user-id', email: 'dev@test.local' });
  });

  it('returns null when bypass is disabled', () => {
    const config = { ...DEV_BYPASS_CONFIG, enabled: false };
    const user = authenticateDeveloperBypassToken('dev-bypass-token', config);
    expect(user).toBeNull();
  });

  it('returns null when token does not match', () => {
    const user = authenticateDeveloperBypassToken('wrong-token', DEV_BYPASS_CONFIG);
    expect(user).toBeNull();
  });

  it('returns null when bypass token is empty', () => {
    const config = { ...DEV_BYPASS_CONFIG, token: '' };
    const user = authenticateDeveloperBypassToken('', config);
    expect(user).toBeNull();
  });

  it('returns null when userId is empty', () => {
    const config = { ...DEV_BYPASS_CONFIG, userId: '' };
    const user = authenticateDeveloperBypassToken('dev-bypass-token', config);
    expect(user).toBeNull();
  });

  it('returns null email when email config is empty string', () => {
    const config = { ...DEV_BYPASS_CONFIG, email: '' };
    const user = authenticateDeveloperBypassToken('dev-bypass-token', config);
    expect(user).toEqual({ id: 'dev-user-id', email: null });
  });

  it('trims whitespace from token before comparing', () => {
    const config = { ...DEV_BYPASS_CONFIG, token: '  dev-bypass-token  ' };
    const user = authenticateDeveloperBypassToken('dev-bypass-token', config);
    expect(user).toEqual({ id: 'dev-user-id', email: 'dev@test.local' });
  });

  it('rejects tokens of different length (timing-safe branch)', () => {
    const user = authenticateDeveloperBypassToken('short', DEV_BYPASS_CONFIG);
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// requireAuthenticatedUser
// ---------------------------------------------------------------------------

describe('requireAuthenticatedUser', () => {
  const verifyAlwaysSucceeds = vi.fn().mockResolvedValue({ id: 'user-123', email: 'u@x.com' });
  const verifyAlwaysFails = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns authenticated user when bearer token is valid', async () => {
    const request = makeRequest('Bearer valid-token');
    const user = await requireAuthenticatedUser(request, verifyAlwaysSucceeds);
    expect(user).toEqual({ id: 'user-123', email: 'u@x.com' });
    expect(verifyAlwaysSucceeds).toHaveBeenCalledWith('valid-token');
  });

  it('accepts bearer token with mixed-case prefix', async () => {
    const request = makeRequest('BEARER valid-token');
    const user = await requireAuthenticatedUser(request, verifyAlwaysSucceeds);
    expect(user).toEqual({ id: 'user-123', email: 'u@x.com' });
  });

  it('throws 401 when authorization header is missing', async () => {
    const request = makeRequest();
    await expect(
      requireAuthenticatedUser(request, verifyAlwaysSucceeds),
    ).rejects.toThrow(HttpError);

    try {
      await requireAuthenticatedUser(request, verifyAlwaysSucceeds);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(401);
      expect((error as HttpError).code).toBe('UNAUTHORIZED');
    }
  });

  it('throws 401 when authorization header lacks bearer prefix', async () => {
    const request = makeRequest('Basic abc123');
    await expect(
      requireAuthenticatedUser(request, verifyAlwaysSucceeds),
    ).rejects.toThrow(HttpError);
  });

  it('throws 401 when verify function returns null (invalid token)', async () => {
    const request = makeRequest('Bearer bad-token');
    await expect(
      requireAuthenticatedUser(request, verifyAlwaysFails),
    ).rejects.toThrow(HttpError);

    try {
      await requireAuthenticatedUser(request, verifyAlwaysFails);
    } catch (error) {
      expect((error as HttpError).statusCode).toBe(401);
      expect((error as HttpError).details?.[0]).toMatch(/missing, expired, or invalid/i);
    }
  });

  it('throws 401 when bearer token is empty after trimming', async () => {
    const request = makeRequest('Bearer   ');
    await expect(
      requireAuthenticatedUser(request, verifyAlwaysFails),
    ).rejects.toThrow(HttpError);
  });
});

// ---------------------------------------------------------------------------
// getAuthenticatedUserFromRequest
// ---------------------------------------------------------------------------

describe('getAuthenticatedUserFromRequest', () => {
  const verifyAlwaysSucceeds = vi.fn().mockResolvedValue({ id: 'user-456', email: null });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user when bearer token is valid', async () => {
    const request = makeRequest('Bearer valid-token');
    const user = await getAuthenticatedUserFromRequest(request, verifyAlwaysSucceeds);
    expect(user).toEqual({ id: 'user-456', email: null });
  });

  it('returns null (not throws) when authorization header is missing', async () => {
    const request = makeRequest();
    const user = await getAuthenticatedUserFromRequest(request, verifyAlwaysSucceeds);
    expect(user).toBeNull();
    expect(verifyAlwaysSucceeds).not.toHaveBeenCalled();
  });

  it('returns null when header does not start with bearer', async () => {
    const request = makeRequest('Basic abc');
    const user = await getAuthenticatedUserFromRequest(request, verifyAlwaysSucceeds);
    expect(user).toBeNull();
  });

  it('returns null when token after bearer prefix is empty', async () => {
    const request = makeRequest('Bearer ');
    const user = await getAuthenticatedUserFromRequest(request, verifyAlwaysSucceeds);
    expect(user).toBeNull();
    expect(verifyAlwaysSucceeds).not.toHaveBeenCalled();
  });

  it('delegates to verifyAccessToken and returns its result', async () => {
    const verifyReturnsNull = vi.fn().mockResolvedValue(null);
    const request = makeRequest('Bearer expired-token');
    const user = await getAuthenticatedUserFromRequest(request, verifyReturnsNull);
    expect(user).toBeNull();
    expect(verifyReturnsNull).toHaveBeenCalledWith('expired-token');
  });
});
