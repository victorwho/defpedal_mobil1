import type { StateStorage } from 'zustand/middleware';

type StorageEngine = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
};

const memoryStorage = new Map<string, string>();

const memoryEngine: StorageEngine = {
  getString: (key) => memoryStorage.get(key),
  set: (key, value) => {
    memoryStorage.set(key, value);
  },
  delete: (key) => {
    memoryStorage.delete(key);
  },
};

let cachedEngine: StorageEngine | null = null;

const canUseMmkv = () =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

const loadMmkvEngine = (): StorageEngine | null => {
  if (!canUseMmkv()) {
    return null;
  }

  try {
    const globalRequire = (globalThis as { require?: (moduleName: string) => unknown }).require;

    if (!globalRequire) {
      return null;
    }

    const mmkvModule = globalRequire('react-native-mmkv') as {
      MMKV: new (options?: { id?: string }) => StorageEngine;
    };

    return new mmkvModule.MMKV({
      id: 'defensivepedal-mobile',
    });
  } catch {
    return null;
  }
};

export const getStorageEngine = (): StorageEngine => {
  if (!cachedEngine) {
    cachedEngine = loadMmkvEngine() ?? memoryEngine;
  }

  return cachedEngine;
};

export const keyValueStorage = {
  getString: (key: string): string | undefined => getStorageEngine().getString(key),
  setString: (key: string, value: string) => {
    getStorageEngine().set(key, value);
  },
  delete: (key: string) => {
    getStorageEngine().delete(key);
  },
};

export const zustandStorage: StateStorage = {
  getItem: (name) => keyValueStorage.getString(name) ?? null,
  setItem: (name, value) => {
    keyValueStorage.setString(name, value);
  },
  removeItem: (name) => {
    keyValueStorage.delete(name);
  },
};
