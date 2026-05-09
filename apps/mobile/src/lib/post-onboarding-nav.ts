import { router } from 'expo-router';

import { useAppStore } from '../store/appStore';

/**
 * Lands the user on the right screen after exiting the onboarding flow,
 * whether they signed up, hit "Maybe later", or used the Skip pill.
 *
 * If `/onboarding/first-route` populated `routePreview` and put the store
 * into ROUTE_PREVIEW this session, the freshly-generated demo route is
 * preserved and the user lands on `/route-preview` so the onboarding
 * investment turns into a concrete "look at this safe route" moment instead
 * of dropping them onto an empty planner.
 *
 * Otherwise the demo state is cleared and the user lands on `/route-planning`
 * the same way the original skip path did. For real-account users,
 * `app/index.tsx` clears any persisted ROUTE_PREVIEW on cold start so the
 * route doesn't stick around forever; anonymous users keep their planning
 * state across restarts (existing "resume where you were" behavior).
 */
export function navigateAfterOnboarding(): void {
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
