import { describe, expect, it } from 'vitest';

import { mayPromptForWeatherPermission } from './weatherPermissionTiming';

describe('mayPromptForWeatherPermission', () => {
  it('keeps the existing prompt for installs on the old onboarding', () => {
    expect(mayPromptForWeatherPermission({ onboardingFlow: 'legacy', completedRideCount: 0, appState: 'IDLE' })).toBe(true);
    expect(mayPromptForWeatherPermission({ onboardingFlow: null, completedRideCount: 0, appState: 'IDLE' })).toBe(true);
  });

  it('never prompts at signup on the first-ride onboarding', () => {
    expect(mayPromptForWeatherPermission({ onboardingFlow: 'first_ride', completedRideCount: 0, appState: 'ROUTE_PREVIEW' })).toBe(false);
    expect(mayPromptForWeatherPermission({ onboardingFlow: 'first_ride', completedRideCount: 0, appState: 'IDLE' })).toBe(false);
  });

  it('prompts after the first ride, once the rider is back on an idle screen', () => {
    expect(mayPromptForWeatherPermission({ onboardingFlow: 'first_ride', completedRideCount: 1, appState: 'AWAITING_FEEDBACK' })).toBe(false);
    expect(mayPromptForWeatherPermission({ onboardingFlow: 'first_ride', completedRideCount: 1, appState: 'IDLE' })).toBe(true);
  });
});
