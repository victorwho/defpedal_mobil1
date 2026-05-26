import { useCallback } from 'react';

import { navigateAfterOnboarding } from '../lib/post-onboarding-nav';
import { useAppStore } from '../store/appStore';

/**
 * Returns a callback that exits the onboarding flow entirely.
 *
 * Mirrors `signup-prompt`'s `finishOnboarding` so the skip path stays
 * consistent with the "Maybe later" path: only resets the anonymous open
 * count on the initial onboarding completion (subsequent re-prompts must
 * not loop), records the legal-basis-correct default for analytics if the
 * user never reached the consent step (post-P0.1 split, 2026-05-25:
 * sentry = ON under legitimate interest, posthog = OFF awaiting opt-in;
 * see docs/legal/consent-split-2026-05-25.md), and hands off navigation
 * to `navigateAfterOnboarding`. If `/onboarding/first-route` already
 * populated a demo route, the user lands on `/route-preview` so the work
 * the app just did isn't thrown away; otherwise the helper resets and
 * goes to a clean `/route-planning`.
 */
export function useSkipOnboarding(): () => void {
  return useCallback(() => {
    const state = useAppStore.getState();
    const wasInitialOnboarding = state.onboardingCompleted === false;

    if (state.analyticsConsent.capturedAt === null) {
      // P0.1 split (2026-05-25): default-ON crash reporting (legitimate
      // interest), default-OFF product analytics (opt-in). Skipping the
      // consent screen records these defaults explicitly so the same
      // values aren't shown to the user again.
      state.setAnalyticsConsent({ sentry: true, posthog: false });
    }

    state.setOnboardingCompleted(true);

    if (wasInitialOnboarding) {
      state.resetAnonymousOpenCount();
    }

    navigateAfterOnboarding();
  }, []);
}
