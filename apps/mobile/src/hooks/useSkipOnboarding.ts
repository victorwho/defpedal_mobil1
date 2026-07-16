import { useCallback } from 'react';

import { navigateAfterOnboarding } from '../lib/post-onboarding-nav';
import { useAppStore } from '../store/appStore';

/**
 * Returns a callback that exits the onboarding flow entirely.
 *
 * Mirrors `signup-prompt`'s `finishOnboarding` so the skip path stays
 * consistent with the "Maybe later" path: only resets the anonymous open
 * count on the initial onboarding completion (subsequent re-prompts must
 * not loop) and hands off navigation to `navigateAfterOnboarding`. If
 * `/onboarding/first-route` already populated a demo route, the user lands
 * on `/route-preview` so the work the app just did isn't thrown away;
 * otherwise the helper resets and goes to a clean `/route-planning`.
 *
 * 2026-07-16 (consent screen removed from onboarding): skip no longer
 * stamps `analyticsConsent.capturedAt`. Under the new semantics that
 * timestamp is evidence of a USER act in Settings — the telemetry defaults
 * (sentry ON via legitimate interest, posthog OFF awaiting opt-in) apply
 * from the store's initial state without any capture event, so faking one
 * here would corrupt the consent record.
 */
export function useSkipOnboarding(): () => void {
  return useCallback(() => {
    const state = useAppStore.getState();
    const wasInitialOnboarding = state.onboardingCompleted === false;

    state.setOnboardingCompleted(true);

    if (wasInitialOnboarding) {
      state.resetAnonymousOpenCount();
    }

    navigateAfterOnboarding();
  }, []);
}
