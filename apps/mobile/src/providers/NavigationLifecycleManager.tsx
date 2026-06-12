import { useEffect } from 'react';

import {
  startBackgroundNavigationUpdates,
  stopBackgroundNavigationUpdates,
} from '../lib/backgroundNavigation';
import { useAppStore } from '../store/appStore';

/**
 * App-killed-during-navigation recovery used to live here as
 * `useAppKilledRecovery`, force-ending any interrupted ride on cold start
 * with no age threshold. It raced AsyncStorage persist hydration AND
 * NavigationResumeGuard's documented <15-min auto-resume — whichever ran
 * first won, nondeterministically (review 2026-06-12, P1 #3/#4).
 * NavigationResumeGuard is now the single owner of restart recovery: it
 * waits for hydration, auto-resumes fresh sessions, prompts for stale ones,
 * and closes out unresumable rides (trip_end + trip_track 'app_killed').
 */
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
