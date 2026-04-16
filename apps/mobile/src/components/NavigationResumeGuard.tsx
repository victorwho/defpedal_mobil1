/**
 * NavigationResumeGuard — app restart recovery for in-progress navigation.
 *
 * On mount, checks for a persisted navigation session (Zustand) AND a cached
 * route (OfflineRouteCache). Based on session age:
 *
 *   < 15 min  → auto-resume (navigate to /navigation silently)
 *   >= 15 min → show modal prompt "Resume or Discard?"
 *
 * If state is inconsistent (only one of session/cache exists), discards both.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { loadCachedRoute, clearCachedRoute } from '../lib/offlineRouteCache';
import { useAppStore } from '../store/appStore';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NavigationResumeGuard: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [destinationLabel, setDestinationLabel] = useState('');
  const hasCheckedRef = useRef(false);

  // Wait for auth to settle before checking — prevents race with OnboardingGuard
  const authCtx = useAuthSessionOptional();
  const isAuthLoading = authCtx?.isLoading ?? true;
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    // Defer until auth has resolved — OnboardingGuard needs to run first
    if (isAuthLoading) return;
    // Skip if onboarding isn't complete — let OnboardingGuard handle the flow
    if (!onboardingCompleted) return;
    hasCheckedRef.current = true;

    const check = async () => {
      const state = useAppStore.getState();
      const session = state.navigationSession;
      const cachedRoute = await loadCachedRoute();

      // Inconsistent state: only one exists — discard both
      if ((session != null) !== (cachedRoute != null)) {
        if (session != null) {
          state.finishNavigation();
        }
        await clearCachedRoute();
        return;
      }

      // Neither exists — nothing to resume
      if (session == null || cachedRoute == null) {
        return;
      }

      // Both exist — check if the app state is still NAVIGATING
      if (state.appState !== 'NAVIGATING') {
        // State machine moved past navigation — clean up stale cache
        await clearCachedRoute();
        return;
      }

      const ageMs = getSessionAgeMs(session);

      if (ageMs < AUTO_RESUME_THRESHOLD_MS) {
        // Fresh session — auto-resume
        router.replace('/navigation');
      } else {
        // Stale session — ask the user
        setDestinationLabel(cachedRoute.destinationLabel || 'your destination');
        setShowPrompt(true);
      }
    };

    void check();
  }, [isAuthLoading, onboardingCompleted]);

  const handleResume = useCallback(() => {
    setShowPrompt(false);
    router.replace('/navigation');
  }, []);

  const handleDiscard = useCallback(() => {
    setShowPrompt(false);
    const state = useAppStore.getState();
    state.finishNavigation();
    void clearCachedRoute();
  }, []);

  if (!showPrompt) return null;

  return (
    <Modal
      visible={showPrompt}
      title="Resume navigation?"
      description={`You were navigating to ${destinationLabel}. Would you like to pick up where you left off?`}
      variant="default"
      footer={
        <View style={styles.footer}>
          <Button variant="ghost" size="md" onPress={handleDiscard}>
            Discard
          </Button>
          <Button variant="primary" size="md" onPress={handleResume}>
            Resume
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space[3],
  },
});
