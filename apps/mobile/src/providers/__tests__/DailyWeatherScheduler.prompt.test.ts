import { beforeEach, describe, expect, it } from 'vitest';

import { __weatherPromptForTest } from '../DailyWeatherScheduler';
import { useAppStore } from '../../store/appStore';

beforeEach(() => {
  __weatherPromptForTest.reset();
});

describe('weather permission prompt decision (audit 2026-10-18 #1)', () => {
  it('leaves installs on the old onboarding exactly as they were — every prompting pass may ask', () => {
    useAppStore.setState({ onboardingFlow: 'legacy', completedRideCount: 0, appState: 'IDLE' });
    expect(__weatherPromptForTest.decide()).toBe(true);
    expect(__weatherPromptForTest.decide()).toBe(true);
  });

  it('never asks a first-ride rider before their first ride', () => {
    useAppStore.setState({ onboardingFlow: 'first_ride', completedRideCount: 0, appState: 'ROUTE_PREVIEW' });
    expect(__weatherPromptForTest.decide()).toBe(false);
  });

  it('asks once after the first ride, and not again that session', () => {
    useAppStore.setState({ onboardingFlow: 'first_ride', completedRideCount: 1, appState: 'IDLE' });
    expect(__weatherPromptForTest.decide()).toBe(true);
    expect(__weatherPromptForTest.decide()).toBe(false);
  });
});
