export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitPolicies = {
  routePreview: RateLimitPolicy;
  routeReroute: RateLimitPolicy;
  write: RateLimitPolicy;
  hazardVote: RateLimitPolicy;
  // Read-heavy social surface bucket — separate from routePreview so heavy
  // tab-switching on the leaderboard / City Heartbeat doesn't starve a
  // rider's actual route preview budget (and vice versa).
  leaderboard: RateLimitPolicy;
  // UGC moderation buckets (compliance plan item 7).
  report: RateLimitPolicy;
  block: RateLimitPolicy;
  comment: RateLimitPolicy;
  // Free-text suggestion submissions — tight bucket because each row is a
  // human-review cost and the surface is abuse-prone.
  citySuggestion: RateLimitPolicy;
  // Follow-graph writes (follow/unfollow/approve/decline) — bounded so one
  // account cannot mass-follow to spam push notifications or churn
  // follower counts (audit 2026-07-05 SEC-2).
  follow: RateLimitPolicy;
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
