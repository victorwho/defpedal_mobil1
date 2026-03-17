import { describe, expect, it } from 'vitest';

import { buildCacheKey, createMemoryRouteResponseCache } from './cache';

describe('buildCacheKey', () => {
  it('creates stable keys for equivalent objects', () => {
    expect(
      buildCacheKey('route_preview', {
        destination: {
          lon: 26.09,
          lat: 44.43,
        },
        mode: 'safe',
      }),
    ).toBe(
      buildCacheKey('route_preview', {
        mode: 'safe',
        destination: {
          lat: 44.43,
          lon: 26.09,
        },
      }),
    );
  });
});

describe('createMemoryRouteResponseCache', () => {
  it('returns stored entries before expiration and clears them after ttl', async () => {
    let now = 1_000;
    const cache = createMemoryRouteResponseCache(() => now);

    await cache.set('preview:key', { ok: true }, 500);

    await expect(cache.get<{ ok: boolean }>('preview:key')).resolves.toEqual({ ok: true });

    now = 1_600;

    await expect(cache.get('preview:key')).resolves.toBeNull();
  });
});
