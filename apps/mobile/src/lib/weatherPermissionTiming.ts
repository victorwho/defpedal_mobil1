import type { AppState } from '@defensivepedal/core';

import type { OnboardingFlow } from '../store/appStore';

/**
 * May the cycling-weather scheduler show the OS notification dialog now?
 *
 * First-ride onboarding installs wait until the rider has finished a ride and
 * is back on an idle screen (audit 2026-10-18 #1). Before that the only ask is
 * the explained one inside "Ride it later" — an unexplained dialog at signup
 * pre-empted it, and a refusal there means no reminder at all. Every other
 * install keeps the existing post-onboarding prompt.
 */
export const mayPromptForWeatherPermission = (state: {
  readonly onboardingFlow: OnboardingFlow | null;
  readonly completedRideCount: number;
  readonly appState: AppState;
}): boolean =>
  state.onboardingFlow !== 'first_ride' || (state.completedRideCount > 0 && state.appState === 'IDLE');
