import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiFetch, isApiClientError } from './apiFetch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonResponse = (data: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }) as Response;

const textResponse = (body: string, status: number): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('not JSON');
    },
    text: async () => body,
  }) as Response;

// computeBackoff with random=0.5 yields zero jitter: (0.5*0.4 - 0.2) = 0.
// Combined with backoffBaseMs=0, every retry's sleep is 0ms so tests run
// against real timers without waiting.
const FAST_RETRY: Pick<Parameters<typeof apiFetch>[1] & object, 'backoffBaseMs' | 'random'> = {
  backoffBaseMs: 0,
  random: () => 0.5,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('apiFetch — happy path', () => {
  it('returns parsed JSON on 200', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ hello: 'world' }));

    const result = await apiFetch<{ hello: string }>('https://example.com/x', FAST_RETRY);

    expect(result).toEqual({ hello: 'world' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('passes method + body + headers through to fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch('https://example.com/x', {
      ...FAST_RETRY,
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'X-Test': 'true' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.com/x');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect((init?.headers as Record<string, string>)['X-Test']).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 4xx — no retry
// ---------------------------------------------------------------------------

describe('apiFetch — 4xx errors', () => {
  it('throws ApiClientError(kind=http, status=400) without retry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(textResponse('{"error":"bad input"}', 400));

    await expect(apiFetch('https://example.com/x', FAST_RETRY)).rejects.toMatchObject({
      name: 'ApiClientError',
      kind: 'http',
      status: 400,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('includes (truncated) response body on http errors', async () => {
    const longBody = 'x'.repeat(2000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textResponse(longBody, 422));

    try {
      await apiFetch('https://example.com/x', FAST_RETRY);
      throw new Error('expected throw');
    } catch (error) {
      expect(isApiClientError(error)).toBe(true);
      const apiErr = error as ApiClientError;
      expect(apiErr.body?.length).toBe(500);
      expect(apiErr.body).toBe('x'.repeat(500));
    }
  });

  it('does NOT retry on 404', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(textResponse('not found', 404));

    await expect(apiFetch('https://example.com/x', FAST_RETRY)).rejects.toMatchObject({
      kind: 'http',
      status: 404,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5xx — retry
// ---------------------------------------------------------------------------

describe('apiFetch — 5xx retry', () => {
  it('retries once on 500, returns success on the second attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(textResponse('boom', 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await apiFetch<{ ok: boolean }>('https://example.com/x', FAST_RETRY);

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries on persistent 503', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(textResponse('Service Unavailable', 503));

    await expect(
      apiFetch('https://example.com/x', { ...FAST_RETRY, maxRetries: 2 }),
    ).rejects.toMatchObject({ kind: 'http', status: 503 });

    // 1 initial + 2 retries = 3 attempts
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('retries on 408 Request Timeout (server-side)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(textResponse('server timeout', 408))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await apiFetch('https://example.com/x', FAST_RETRY);

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 Too Many Requests', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(textResponse('slow down', 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch('https://example.com/x', FAST_RETRY);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Network errors — retry
// ---------------------------------------------------------------------------

describe('apiFetch — network errors', () => {
  it('retries on fetch rejection and succeeds on the second attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await apiFetch('https://example.com/x', FAST_RETRY);

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws ApiClientError(kind=network) after exhausting retries', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      apiFetch('https://example.com/x', { ...FAST_RETRY, maxRetries: 2 }),
    ).rejects.toMatchObject({ kind: 'network' });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Timeout — NO retry
// ---------------------------------------------------------------------------

describe('apiFetch — timeout', () => {
  it('throws ApiClientError(kind=timeout) and does not retry', async () => {
    // Fetch returns a never-resolving promise that aborts only when its
    // own signal fires.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

    const start = Date.now();
    await expect(
      apiFetch('https://example.com/x', { ...FAST_RETRY, timeoutMs: 25 }),
    ).rejects.toMatchObject({ kind: 'timeout' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Caller-aborted requests propagate the original AbortError
// ---------------------------------------------------------------------------

describe('apiFetch — caller abort', () => {
  it('propagates the caller AbortError without wrapping it', async () => {
    const controller = new AbortController();

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted by caller');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const pending = apiFetch('https://example.com/x', {
      ...FAST_RETRY,
      signal: controller.signal,
    });

    // Abort *after* the call has started.
    setTimeout(() => controller.abort(), 5);

    try {
      await pending;
      throw new Error('expected reject');
    } catch (error) {
      // Should be the raw AbortError, NOT an ApiClientError envelope.
      expect(isApiClientError(error)).toBe(false);
      expect((error as Error).name).toBe('AbortError');
    }
  });
});

// ---------------------------------------------------------------------------
// JSON parse failure on 2xx
// ---------------------------------------------------------------------------

describe('apiFetch — JSON parse failure', () => {
  it('throws ApiClientError(kind=http) when 200 body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
      text: async () => 'not json',
    } as Response);

    await expect(apiFetch('https://example.com/x', FAST_RETRY)).rejects.toMatchObject({
      kind: 'http',
      status: 200,
    });
  });
});

// ---------------------------------------------------------------------------
// isApiClientError type guard
// ---------------------------------------------------------------------------

describe('isApiClientError', () => {
  it('returns true for ApiClientError instances', () => {
    expect(isApiClientError(new ApiClientError({ kind: 'network', message: 'x' }))).toBe(true);
  });

  it('returns false for plain Error / non-error values', () => {
    expect(isApiClientError(new Error('plain'))).toBe(false);
    expect(isApiClientError(null)).toBe(false);
    expect(isApiClientError(undefined)).toBe(false);
    expect(isApiClientError('string')).toBe(false);
  });
});
