type CacheEntry<TValue> = {
  expiresAt: number;
  value: TValue;
};

export type RouteResponseCache = {
  backend: 'memory' | 'redis';
  get: <TValue>(key: string) => Promise<TValue | null>;
  set: <TValue>(key: string, value: TValue, ttlMs: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(',')}}`;
};

export const buildCacheKey = (namespace: string, value: unknown) =>
  `${namespace}:${stableSerialize(value)}`;

export const createMemoryRouteResponseCache = (
  now: () => number = () => Date.now(),
): RouteResponseCache => {
  const store = new Map<string, CacheEntry<unknown>>();

  const get = <TValue>(key: string): TValue | null => {
    const entry = store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= now()) {
      store.delete(key);
      return null;
    }

    return entry.value as TValue;
  };

  return {
    backend: 'memory',
    get: async <TValue>(key: string) => get<TValue>(key),
    set: async <TValue>(key: string, value: TValue, ttlMs: number) => {
      if (ttlMs <= 0) {
        store.delete(key);
        return;
      }

      store.set(key, {
        expiresAt: now() + ttlMs,
        value,
      });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    clear: async () => {
      store.clear();
    },
  };
};
