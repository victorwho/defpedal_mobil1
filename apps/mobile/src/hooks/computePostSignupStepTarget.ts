/**
 * Post-signup onboarding steps — the ones that need a real account but are
 * NOT part of the mandatory registration wall.
 *
 * Why this is a separate decision from `computeOnboardingGateTarget`: the two
 * signup providers converge in different places.
 *
 *   Google / Apple → signup-prompt `completeSignup()` → `/onboarding/choose-username`
 *                    → `navigateAfterOnboarding()`
 *   Email          → `/auth?email=1` → **no post-success navigation at all**.
 *                    `auth.tsx` relies on the signup gate going quiet once
 *                    `hasRealAccount` flips, so the rider lands on `/` and is
 *                    routed straight into the app.
 *
 * Anchoring a step to `navigateAfterOnboarding()` alone would therefore skip
 * every email signup silently. Keying off STATE rather than a nav path is what
 * makes both providers reach the step.
 */
import type { AppState, BikeTypeId } from '@defensivepedal/core';

export interface PostSignupStepState {
  pathname: string;
  /**
   * Checked alongside `pathname` because the two callers know different
   * things: `app/index.tsx` always evaluates at '/', so the path alone
   * cannot tell us the rider is mid-ride. Keeping BOTH guards inside this
   * function means the rule lives in one place instead of being split
   * between here and the order of redirects in index.tsx.
   */
  appState: AppState;
  storeHydrated: boolean;
  isLoading: boolean;
  hasRealAccount: boolean;
  bikeTypeId: BikeTypeId | null;
  bikeTypePromptSeen: boolean;
}

/**
 * Paths that must never be interrupted by a preference step.
 *
 * `/onboarding/*` covers the step's own screen (so it terminates) plus the
 * registration wall, which owns the user until an account exists.
 * `/navigation` and `/feedback` mirror the signup gate: yanking a rider out
 * of an active ride or a post-ride summary to ask about their bike would
 * lose real data.
 */
const isProtectedPath = (pathname: string): boolean =>
  pathname.startsWith('/onboarding') ||
  pathname === '/navigation' ||
  pathname === '/feedback' ||
  pathname === '/auth';

/**
 * Returns the route to send the user to, or `null` to let them through.
 *
 * Terminates by construction: the only target lives under `/onboarding`,
 * which is a protected path, so once the rider is on it this returns null.
 */
export const computePostSignupStepTarget = (
  state: PostSignupStepState,
): string | null => {
  if (!state.storeHydrated || state.isLoading) return null;
  // No account yet — the registration wall owns this rider entirely.
  if (!state.hasRealAccount) return null;
  if (isProtectedPath(state.pathname)) return null;
  // An active ride or an unsubmitted post-ride summary holds data a redirect
  // would destroy. Never trade a recorded ride for a preference question.
  if (state.appState === 'NAVIGATING' || state.appState === 'AWAITING_FEEDBACK') return null;
  // Answered or skipped already. `bikeTypeId` is checked too so a rider who
  // set their bike in Profile is never asked.
  if (state.bikeTypeId !== null || state.bikeTypePromptSeen) return null;
  return '/onboarding/bike-type';
};
