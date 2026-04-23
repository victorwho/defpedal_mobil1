/**
 * Signup-gate state snapshot consumed by `computeOnboardingGateTarget`.
 *
 * Kept as a plain shape (not tied to React) so the decision function can be
 * unit-tested exhaustively without mounting the hook tree.
 */
export interface OnboardingGateState {
  pathname: string;
  onboardingCompleted: boolean;
  anonymousOpenCount: number;
  storeHydrated: boolean;
  isLoading: boolean;
  hasRealAccount: boolean;
}

/**
 * Paths that are always allowed to render (never redirect away from them).
 *
 * - `/onboarding/*` — the gate targets live here.
 * - `/feedback` — post-ride summary. Users land here from navigation via the
 *   state machine, NOT from signup. Redirecting away would drop their feedback.
 * - `/navigation` — active navigation. Redirecting away would kill the ride.
 */
const isExemptPath = (pathname: string): boolean =>
  pathname.startsWith('/onboarding') ||
  pathname === '/feedback' ||
  pathname === '/navigation';

/**
 * Pure decision function for the signup gate.
 *
 * Returns the route to redirect the user to, or `null` if the user should be
 * allowed through. The rules encoded here:
 *
 * 1. Wait for hydration + auth load before making any decision (returning
 *    null allows the current screen to stay mounted — the gate re-evaluates
 *    when hydration finishes).
 * 2. Users with a real (non-anonymous) account always pass through.
 * 3. Pages the user reached for a legit reason (onboarding itself, active
 *    navigation, post-ride feedback) are never redirected.
 * 4. **Mandatory gate** (`count >= 3`, onboarding already done) fires on every
 *    render so hardware back / nav-away can't escape it.
 * 5. **One-shot branches** (initial onboarding, `count == 2` dismissible
 *    prompt) fire once per session. `hasRedirected` turns them off once the
 *    caller records that the redirect has fired — otherwise dismissing would
 *    immediately re-redirect.
 */
export const computeOnboardingGateTarget = (
  state: OnboardingGateState,
  hasRedirected: boolean,
): string | null => {
  if (!state.storeHydrated) return null;
  if (state.isLoading || state.hasRealAccount) return null;
  if (isExemptPath(state.pathname)) return null;

  if (state.onboardingCompleted !== false && state.anonymousOpenCount >= 3) {
    return '/onboarding/signup-prompt?mandatory=true';
  }

  if (hasRedirected) return null;

  // `/onboarding` resolves to `app/onboarding/index.tsx`. Matching the path
  // Expo Router's file-router actually exposes (profile sign-out uses the
  // same href). An earlier version of this code used `/onboarding/index`
  // which the router did not normalize reliably under bridgeless — the
  // resulting silent-nav caused an infinite effect loop.
  if (state.onboardingCompleted === false) return '/onboarding';
  if (state.anonymousOpenCount >= 2) return '/onboarding/signup-prompt';
  return null;
};
