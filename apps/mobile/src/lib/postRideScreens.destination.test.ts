import { describe, expect, it } from 'vitest';

import { quietRideDestination } from './postRideScreens';

describe('quietRideDestination', () => {
  it('sends an anonymous first-ride rider straight to keep the ride', () => {
    expect(
      quietRideDestination({ isAnonymous: true, onboardingFlow: 'first_ride', onboardingCompleted: false }),
    ).toBe('/onboarding/signup-prompt');
  });

  it('returns everyone else to the map', () => {
    expect(quietRideDestination({ isAnonymous: false, onboardingFlow: 'first_ride', onboardingCompleted: true })).toBe('/route-planning');
    expect(quietRideDestination({ isAnonymous: true, onboardingFlow: 'legacy', onboardingCompleted: true })).toBe('/route-planning');
    expect(quietRideDestination({ isAnonymous: true, onboardingFlow: null, onboardingCompleted: false })).toBe('/route-planning');
  });
});
