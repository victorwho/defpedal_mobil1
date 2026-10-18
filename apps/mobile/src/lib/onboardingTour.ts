/**
 * The onboarding route-reveal tour runs once per app session: a rider who taps
 * "Try another" and comes back has already seen it. In memory on purpose —
 * a fresh launch mid-onboarding may show it again, which is harmless.
 */
let shown = false;

export const hasShownOnboardingTour = (): boolean => shown;
export const markOnboardingTourShown = (): void => {
  shown = true;
};
export const resetOnboardingTourForTest = (): void => {
  shown = false;
};
