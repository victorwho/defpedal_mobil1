import { useEffect } from 'react';

import {
  startBackgroundNavigationUpdates,
  stopBackgroundNavigationUpdates,
} from '../lib/backgroundNavigation';
import { useAppStore } from '../store/appStore';

export const NavigationLifecycleManager = () => {
  const isNavigating = useAppStore(
    (state) => state.appState === 'NAVIGATING' && Boolean(state.navigationSession),
  );

  useEffect(() => {
    const syncLifecycle = async () => {
      try {
        if (isNavigating) {
          await startBackgroundNavigationUpdates();
          return;
        }

        await stopBackgroundNavigationUpdates();
      } catch {
        // Background permission issues are surfaced through the persisted background status.
      }
    };

    void syncLifecycle();
  }, [isNavigating]);

  return null;
};
