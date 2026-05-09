import { router } from 'expo-router';

import { useAppStore } from '../store/appStore';

/**
 * Lands the user on the right screen after signing up during the onboarding flow.
 *
 * If `/onboarding/first-route` populated `routePreview` and put the store into
 * ROUTE_PREVIEW this session, the freshly-generated demo route is preserved
 * and the user lands on `/route-preview` so the onboarding investment turns
 * into a concrete "look at this safe route" moment instead of dropping them
 * onto an empty planner.
 *
 * Otherwise the demo state is cleared and the user lands on `/route-planning`
 * the same way `useSkipOnboarding` does. Session-only is enforced by
 * `app/index.tsx`, which clears any persisted ROUTE_PREVIEW for real-account
 * users on cold start.
 */
export function navigateAfterOnboardingSignup(): void {
  const state = useAppStore.getState();
  const hasFreshPreview =
    state.appState === 'ROUTE_PREVIEW' && (state.routePreview?.routes.length ?? 0) > 0;

  if (hasFreshPreview) {
    router.replace('/route-preview');
    return;
  }

  state.resetFlow();
  router.replace('/route-planning');
}
