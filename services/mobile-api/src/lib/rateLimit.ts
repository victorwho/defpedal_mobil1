export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitPolicies = {
  routePreview: RateLimitPolicy;
  routeReroute: RateLimitPolicy;
  write: RateLimitPolicy;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

export type RateLimiter = {
  backend: 'memory' | 'redis';
  consume: (input: {
    bucket: string;
    key: string;
    limit: number;
    windowMs: number;
  }) => Promise<RateLimitDecision>;
  clear: () => Promise<void>;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export const buildRateLimitIdentity = (identity: {
  ip?: string;
  userId?: string;
  routeKey?: string;
}) => {
  if (identity.userId) {
    return `user:${identity.userId}`;
  }

  if (identity.routeKey) {
    return `route:${identity.routeKey}`;
  }

  return `ip:${identity.ip ?? 'unknown'}`;
};

export const createMemoryRateLimiter = (
  now: () => number = () => Date.now(),
): RateLimiter => {
  const store = new Map<string, RateLimitEntry>();

  return {
    backend: 'memory',
    consume: async ({ bucket, key, limit, windowMs }) => {
      const namespacedKey = `${bucket}:${key}`;
      const currentTime = now();
      const currentEntry = store.get(namespacedKey);

      if (!currentEntry || currentEntry.resetAt <= currentTime) {
        const freshEntry = {
          count: 1,
          resetAt: currentTime + windowMs,
        };

        store.set(namespacedKey, freshEntry);

        return {
          allowed: true,
          limit,
          remaining: Math.max(limit - 1, 0),
          resetAt: freshEntry.resetAt,
          retryAfterMs: 0,
        };
      }

      if (currentEntry.count >= limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: currentEntry.resetAt,
          retryAfterMs: Math.max(currentEntry.resetAt - currentTime, 0),
        };
      }

      currentEntry.count += 1;
      store.set(namespacedKey, currentEntry);

      return {
        allowed: true,
        limit,
        remaining: Math.max(limit - currentEntry.count, 0),
        resetAt: currentEntry.resetAt,
        retryAfterMs: 0,
      };
    },
    clear: async () => {
      store.clear();
    },
  };
};
