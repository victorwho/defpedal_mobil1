import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  startBackgroundNavigationUpdates,
  stopBackgroundNavigationUpdates,
} from '../lib/backgroundNavigation';
import { mergeBackgroundBreadcrumbsIntoSession } from '../lib/mergeBackgroundBreadcrumbs';
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

  // Start/stop are SERIALIZED inside backgroundNavigation.ts, so this effect can
  // stay a plain fire-and-forget: a stop queued behind an in-flight start runs
  // after it and really does stop the task. Do NOT add a generation counter or a
  // "reverse it if the state changed" branch here — that compensates for a race
  // the queue already removes, and two mechanisms would double-act. Do not add a
  // cleanup that stops the task on unmount either: background recording is meant
  // to outlive this component. See `serializeTaskOperation` and triage P1-8.
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

  // When the app returns to the foreground during a ride, drain the
  // background-recorded samples (screen-off / locked stretch) into the trip
  // trail — otherwise that distance is silently lost (review 2026-06-12 P1).
  useEffect(() => {
    if (!isNavigating) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void mergeBackgroundBreadcrumbsIntoSession();
      }
    });
    return () => subscription.remove();
  }, [isNavigating]);

  return null;
};
