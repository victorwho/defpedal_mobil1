import { describe, expect, it } from 'vitest';

import {
  EMPTY_LOOP_INTRO_STATE,
  LOOP_INTRO_MAX_CLOSES,
  LOOP_INTRO_SPACING_DAYS,
  hasUsedLoops,
  shouldShowLoopIntro,
  withLoopIntroClosed,
  withLoopIntroShown,
  withLoopIntroTried,
  type LoopIntroContext,
} from './loop-intro';

const NOW = new Date('2026-10-10T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const ctx = (overrides: Partial<LoopIntroContext> = {}): LoopIntroContext => ({
  state: EMPTY_LOOP_INTRO_STATE,
  hasUsedLoops: false,
  countryCode: 'RO',
  onboardingCompleted: true,
  appState: 'IDLE',
  now: NOW,
  ...overrides,
});

describe('shouldShowLoopIntro', () => {
  it('shows to a rider who never used loops, where loops work', () => {
    expect(shouldShowLoopIntro(ctx())).toBe(true);
  });

  it('never shows to someone who has already used loops', () => {
    expect(shouldShowLoopIntro(ctx({ hasUsedLoops: true }))).toBe(false);
  });

  it('only shows where loops can run', () => {
    // Loops need our router; elsewhere "Try it" would land on a planner that
    // can only explain why it cannot search.
    expect(shouldShowLoopIntro(ctx({ countryCode: 'US' }))).toBe(false);
    expect(shouldShowLoopIntro(ctx({ countryCode: null }))).toBe(false);
    expect(shouldShowLoopIntro(ctx({ countryCode: 'GB' }))).toBe(true);
  });

  it('never interrupts onboarding or a ride', () => {
    expect(shouldShowLoopIntro(ctx({ onboardingCompleted: false }))).toBe(false);
    expect(shouldShowLoopIntro(ctx({ appState: 'NAVIGATING' }))).toBe(false);
  });

  it('never covers a route being previewed or a ride being saved', () => {
    // Reopening the app right after a ride lands on the feedback screen,
    // where the rider is saving it. That is no moment for a feature tour.
    expect(shouldShowLoopIntro(ctx({ appState: 'ROUTE_PREVIEW' }))).toBe(false);
    expect(shouldShowLoopIntro(ctx({ appState: 'AWAITING_FEEDBACK' }))).toBe(false);
  });

  it('waits a week between showings', () => {
    const shown = withLoopIntroShown(EMPTY_LOOP_INTRO_STATE, daysAgo(LOOP_INTRO_SPACING_DAYS - 1));
    expect(shouldShowLoopIntro(ctx({ state: shown }))).toBe(false);

    const weekOld = withLoopIntroShown(EMPTY_LOOP_INTRO_STATE, daysAgo(LOOP_INTRO_SPACING_DAYS));
    expect(shouldShowLoopIntro(ctx({ state: weekOld }))).toBe(true);
  });

  it('stops after the rider closes it three times', () => {
    let state = EMPTY_LOOP_INTRO_STATE;
    for (let i = 0; i < LOOP_INTRO_MAX_CLOSES - 1; i += 1) state = withLoopIntroClosed(state);
    expect(shouldShowLoopIntro(ctx({ state }))).toBe(true);

    state = withLoopIntroClosed(state);
    expect(shouldShowLoopIntro(ctx({ state }))).toBe(false);
  });

  it('stops for good once the rider taps Try it', () => {
    expect(shouldShowLoopIntro(ctx({ state: withLoopIntroTried(EMPTY_LOOP_INTRO_STATE) }))).toBe(false);
  });
});

describe('hasUsedLoops', () => {
  it('counts a rider who opened the planner', () => {
    expect(hasUsedLoops({ hasOpenedLoopPlanner: true, savedLoopCount: 0 })).toBe(true);
  });

  it('counts a rider with a saved loop from a build older than the planner stamp', () => {
    expect(hasUsedLoops({ hasOpenedLoopPlanner: false, savedLoopCount: 2 })).toBe(true);
  });

  it('does not count a rider with neither', () => {
    expect(hasUsedLoops({ hasOpenedLoopPlanner: false, savedLoopCount: 0 })).toBe(false);
  });
});
