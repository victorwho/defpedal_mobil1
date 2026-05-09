import { useCallback } from 'react';

import { navigateAfterOnboarding } from '../lib/post-onboarding-nav';
import { useAppStore } from '../store/appStore';

/**
 * Returns a callback that exits the onboarding flow entirely.
 *
 * Mirrors `signup-prompt`'s `finishOnboarding` so the skip path stays
 * consistent with the "Maybe later" path: only resets the anonymous open
 * count on the initial onboarding completion (subsequent re-prompts must
 * not loop), records an opt-out default for analytics if the user never
 * reached the consent step (legal-basis: ANSPDCP/Law 506/2004 — both
 * sub-processors require informed opt-in, so default OFF is the safe
 * posture), and hands off navigation to `navigateAfterOnboarding`. If
 * `/onboarding/first-route` already populated a demo route, the user lands
 * on `/route-preview` so the work the app just did isn't thrown away;
 * otherwise the helper resets and goes to a clean `/route-planning`.
 */
export function useSkipOnboarding(): () => void {
  return useCallback(() => {
    const state = useAppStore.getState();
    const wasInitialOnboarding = state.onboardingCompleted === false;

    if (state.analyticsConsent.capturedAt === null) {
      state.setAnalyticsConsent({ sentry: false, posthog: false });
    }

    state.setOnboardingCompleted(true);

    if (wasInitialOnboarding) {
      state.resetAnonymousOpenCount();
    }

    navigateAfterOnboarding();
  }, []);
}
