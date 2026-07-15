/**
 * NavigationResumeGuard — app restart recovery for in-progress navigation.
 *
 * SINGLE OWNER of restart-during-NAVIGATING recovery (review 2026-06-12,
 * P1 #3/#4): the old `useAppKilledRecovery` in NavigationLifecycleManager
 * force-ended every interrupted ride with no age threshold and raced both
 * AsyncStorage persist hydration and this guard — whether a killed ride was
 * silently ended or offered for resume was nondeterministic. That hook is
 * gone; this component now owns the whole decision, gated on store hydration.
 *
 * On mount (after hydration + auth + onboarding settle), checks for a
 * persisted navigation session (Zustand) AND a cached route
 * (OfflineRouteCache). Based on session age:
 *
 *   < 15 min  → auto-resume (navigate to /navigation silently)
 *   >= 15 min → show modal prompt "Resume / Save ride / Discard ride"
 *
 * The prompt is THREE-way (GPS audit 2026-07-15 P1-0): the two-button
 * "Resume or Discard?" version deleted the fully-recorded GPS trail of every
 * interrupted ride — a rider reopening the app hours after an interrupted
 * ride has no reason to "resume navigating" somewhere they already went, so
 * they tapped Discard and the ride vanished (zero `app_killed` recovery
 * tracks reached production in July 2026 vs 67 in May under the old
 * auto-save recovery; 127 trackless "zombie" trips in a month). "Save ride"
 * runs the same close-out as the automatic kill-recovery path, so the ride
 * lands in History with its trail.
 *
 * If state is inconsistent (NAVIGATING session without a resumable cached
 * route), the interrupted ride is closed out server-side (trip_end +
 * trip_track with end_reason 'app_killed' — the old kill-recovery behavior,
 * so the ride still lands in History) and the flow resets to IDLE.
 *
 * Discard semantics: an explicit user "Discard ride" queues trip_end only
 * (no trip_track — matching the in-ride End Ride → Discard path: no History
 * row, no impact/XP/badges) and resets to IDLE via resetFlow. It must NEVER
 * call finishNavigation(): that transitions to AWAITING_FEEDBACK (stranding
 * the app — route-preview's guard excludes that state) and increments
 * completedRideCount (review-prompt / MeetPedal gates) for a ride the user
 * just threw away (review 2026-06-12, P1 #5).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { loadCachedRoute, clearCachedRoute } from '../lib/offlineRouteCache';
import { mergeBackgroundBreadcrumbsIntoSession } from '../lib/mergeBackgroundBreadcrumbs';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';
import { useStoreHydrated } from '../hooks/useStoreHydrated';
import { useT } from '../hooks/useTranslation';
import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { Modal } from '../design-system/organisms/Modal';
import { Button } from '../design-system/atoms/Button';
import { space } from '../design-system/tokens/spacing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_RESUME_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the age of the navigation session in milliseconds.
 * Uses the last GPS breadcrumb timestamp if available, otherwise startedAt.
 */
const getSessionAgeMs = (session: {
  startedAt: string;
  gpsBreadcrumbs: readonly { ts: number }[];
}): number => {
  const lastBreadcrumb = session.gpsBreadcrumbs[session.gpsBreadcrumbs.length - 1];
  const referenceTime = lastBreadcrumb
    ? lastBreadcrumb.ts
    : new Date(session.startedAt).getTime();

  return Date.now() - referenceTime;
};

/**
 * Close out an interrupted/discarded ride: queue trip_end (and, when
 * `saveTrack` is set, the trip_track GPS trail with end_reason 'app_killed')
 * for the active trip, then reset the flow to IDLE and clear the route cache.
 *
 * `saveTrack: true`  — automatic cleanup paths (no user input): preserve the
 *                      old kill-recovery behavior so the interrupted ride
 *                      still shows up in History.
 * `saveTrack: false` — explicit user Discard: mirror the in-ride discard
 *                      semantics (trip closed server-side, nothing in
 *                      History, no impact/XP).
 *
 * A missing activeTripClientId (defensive — since the GPS-audit P0-1 fix
 * every ride enqueues trip_start and sets the id, session or not) means
 * there is no server trip to close; only the local reset runs.
 */
const closeInterruptedRide = async (saveTrack: boolean): Promise<void> => {
  // Drain any background-recorded samples (the screen-off / process-dead
  // stretch) into the trail BEFORE building the trip_track, so a kill-recovered
  // ride keeps the distance it covered while locked (review 2026-06-12 P1).
  if (saveTrack) {
    await mergeBackgroundBreadcrumbsIntoSession();
  }

  const state = useAppStore.getState();
  const session = state.navigationSession;
  const clientTripId = state.activeTripClientId;

  if (session && clientTripId) {
    // Dedup against an already-queued trip_end for this trip (same guard as
    // navigation.tsx queueTripEnd) so recovery after a kill that happened
    // mid-End-Ride doesn't double-close the trip.
    const alreadyQueuedTripEnd = state.queuedMutations.some(
      (mutation) =>
        mutation.type === 'trip_end' &&
        (mutation.payload as { clientTripId?: string }).clientTripId === clientTripId,
    );

    if (!alreadyQueuedTripEnd) {
      const endedAt = new Date().toISOString();

      state.enqueueMutation('trip_end', {
        clientTripId,
        endedAt,
        reason: 'stopped',
      });

      if (saveTrack && session.gpsBreadcrumbs.length > 0) {
        // routeRequest.mode is in the persist whitelist so the mode survives
        // the kill — read it from the rehydrated store rather than
        // defaulting to 'fast' (which mislabeled kill-recovered safe rides).
        state.enqueueMutation('trip_track', {
          clientTripId,
          routingMode: state.routeRequest?.mode ?? 'fast',
          gpsBreadcrumbs: session.gpsBreadcrumbs,
          endReason: 'app_killed',
          startedAt: session.startedAt,
          endedAt,
        });
      }
    }
  }

  state.resetFlow();
  void clearCachedRoute();
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NavigationResumeGuard: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [destinationLabel, setDestinationLabel] = useState('');
  const hasCheckedRef = useRef(false);

  // Wait for persist hydration — reading appState/navigationSession before
  // the AsyncStorage rehydrate lands would see the IDLE defaults and skip
  // recovery entirely (the race that made the old kill-recovery flaky).
  const hydrated = useStoreHydrated();
  // Wait for auth to settle before checking — prevents race with OnboardingGuard
  const authCtx = useAuthSessionOptional();
  const isAuthLoading = authCtx?.isLoading ?? true;
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    if (!hydrated) return;
    // Defer until auth has resolved — OnboardingGuard needs to run first
    if (isAuthLoading) return;
    // Skip if onboarding isn't complete — let OnboardingGuard handle the flow
    if (!onboardingCompleted) return;
    hasCheckedRef.current = true;

    const check = async () => {
      const state = useAppStore.getState();
      const session = state.navigationSession;
      const cachedRoute = await loadCachedRoute();

      // Not mid-ride: nothing to recover — just drop any stale cached route.
      if (state.appState !== 'NAVIGATING') {
        if (cachedRoute != null) {
          await clearCachedRoute();
        }
        return;
      }

      // NAVIGATING with no session — inconsistent; nothing recoverable.
      if (session == null) {
        state.resetFlow();
        await clearCachedRoute();
        return;
      }

      // NAVIGATING session but no cached route — can't rebuild the map/route
      // for a resume. Close the interrupted ride out (keeps the GPS trail so
      // the ride still lands in History, like the old kill recovery).
      if (cachedRoute == null) {
        telemetry.capture('resume_guard_outcome', { choice: 'auto_close_save' });
        await closeInterruptedRide(true);
        return;
      }

      const ageMs = getSessionAgeMs(session);

      if (ageMs < AUTO_RESUME_THRESHOLD_MS) {
        // Fresh session — auto-resume
        telemetry.capture('resume_guard_outcome', { choice: 'auto_resume' });
        router.replace('/navigation');
      } else {
        // Stale session — ask the user
        setDestinationLabel(cachedRoute.destinationLabel);
        setShowPrompt(true);
      }
    };

    void check();
  }, [hydrated, isAuthLoading, onboardingCompleted]);

  const handleResume = useCallback(() => {
    setShowPrompt(false);
    telemetry.capture('resume_guard_outcome', { choice: 'resume' });
    router.replace('/navigation');
  }, []);

  const handleSave = useCallback(() => {
    setShowPrompt(false);
    // Same close-out as the automatic kill-recovery path: trip_end +
    // trip_track ('app_killed') → the ride lands in History with its trail.
    telemetry.capture('resume_guard_outcome', { choice: 'save' });
    void closeInterruptedRide(true);
  }, []);

  const handleDiscard = useCallback(() => {
    setShowPrompt(false);
    // Explicit discard: close the server trip, skip the History trail.
    telemetry.capture('resume_guard_outcome', { choice: 'discard' });
    void closeInterruptedRide(false);
  }, []);

  const t = useT();

  if (!showPrompt) return null;

  return (
    <Modal
      visible={showPrompt}
      title={t('nav.resumeGuardTitle')}
      description={t('nav.resumeGuardMessage', {
        destination: destinationLabel || t('nav.resumeGuardDestinationFallback'),
      })}
      variant="default"
      footer={
        <View style={styles.footer}>
          <Button variant="primary" size="md" onPress={handleResume}>
            {t('nav.resumeGuardResume')}
          </Button>
          <Button variant="secondary" size="md" onPress={handleSave}>
            {t('nav.resumeGuardSave')}
          </Button>
          <Button variant="ghost" size="md" onPress={handleDiscard}>
            {t('nav.resumeGuardDiscard')}
          </Button>
        </View>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Column stack: three actions with localized labels (ro/es run long)
  // don't fit a row on narrow screens.
  footer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space[3],
  },
});
