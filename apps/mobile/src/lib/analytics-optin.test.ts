import { describe, expect, it } from 'vitest';

import {
  ANALYTICS_PROMPT_LIFETIME_CAP,
  ANALYTICS_PROMPT_MAX_DISMISSALS,
  DEFAULT_ANALYTICS_PROMPT_STATE,
  isImpactDashboardTriggered,
  isPostSecondRideTriggered,
  shouldShowAnalyticsPrompt,
  type AnalyticsPromptState,
} from './analytics-optin';
import {
  claimPromptSlot,
  isPromptSlotAvailable,
  resetPromptArbitrationForTest,
} from './prompt-arbitration';

const NOW = new Date('2026-07-17T12:00:00Z');
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

const state = (overrides?: Partial<AnalyticsPromptState>): AnalyticsPromptState => ({
  ...DEFAULT_ANALYTICS_PROMPT_STATE,
  ...overrides,
});

const gate = (s: AnalyticsPromptState, posthogEnabled = false, now = NOW) =>
  shouldShowAnalyticsPrompt('post_second_ride', { posthogEnabled, state: s, now });

describe('shouldShowAnalyticsPrompt — retirement', () => {
  it('shows for a fresh state', () => {
    expect(gate(state())).toBe(true);
  });

  it('retired permanently once PostHog is on (any source, incl. Settings)', () => {
    expect(gate(state(), true)).toBe(false);
  });

  it('retired once a conversion is recorded, even if the flag were later off', () => {
    expect(gate(state({ convertedBy: 'settings' }))).toBe(false);
    expect(gate(state({ convertedBy: 'impact_dashboard' }))).toBe(false);
  });
});

describe('shouldShowAnalyticsPrompt — dismissal cap', () => {
  it('still shows after one dismissal', () => {
    expect(gate(state({ dismissCount: 1 }))).toBe(true);
  });

  it(`all prompts off forever after ${ANALYTICS_PROMPT_MAX_DISMISSALS} dismissals anywhere`, () => {
    const s = state({ dismissCount: ANALYTICS_PROMPT_MAX_DISMISSALS });
    expect(shouldShowAnalyticsPrompt('post_second_ride', { posthogEnabled: false, state: s, now: NOW })).toBe(false);
    expect(shouldShowAnalyticsPrompt('post_first_hazard', { posthogEnabled: false, state: s, now: NOW })).toBe(false);
    expect(shouldShowAnalyticsPrompt('impact_dashboard', { posthogEnabled: false, state: s, now: NOW })).toBe(false);
  });
});

describe('shouldShowAnalyticsPrompt — once-per-prompt + lifetime cap', () => {
  it('a prompt already shown never shows again (dismissed or not)', () => {
    expect(gate(state({ asksShown: ['post_second_ride'] }))).toBe(false);
  });

  it('other prompts remain available after one showed (spacing permitting)', () => {
    const s = state({
      asksShown: ['post_second_ride'],
      lastAskAt: new Date(NOW.getTime() - DAYS(15)).toISOString(),
    });
    expect(
      shouldShowAnalyticsPrompt('impact_dashboard', { posthogEnabled: false, state: s, now: NOW }),
    ).toBe(true);
  });

  it(`hard lifetime cap of ${ANALYTICS_PROMPT_LIFETIME_CAP} asks total`, () => {
    const s = state({
      asksShown: ['post_second_ride', 'post_first_hazard', 'impact_dashboard'],
      lastAskAt: new Date(NOW.getTime() - DAYS(30)).toISOString(),
    });
    expect(
      shouldShowAnalyticsPrompt('impact_dashboard', { posthogEnabled: false, state: s, now: NOW }),
    ).toBe(false);
  });
});

describe('shouldShowAnalyticsPrompt — 14-day spacing', () => {
  it('blocks a second ask 13 days after the first', () => {
    const s = state({
      asksShown: ['post_first_hazard'],
      lastAskAt: new Date(NOW.getTime() - DAYS(13)).toISOString(),
    });
    expect(gate(s)).toBe(false);
  });

  it('allows a second ask 14+ days after the first', () => {
    const s = state({
      asksShown: ['post_first_hazard'],
      lastAskAt: new Date(NOW.getTime() - DAYS(14) - 1000).toISOString(),
    });
    expect(gate(s)).toBe(true);
  });

  it('fails closed on a malformed lastAskAt', () => {
    expect(gate(state({ lastAskAt: 'not-a-date' }))).toBe(false);
  });
});

describe('per-prompt trigger helpers', () => {
  it('post-second-ride fires ONLY on exactly ride 2', () => {
    expect(isPostSecondRideTriggered(1)).toBe(false);
    expect(isPostSecondRideTriggered(2)).toBe(true);
    expect(isPostSecondRideTriggered(3)).toBe(false);
  });

  it('impact-dashboard fires from the third visit on', () => {
    expect(isImpactDashboardTriggered(2)).toBe(false);
    expect(isImpactDashboardTriggered(3)).toBe(true);
    expect(isImpactDashboardTriggered(9)).toBe(true);
  });
});

describe('prompt arbitration — priority + same-session exclusion', () => {
  it('analytics is blocked after SaveRideCard claimed the session', () => {
    resetPromptArbitrationForTest();
    expect(claimPromptSlot('save_ride')).toBe(true);
    expect(isPromptSlotAvailable('analytics')).toBe(false);
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('analytics is blocked after ReviewPromptCard claimed the session', () => {
    resetPromptArbitrationForTest();
    expect(claimPromptSlot('review')).toBe(true);
    expect(claimPromptSlot('analytics')).toBe(false);
  });

  it('save-ride and review can coexist (existing behavior unchanged)', () => {
    resetPromptArbitrationForTest();
    expect(claimPromptSlot('save_ride')).toBe(true);
    expect(claimPromptSlot('review')).toBe(true);
  });

  it('exclusion is bidirectional: analytics first blocks save-ride/review for the session', () => {
    resetPromptArbitrationForTest();
    expect(claimPromptSlot('analytics')).toBe(true);
    expect(claimPromptSlot('save_ride')).toBe(false);
    expect(claimPromptSlot('review')).toBe(false);
  });

  it('analytics claims are idempotent within a session (still one card)', () => {
    resetPromptArbitrationForTest();
    expect(claimPromptSlot('analytics')).toBe(true);
    // A second analytics surface the same session is prevented by the
    // per-prompt asksShown + 14-day spacing gates; arbitration itself only
    // enforces the cross-surface rules.
    expect(isPromptSlotAvailable('analytics')).toBe(true);
  });
});
