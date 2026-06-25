import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../env', () => ({
  mobileEnv: { mobileApiUrl: 'https://api.test' },
}));

import {
  computeSkewSeconds,
  getServerClockSkewSeconds,
  CLOCK_SKEW_WARN_THRESHOLD_SECONDS,
} from '../clockSkew';

const SERVER = 'Thu, 25 Jun 2026 10:00:00 GMT';
const SERVER_MS = Date.parse(SERVER);

describe('computeSkewSeconds', () => {
  it('returns null for a missing header', () => {
    expect(computeSkewSeconds(null, SERVER_MS)).toBeNull();
    expect(computeSkewSeconds(undefined, SERVER_MS)).toBeNull();
    expect(computeSkewSeconds('', SERVER_MS)).toBeNull();
  });

  it('returns null for an unparseable header', () => {
    expect(computeSkewSeconds('not-a-date', SERVER_MS)).toBeNull();
  });

  it('returns 0 when the device matches the server', () => {
    expect(computeSkewSeconds(SERVER, SERVER_MS)).toBe(0);
  });

  it('is positive when the device is ahead of the server', () => {
    expect(computeSkewSeconds(SERVER, SERVER_MS + 15 * 60 * 1000)).toBe(900);
  });

  it('is negative when the device is behind the server', () => {
    expect(computeSkewSeconds(SERVER, SERVER_MS - 12 * 60 * 1000)).toBe(-720);
  });
});

describe('getServerClockSkewSeconds', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the skew derived from the response Date header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      headers: { get: (k: string) => (k.toLowerCase() === 'date' ? SERVER : null) },
    });
    vi.stubGlobal('fetch', fetchMock);

    const skew = await getServerClockSkewSeconds(SERVER_MS + 600_000); // device +10 min
    expect(skew).toBe(600);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getServerClockSkewSeconds(SERVER_MS)).toBeNull();
  });

  it('returns null when no Date header is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ headers: { get: () => null } }));
    expect(await getServerClockSkewSeconds(SERVER_MS)).toBeNull();
  });

  it('uses a warn threshold below the native ±600s failure boundary', () => {
    expect(CLOCK_SKEW_WARN_THRESHOLD_SECONDS).toBeGreaterThan(0);
    expect(CLOCK_SKEW_WARN_THRESHOLD_SECONDS).toBeLessThan(600);
  });
});
