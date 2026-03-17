import { describe, expect, it } from 'vitest';

import { buildRateLimitIdentity, createMemoryRateLimiter } from './rateLimit';

describe('buildRateLimitIdentity', () => {
  it('prefers user ids over ip addresses', () => {
    expect(
      buildRateLimitIdentity({
        userId: 'user-123',
        ip: '127.0.0.1',
      }),
    ).toBe('user:user-123');
  });

  it('falls back to the remote ip when no user is known', () => {
    expect(
      buildRateLimitIdentity({
        ip: '127.0.0.1',
      }),
    ).toBe('ip:127.0.0.1');
  });
});

describe('createMemoryRateLimiter', () => {
  it('allows requests until the policy limit and blocks the next one', async () => {
    let now = 10_000;
    const limiter = createMemoryRateLimiter(() => now);

    await expect(
      limiter.consume({
        bucket: 'route_preview',
        key: 'ip:127.0.0.1',
        limit: 2,
        windowMs: 1_000,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });

    await expect(
      limiter.consume({
        bucket: 'route_preview',
        key: 'ip:127.0.0.1',
        limit: 2,
        windowMs: 1_000,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });

    await expect(
      limiter.consume({
        bucket: 'route_preview',
        key: 'ip:127.0.0.1',
        limit: 2,
        windowMs: 1_000,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterMs: 1_000,
    });

    now = 11_100;

    await expect(
      limiter.consume({
        bucket: 'route_preview',
        key: 'ip:127.0.0.1',
        limit: 2,
        windowMs: 1_000,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });
});
