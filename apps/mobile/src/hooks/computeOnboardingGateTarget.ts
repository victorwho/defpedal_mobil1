/**
 * Signup-gate state snapshot consumed by `computeOnboardingGateTarget`.
 *
 * Kept as a plain shape (not tied to React) so the decision function can be
 * unit-tested exhaustively without mounting the hook tree.
 */
export interface OnboardingGateState {
  pathname: string;
  onboardingCompleted: boolean;
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
 *   (Anonymous users can no longer start rides, but a pre-mandatory-signup
 *   install can update mid-persisted-ride — never yank them out of it.)
 * - `/auth` — the email signup/signin surface. Users routed here by the
 *   mandatory prompt's "Use email instead" link are actively complying
 *   with the gate; bouncing them back would silently strand them on the
 *   prompt with no apparent reaction (the bug this exemption fixes).
 */
const isExemptPath = (pathname: string): boolean =>
  pathname.startsWith('/onboarding') ||
  pathname === '/feedback' ||
  pathname === '/navigation' ||
  pathname === '/auth';

/**
 * Pure decision function for the signup gate.
 *
 * Registration is MANDATORY from first open (2026-07-24). The old
 * count-based escalation (silent → dismissible prompt on 2nd open →
 * mandatory on 3rd) is gone: an anonymous session is never allowed into the
 * main app.
 *
 * Returns the route to redirect the user to, or `null` if the user should be
 * allowed through. The rules encoded here:
 *
 * 1. Wait for hydration + auth load before making any decision (returning
 *    null allows the current screen to stay mounted — the gate re-evaluates
 *    when hydration finishes).
 * 2. Users with a real (non-anonymous) account always pass through.
 * 3. Pages the user reached for a legit reason (onboarding itself, active
 *    navigation, post-ride feedback, the /auth email form) are never
 *    redirected.
 * 4. Everyone else is walled on EVERY render — hardware back / nav-away
 *    can't escape it. Fresh installs re-enter the intro flow; users who
 *    finished the intro (including pre-update anonymous accounts) land on
 *    the signup prompt. Both targets terminate: once there, the path is
 *    exempt and the gate goes silent.
 */
export const computeOnboardingGateTarget = (
  state: OnboardingGateState,
): string | null => {
  if (!state.storeHydrated) return null;
  if (state.isLoading || state.hasRealAccount) return null;
  if (isExemptPath(state.pathname)) return null;

  // `/onboarding` resolves to `app/onboarding/index.tsx`. Matching the path
  // Expo Router's file-router actually exposes (profile sign-out uses the
  // same href). An earlier version of this code used `/onboarding/index`
  // which the router did not normalize reliably under bridgeless — the
  // resulting silent-nav caused an infinite effect loop.
  if (state.onboardingCompleted === false) return '/onboarding';
  return '/onboarding/signup-prompt';
};
