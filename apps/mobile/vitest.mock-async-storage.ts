/**
 * Vitest alias target for `@react-native-async-storage/async-storage`.
 *
 * The published package uses platform-extension (.native.js / .web.js)
 * resolution that Vite's Node resolver doesn't handle. Point directly at an
 * in-memory stand-in for tests so the rest of the suite can run.
 */

const storage = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => storage.get(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    storage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    storage.delete(key);
  },
  clear: async (): Promise<void> => {
    storage.clear();
  },
  getAllKeys: async (): Promise<string[]> => Array.from(storage.keys()),
  multiGet: async (keys: string[]): Promise<[string, string | null][]> =>
    keys.map((key) => [key, storage.get(key) ?? null]),
  multiSet: async (entries: [string, string][]): Promise<void> => {
    for (const [key, value] of entries) storage.set(key, value);
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    for (const key of keys) storage.delete(key);
  },
};

export default AsyncStorage;
