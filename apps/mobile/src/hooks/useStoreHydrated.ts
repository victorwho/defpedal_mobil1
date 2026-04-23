import { useEffect, useState } from 'react';

import { useAppStore } from '../store/appStore';

/**
 * Returns `true` once the Zustand persist hydration has completed for the
 * global app store.
 *
 * Why this exists: any code that reads or writes persisted store fields during
 * initial mount is subject to a race. The store starts at its initial value,
 * then persist middleware asynchronously reads AsyncStorage and overwrites
 * state with whatever was stored. A write that happens *before* that overwrite
 * is silently lost — the next in-memory snapshot reflects the persisted value.
 *
 * The signup gate (`anonymousOpenCount` increment in `_layout.tsx`) hit this
 * exact race: every cold-start increment was clobbered by hydration, so the
 * count never escalated past the persisted baseline. Gate such writes on
 * `useStoreHydrated()` returning true.
 */
export const useStoreHydrated = (): boolean => {
  const [hydrated, setHydrated] = useState<boolean>(
    () => useAppStore.persist?.hasHydrated?.() ?? true,
  );

  useEffect(() => {
    if (hydrated) return;

    // Some Zustand persist versions surface hydration state that flipped
    // between our initial useState read and this effect running. Re-check.
    if (useAppStore.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }

    const unsubscribe = useAppStore.persist?.onFinishHydration?.(() =>
      setHydrated(true),
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [hydrated]);

  return hydrated;
};
