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

export const zustandStorage: StateStorage = {
  getItem: (name) => keyValueStorage.getString(name),
  setItem: (name, value) => keyValueStorage.setString(name, value),
  removeItem: (name) => keyValueStorage.delete(name),
};
