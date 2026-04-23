// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../store/appStore';
import { useStoreHydrated } from './useStoreHydrated';

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
};

const getPersistApi = (): PersistApi => {
  const api = (useAppStore as unknown as { persist?: PersistApi }).persist;
  if (!api) throw new Error('Zustand persist API not attached');
  return api;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStoreHydrated', () => {
  it('returns true immediately when the store is already hydrated', () => {
    const persist = getPersistApi();
    vi.spyOn(persist, 'hasHydrated').mockReturnValue(true);

    const { result } = renderHook(() => useStoreHydrated());

    expect(result.current).toBe(true);
  });

  it('returns false while hydration is pending, then true after onFinishHydration fires', () => {
    const persist = getPersistApi();
    vi.spyOn(persist, 'hasHydrated').mockReturnValue(false);

    // Capture the callback so we can fire hydration on demand.
    let hydrationCb: (() => void) | null = null;
    const onFinishSpy = vi
      .spyOn(persist, 'onFinishHydration')
      .mockImplementation((cb) => {
        hydrationCb = cb;
        return () => {};
      });

    const { result } = renderHook(() => useStoreHydrated());

    // Pre-hydration: false, callback subscribed.
    expect(result.current).toBe(false);
    expect(onFinishSpy).toHaveBeenCalledTimes(1);
    expect(hydrationCb).toBeTypeOf('function');

    // Simulate persist finishing hydration.
    act(() => {
      hydrationCb?.();
    });

    expect(result.current).toBe(true);
  });

  it('handles the race where hasHydrated flips between useState init and effect run', () => {
    const persist = getPersistApi();
    // First call (useState init) returns false; subsequent calls (effect
    // re-check) return true. This simulates hydration completing between
    // render and effect.
    const hasHydratedSpy = vi.spyOn(persist, 'hasHydrated');
    hasHydratedSpy.mockReturnValueOnce(false);
    hasHydratedSpy.mockReturnValue(true);
    const onFinishSpy = vi.spyOn(persist, 'onFinishHydration');

    const { result } = renderHook(() => useStoreHydrated());

    // Effect catches the flip and sets hydrated=true without waiting for
    // the onFinishHydration callback.
    expect(result.current).toBe(true);
    expect(onFinishSpy).not.toHaveBeenCalled();
  });

  it('unsubscribes from onFinishHydration on unmount', () => {
    const persist = getPersistApi();
    vi.spyOn(persist, 'hasHydrated').mockReturnValue(false);
    const unsub = vi.fn();
    vi.spyOn(persist, 'onFinishHydration').mockReturnValue(unsub);

    const { unmount } = renderHook(() => useStoreHydrated());

    expect(unsub).not.toHaveBeenCalled();
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
