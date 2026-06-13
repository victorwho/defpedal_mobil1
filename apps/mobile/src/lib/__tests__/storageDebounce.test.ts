import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

import { createDebouncedStorage } from '../storage';

const KEY = 'defensivepedal-store';

const makeInner = () => {
  const store = new Map<string, string>();
  const setItem = vi.fn(async (k: string, v: string) => {
    store.set(k, v);
  });
  const inner: StateStorage = {
    getItem: async (k) => store.get(k) ?? null,
    setItem,
    removeItem: async (k) => {
      store.delete(k);
    },
  };
  return { inner, setItem };
};

describe('createDebouncedStorage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('coalesces a rapid burst into a single trailing write with the latest value', async () => {
    const { inner, setItem } = makeInner();
    const storage = createDebouncedStorage(inner, { debounceMs: 3_000, maxWaitMs: 8_000 });

    for (let i = 0; i < 10; i += 1) {
      void storage.setItem(KEY, `v${i}`);
      vi.advanceTimersByTime(500); // ticks every 0.5s < 3s debounce
    }
    expect(setItem).not.toHaveBeenCalled(); // still inside the debounce window

    vi.advanceTimersByTime(3_000);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenLastCalledWith(KEY, 'v9');
  });

  it('forces a flush via the max-wait ceiling under continuous churn', () => {
    const { inner, setItem } = makeInner();
    const storage = createDebouncedStorage(inner, { debounceMs: 3_000, maxWaitMs: 8_000 });

    // Writes every 2s keep resetting the 3s debounce — only the 8s max-wait fires.
    for (let i = 0; i < 6; i += 1) {
      void storage.setItem(KEY, `c${i}`);
      vi.advanceTimersByTime(2_000);
    }
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('read-your-writes: getItem returns the pending (un-flushed) value', async () => {
    const { inner, setItem } = makeInner();
    const storage = createDebouncedStorage(inner, { debounceMs: 3_000, maxWaitMs: 8_000 });

    void storage.setItem(KEY, 'pending-value');
    await expect(storage.getItem(KEY)).resolves.toBe('pending-value');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('flush() writes immediately', () => {
    const { inner, setItem } = makeInner();
    const storage = createDebouncedStorage(inner, { debounceMs: 3_000, maxWaitMs: 8_000 });

    void storage.setItem(KEY, 'flush-me');
    storage.flush();
    expect(setItem).toHaveBeenCalledWith(KEY, 'flush-me');
  });

  it('removeItem cancels a pending write for the same key', () => {
    const { inner, setItem } = makeInner();
    const removeSpy = vi.spyOn(inner, 'removeItem');
    const storage = createDebouncedStorage(inner, { debounceMs: 3_000, maxWaitMs: 8_000 });

    void storage.setItem(KEY, 'will-be-cancelled');
    void storage.removeItem(KEY);
    vi.advanceTimersByTime(10_000);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(KEY);
  });
});
