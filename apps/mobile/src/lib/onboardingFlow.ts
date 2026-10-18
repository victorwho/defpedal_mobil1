import type { OnboardingFlow } from '../store/appStore';

/** How long region-check waits for the profile read before giving up. */
export const ONBOARDING_FLOW_DECISION_TIMEOUT_MS = 2500;

export interface OnboardingFlowDecision {
  flow: OnboardingFlow;
  /**
   * True when the server actually answered. Only a definitive answer is
   * persisted: a slow first launch (anonymous sign-in still in flight) must
   * not lock the install out of the new flow for good. A timeout or error
   * runs today's flow for this pass and leaves the question open.
   */
  definitive: boolean;
  /**
   * May the rider take their first ride before signing up (audit 2026-10-18
   * #2)? Only ever true together with the new flow, and fails closed.
   */
  anonymousRide: boolean;
}

/**
 * Decide which onboarding this install runs
 * (docs/plans/onboarding-first-ride.md [D12]).
 *
 * FAILS CLOSED: only an explicit `onboardingFirstRideEnabled: true` from the
 * server selects the new flow. A missing field (older server), a failed or
 * slow read, or any other value keeps today's flow.
 */
export const decideOnboardingFlow = async (
  readProfile: () => Promise<{
    onboardingFirstRideEnabled?: boolean;
    onboardingAnonymousRideEnabled?: boolean;
  }>,
  timeoutMs: number = ONBOARDING_FLOW_DECISION_TIMEOUT_MS,
): Promise<OnboardingFlowDecision> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    // `.then(readProfile)` so a SYNCHRONOUS throw also lands in the catch —
    // an onboarding that hangs here would be worse than either flow.
    const read = Promise.resolve()
      .then(readProfile)
      .catch(() => null);
    const profile = await Promise.race([read, timeout]);
    if (!profile) return { flow: 'legacy', definitive: false, anonymousRide: false };
    const firstRide = profile.onboardingFirstRideEnabled === true;
    return {
      flow: firstRide ? 'first_ride' : 'legacy',
      definitive: true,
      anonymousRide: firstRide && profile.onboardingAnonymousRideEnabled === true,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
