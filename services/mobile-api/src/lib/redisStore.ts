import { createClient } from 'redis';

import type { RouteResponseCache } from './cache';
import type { RateLimiter } from './rateLimit';

type RedisSharedStoreOptions = {
  url: string;
  keyPrefix: string;
  connectTimeoutMs: number;
};

type RedisSharedStore = {
  routeResponseCache: RouteResponseCache;
  rateLimiter: RateLimiter;
  initialize: () => Promise<void>;
  dispose: () => Promise<void>;
  backend: 'redis';
};

const createPrefixedKey = (prefix: string, group: string, key: string) =>
  `${prefix}:${group}:${key}`;

type RedisClient = ReturnType<typeof createClient>;

const createScanClear = (
  client: RedisClient,
  pattern: string,
) => async () => {
    for await (const keys of client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (keys.length > 0) {
        await client.del(keys);
      }
    }
  };

export const createRedisSharedStore = (
  options: RedisSharedStoreOptions,
): RedisSharedStore => {
  const client = createClient({
    url: options.url,
    socket: {
      connectTimeout: options.connectTimeoutMs,
    },
  });
  let connectionPromise: Promise<void> | null = null;

  client.on('error', (error) => {
    console.error('[mobile-api] Redis client error', error);
  });

  const ensureConnected = async () => {
    if (client.isOpen) {
      return;
    }

    if (!connectionPromise) {
      connectionPromise = client.connect().then(() => undefined);
    }

    await connectionPromise;
  };

  const cachePattern = `${options.keyPrefix}:route-cache:*`;
  const rateLimitPattern = `${options.keyPrefix}:rate-limit:*`;

  return {
    backend: 'redis',
    routeResponseCache: {
      backend: 'redis',
      get: async <TValue>(key: string) => {
        await ensureConnected();
        const serialized = await client.get(createPrefixedKey(options.keyPrefix, 'route-cache', key));

        if (!serialized) {
          return null;
        }

        return JSON.parse(
          typeof serialized === 'string' ? serialized : serialized.toString('utf8'),
        ) as TValue;
      },
      set: async <TValue>(key: string, value: TValue, ttlMs: number) => {
        await ensureConnected();
        const redisKey = createPrefixedKey(options.keyPrefix, 'route-cache', key);

        if (ttlMs <= 0) {
          await client.del(redisKey);
          return;
        }

        await client.set(redisKey, JSON.stringify(value), {
          PX: ttlMs,
        });
      },
      delete: async (key: string) => {
        await ensureConnected();
        await client.del(createPrefixedKey(options.keyPrefix, 'route-cache', key));
      },
      clear: async () => {
        await ensureConnected();
        await createScanClear(client, cachePattern)();
      },
    },
    rateLimiter: {
      backend: 'redis',
      consume: async ({ bucket, key, limit, windowMs }) => {
        await ensureConnected();

        const redisKey = createPrefixedKey(
          options.keyPrefix,
          'rate-limit',
          `${bucket}:${key}`,
        );
        const count = Number(await client.incr(redisKey));

        if (count === 1) {
          await client.pExpire(redisKey, windowMs);
        }

        const ttlMs = Math.max(Number(await client.pTTL(redisKey)), 0);

        return {
          allowed: count <= limit,
          limit,
          remaining: count <= limit ? Math.max(limit - count, 0) : 0,
          resetAt: Date.now() + ttlMs,
          retryAfterMs: count <= limit ? 0 : ttlMs,
        };
      },
      clear: async () => {
        await ensureConnected();
        await createScanClear(client, rateLimitPattern)();
      },
    },
    initialize: ensureConnected,
    dispose: async () => {
      if (client.isOpen) {
        await client.quit();
      }
    },
  };
};
