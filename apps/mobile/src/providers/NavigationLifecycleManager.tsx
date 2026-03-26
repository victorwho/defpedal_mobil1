import { useEffect, useRef } from 'react';

import {
  startBackgroundNavigationUpdates,
  stopBackgroundNavigationUpdates,
} from '../lib/backgroundNavigation';
import { useAppStore } from '../store/appStore';

/**
 * Detects if the app was killed during navigation and recovers by
 * queueing trip_end + trip_track mutations with end_reason 'app_killed'.
 */
const useAppKilledRecovery = () => {
  const recoveredRef = useRef(false);

  useEffect(() => {
    if (recoveredRef.current) return;

    const state = useAppStore.getState();
    const session = state.navigationSession;

    // If app opens with NAVIGATING state + breadcrumbs, the previous
    // session was interrupted (app killed / crash / force close)
    if (
      state.appState === 'NAVIGATING' &&
      session &&
      session.gpsBreadcrumbs.length > 0 &&
      state.activeTripClientId
    ) {
      recoveredRef.current = true;
      const endedAt = new Date().toISOString();

      // Queue trip end as stopped
      state.enqueueMutation('trip_end', {
        clientTripId: state.activeTripClientId,
        endedAt,
        reason: 'stopped',
      });

      // Queue trip track with app_killed reason
      state.enqueueMutation('trip_track', {
        clientTripId: state.activeTripClientId,
        routingMode: 'fast', // fallback — actual mode not available after rehydration
        gpsBreadcrumbs: session.gpsBreadcrumbs,
        endReason: 'app_killed',
        startedAt: session.startedAt,
        endedAt,
      });

      // Reset to idle
      state.resetFlow();
    }
  }, []);
};

export const NavigationLifecycleManager = () => {
  const isNavigating = useAppStore(
    (state) => state.appState === 'NAVIGATING' && Boolean(state.navigationSession),
  );

  useAppKilledRecovery();

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
