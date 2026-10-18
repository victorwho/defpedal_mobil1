import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }));

import { router } from 'expo-router';
import { finishPostSignupSteps } from './post-onboarding-nav';
import { useAppStore } from '../store/appStore';

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ onboardingLoop: null, routePreview: null, appState: 'IDLE' });
});

describe('finishPostSignupSteps — first-ride onboarding hand-off', () => {
  it('opens the loop ride screen when a loop was kept through signup', () => {
    useAppStore.setState({ onboardingLoop: { id: 'loop-1' } as never });
    finishPostSignupSteps();
    expect(router.replace).toHaveBeenCalledWith('/onboarding/ride-loop');
  });

  it('falls through to the planner with nothing kept (control)', () => {
    finishPostSignupSteps();
    expect(router.replace).toHaveBeenCalledWith('/route-planning');
  });
});
