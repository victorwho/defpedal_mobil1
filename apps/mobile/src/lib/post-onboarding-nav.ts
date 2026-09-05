import { router } from 'expo-router';

import { useAppStore } from '../store/appStore';
import { computePostSignupStepTarget } from '../hooks/computePostSignupStepTarget';

/**
 * Terminal landing once onboarding — including every post-signup step — is
 * finished.
 *
 * If something earlier in the flow populated `routePreview` and put the store
 * into ROUTE_PREVIEW this session, that route is preserved and the user lands
 * on `/route-preview` so the onboarding investment turns into a concrete
 * "look at this safe route" moment instead of an empty planner.
 *
 * Otherwise the demo state is cleared and the user lands on `/route-planning`
 * the same way the original skip path did. For real-account users,
 * `app/index.tsx` clears any persisted ROUTE_PREVIEW on cold start so the
 * route doesn't stick around forever; anonymous users keep their planning
 * state across restarts (existing "resume where you were" behavior).
 *
 * Post-signup step screens must call THIS, not `navigateAfterOnboarding` —
 * the latter would bounce them straight back to the step they just answered.
 */
export function finishPostSignupSteps(): void {
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

/**
 * Lands the user on the right screen after exiting the onboarding flow,
 * whether they signed up, hit "Maybe later", or used the Skip pill.
 *
 * Any post-signup step still owing an answer takes priority over landing the
 * rider in the app. Only the Google/Apple path reaches this function — email
 * signups never navigate on success, so `app/index.tsx` runs the same check
 * for them (see `computePostSignupStepTarget`).
 */
export function navigateAfterOnboarding(): void {
  const { appState, bikeTypeId, bikeTypePromptSeen } = useAppStore.getState();
  const pending = computePostSignupStepTarget({
    // This function is only ever called with a real account in hand, at the
    // moment the rider leaves the signup flow.
    pathname: '/',
    appState,
    storeHydrated: true,
    isLoading: false,
    hasRealAccount: true,
    bikeTypeId,
    bikeTypePromptSeen,
  });

  if (pending) {
    router.replace(pending as never);
    return;
  }

  finishPostSignupSteps();
}
