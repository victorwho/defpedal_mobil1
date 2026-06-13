import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

// Adapter used by Zustand's persist middleware and by ad-hoc consumers that
// need a key/value store (offline route cache, background navigation
// snapshot).
//
// History: this module previously tried to use `react-native-mmkv`. First the
// package was never installed; then it was installed but loaded via a
// dynamic require Metro couldn't trace so only the native .so shipped while
// the JS stub was missing from the bundle; finally after a proper static
// import the JS was bundled but MMKV v2 requires the legacy NativeModules
// bridge which New Architecture / bridgeless (enabled on preview + production
// builds) does not expose — so `new MMKV()` threw and we landed in the
// in-memory fallback anyway. MMKV v4 would have worked but depends on
// react-native-nitro-modules, whose C++ build fails under NDK 27's removal of
// the `-fuse-ld=gold` linker.
//
// Switched to `@react-native-async-storage/async-storage`. It has no bridge
// requirement, works under New Architecture, and requires no native
// build-system configuration beyond autolinking. The trade-off is that it is
// an async API, so the `keyValueStorage` contract is now async and the three
// consumer modules (offlineRouteCache, backgroundNavigation, Zustand persist)
// awaited internally.

type AsyncStorageEngine = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStorage = new Map<string, string>();

const memoryEngine: AsyncStorageEngine = {
  getItem: async (key) => memoryStorage.get(key) ?? null,
  setItem: async (key, value) => {
    memoryStorage.set(key, value);
  },
  removeItem: async (key) => {
    memoryStorage.delete(key);
  },
};

// Probe AsyncStorage once at module load. In happy-dom/Node test runs, the
// native binding isn't bound and `getItem` either throws or resolves with
// data from jest-style mocks we don't install. The in-memory fallback keeps
// the test suite functional without additional setup.
const mkNativeEngine = (): AsyncStorageEngine | null => {
  try {
    if (typeof AsyncStorage?.getItem !== 'function') return null;
    return {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
    };
  } catch {
    return null;
  }
};

const nativeEngine = mkNativeEngine();
const engine: AsyncStorageEngine = nativeEngine ?? memoryEngine;

// Exposed for Diagnostics so we can tell at a glance whether the app actually
// wired up persistent storage. When this is 'memory', nothing the user does
// will survive a cold start — that's a build/native-link regression.
export const storageEngineKind: 'async-storage' | 'memory' = nativeEngine
  ? 'async-storage'
  : 'memory';

export const keyValueStorage = {
  getString: async (key: string): Promise<string | null> => {
    try {
      return await engine.getItem(key);
    } catch {
      return null;
    }
  },
  setString: async (key: string, value: string): Promise<void> => {
    try {
      await engine.setItem(key, value);
    } catch {
      // Non-fatal: persistence failure should not crash the app.
    }
  },
  delete: async (key: string): Promise<void> => {
    try {
      await engine.removeItem(key);
    } catch {
      // Non-fatal.
    }
  },
};

// ---------------------------------------------------------------------------
// Debounced persist adapter (review 2026-06-12 perf P2)
//
// During navigation the store is written on EVERY GPS sample (~1/2s, twice:
// updateNavigationProgress + appendGpsBreadcrumb), and the persisted slice
// includes the up-to-2000-crumb ring buffer + full route geometries. zustand
// re-runs partialize + JSON.stringify + an AsyncStorage write on every
// set() — so a ride churned dozens of full-store serializations per minute on
// the JS thread.
//
// We coalesce writes with a trailing debounce, capped by a max-wait so a
// continuous burst still flushes regularly, and expose flushPersistedWrites()
// for the app to call on background/inactive so a kill loses nothing. Crash-
// recovery granularity of a few seconds is ample — and breadcrumbs are now
// independently backstopped by the background-location trail.
// ---------------------------------------------------------------------------

const PERSIST_DEBOUNCE_MS = 3_000;
const PERSIST_MAX_WAIT_MS = 8_000;

type PendingWrite = { key: string; value: string };

const immediateStorage: StateStorage = {
  getItem: (name) => keyValueStorage.getString(name),
  setItem: (name, value) => keyValueStorage.setString(name, value),
  removeItem: (name) => keyValueStorage.delete(name),
};

/**
 * Wrap a StateStorage with a trailing debounce (capped by a max-wait). Pure +
 * exported so the coalescing behaviour is unit-testable with fake timers.
 */
export const createDebouncedStorage = (
  inner: StateStorage,
  opts: { debounceMs: number; maxWaitMs: number },
): StateStorage & { flush: () => void } => {
  let pending: PendingWrite | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const flush = (): void => {
    if (!pending) {
      clearTimers();
      return;
    }
    const { key, value } = pending;
    pending = null;
    clearTimers();
    void inner.setItem(key, value);
  };

  return {
    flush,
    getItem: (name) => {
      // Read-your-writes: return the not-yet-flushed value if one is queued.
      if (pending?.key === name) return Promise.resolve(pending.value);
      return inner.getItem(name);
    },
    setItem: (name, value) => {
      pending = { key: name, value };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, opts.debounceMs);
      // Anchored at the first write of a burst — guarantees a flush at least
      // every maxWaitMs even while continuous GPS ticks keep resetting the
      // debounce timer.
      if (!maxWaitTimer) maxWaitTimer = setTimeout(flush, opts.maxWaitMs);
      return Promise.resolve();
    },
    removeItem: (name) => {
      if (pending?.key === name) {
        pending = null;
        clearTimers();
      }
      return inner.removeItem(name);
    },
  };
};

// Disable the debounce under the vitest runner: the global async-storage mock
// makes the persist adapter active in most store-touching tests, and the
// module-level timers would otherwise outlive a test file and cause flaky
// cross-file failures. The debounce logic itself is covered by
// storageDebounce.test.ts via the factory above.
const isTestEnv =
  typeof process !== 'undefined' && Boolean((process as { env?: Record<string, string> }).env?.VITEST);

const debouncedStorage = createDebouncedStorage(immediateStorage, {
  debounceMs: PERSIST_DEBOUNCE_MS,
  maxWaitMs: PERSIST_MAX_WAIT_MS,
});

export const zustandStorage: StateStorage = isTestEnv ? immediateStorage : debouncedStorage;

/** Force any pending persisted write out immediately (call on app background). */
export const flushPersistedWrites = (): void => {
  if (!isTestEnv) debouncedStorage.flush();
};
