import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  mobileEnv: {
    mobileApiUrl: 'https://test-api.example.com',
    usesNgrokTunnel: false,
  },
}));

vi.mock('./supabase', () => ({
  getAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import { mobileApiFetch } from './mobileApiFetch';
import { ApiClientError } from './apiFetch';
import { getAccessToken, refreshAccessToken } from './supabase';

const jsonResponse = (data: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }) as Response;

const FAST_RETRY = { backoffBaseMs: 0, random: () => 0.5 };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue('initial-token');
  vi.mocked(refreshAccessToken).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Base URL + headers
// ---------------------------------------------------------------------------

describe('mobileApiFetch — URL + headers', () => {
  it('prepends the configured base URL to the path', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await mobileApiFetch('/v1/feed', FAST_RETRY);

    expect(fetchSpy.mock.calls[0][0]).toBe('https://test-api.example.com/v1/feed');
  });

  it('injects Content-Type and Authorization headers from the access token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await mobileApiFetch('/v1/feed', FAST_RETRY);

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer initial-token');
  });

  it('omits Authorization header when no access token is available', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await mobileApiFetch('/v1/feed', FAST_RETRY);

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('lets caller-supplied headers override defaults', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await mobileApiFetch('/v1/feed', {
      ...FAST_RETRY,
      headers: { 'Content-Type': 'application/x-custom', 'X-Extra': 'yes' },
    });

    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-custom');
    expect(headers['X-Extra']).toBe('yes');
    // Authorization is still injected even with custom headers
    expect(headers.Authorization).toBe('Bearer initial-token');
  });
});

// ---------------------------------------------------------------------------
// 401 → refresh-and-retry-once
// ---------------------------------------------------------------------------

describe('mobileApiFetch — 401 refresh path', () => {
  it('refreshes the token and re-issues the request on 401', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce('refreshed-token');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'expired' }),
        text: async () => '{"error":"expired"}',
      } as Response)
      .mockResolvedValueOnce(jsonResponse({ payload: 'ok' }));

    const result = await mobileApiFetch<{ payload: string }>('/v1/feed', FAST_RETRY);

    expect(result).toEqual({ payload: 'ok' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Initial call used the original token
    const firstHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe('Bearer initial-token');

    // Retry used the refreshed token
    const secondHeaders = fetchSpy.mock.calls[1][1]?.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe('Bearer refreshed-token');
  });

  it('throws the original 401 when refresh returns null (no session)', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce(null);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'expired' }),
      text: async () => '{"error":"expired"}',
    } as Response);

    try {
      await mobileApiFetch('/v1/feed', FAST_RETRY);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).kind).toBe('http');
      expect((error as ApiClientError).status).toBe(401);
    }
  });

  it('does NOT refresh on 403 (different from 401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
      text: async () => '{"error":"forbidden"}',
    } as Response);

    await expect(mobileApiFetch('/v1/feed', FAST_RETRY)).rejects.toMatchObject({
      status: 403,
    });

    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('propagates non-http errors (timeout, network) without invoking refresh', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      mobileApiFetch('/v1/feed', { ...FAST_RETRY, maxRetries: 0 }),
    ).rejects.toMatchObject({ kind: 'network' });

    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Base URL fail-fast
// ---------------------------------------------------------------------------

describe('mobileApiFetch — base URL validation', () => {
  it('throws synchronously when EXPO_PUBLIC_MOBILE_API_URL is not configured', async () => {
    // Re-import with mobileApiUrl unset for this single case.
    vi.resetModules();
    vi.doMock('./env', () => ({ mobileEnv: { mobileApiUrl: '', usesNgrokTunnel: false } }));
    vi.doMock('./supabase', () => ({
      getAccessToken: vi.fn().mockResolvedValue(null),
      refreshAccessToken: vi.fn(),
    }));

    const { mobileApiFetch: localMobileApiFetch } = await import('./mobileApiFetch');

    await expect(localMobileApiFetch('/v1/feed')).rejects.toThrow(
      /EXPO_PUBLIC_MOBILE_API_URL is not configured/,
    );

    vi.doUnmock('./env');
    vi.doUnmock('./supabase');
  });
});
