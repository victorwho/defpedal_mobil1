import { describe, expect, it } from 'vitest';

import {
  cooldownDaysFor,
  daysBetween,
  DEFAULT_REVIEW_PROMPT_STATE,
  ensureInstalledAt,
  evaluateReviewEligibility,
  hoursBetween,
  recordError,
  recordPromptShown,
  recordRated,
  recordSentiment,
  recordSoftDismiss,
  REVIEW_COOLDOWN_DEFAULT_DAYS,
  REVIEW_COOLDOWN_LATER_DAYS,
  REVIEW_COOLDOWN_NEGATIVE_DAYS,
  REVIEW_COOLDOWN_RATED_DAYS,
  REVIEW_MAX_PROMPTS_LIFETIME,
  REVIEW_MIN_COMPLETED_RIDES,
  REVIEW_MIN_DAYS_SINCE_INSTALL,
  REVIEW_SOFT_DISMISS_LIMIT,
  REVIEW_SUPPRESS_AFTER_ERROR_HOURS,
  setOptedOut,
  type ReviewEvaluationContext,
  type ReviewPromptState,
} from './reviewEligibility';

const NOW = '2026-06-01T12:00:00.000Z';

const daysBefore = (iso: string, days: number): string =>
  new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString();

const hoursBefore = (iso: string, hours: number): string =>
  new Date(Date.parse(iso) - hours * 60 * 60 * 1000).toISOString();

/** Build an eligible state — installed long enough ago, no prior prompts. */
const eligibleState = (overrides: Partial<ReviewPromptState> = {}): ReviewPromptState => ({
  ...DEFAULT_REVIEW_PROMPT_STATE,
  installedAt: daysBefore(NOW, REVIEW_MIN_DAYS_SINCE_INSTALL + 5),
  ...overrides,
});

/** Build a clean evaluation context — no suppressors firing. */
const cleanCtx = (
  overrides: Partial<ReviewEvaluationContext> = {},
): ReviewEvaluationContext => ({
  nowIso: NOW,
  completedRideCount: REVIEW_MIN_COMPLETED_RIDES + 2,
  trigger: 'ride_completed_safely',
  suppress: {
    hasRecentError: false,
    isOffline: false,
    isNavigating: false,
    hadRerouteOnLastRide: false,
    lastRideDiscarded: false,
    lastFeedbackNegative: false,
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// daysBetween / hoursBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns Infinity when from is null', () => {
    expect(daysBetween(null, NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity when from is unparseable', () => {
    expect(daysBetween('not-a-date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('computes days correctly', () => {
    expect(daysBetween(daysBefore(NOW, 10), NOW)).toBeCloseTo(10, 5);
  });

  it('clamps to 0 when clock rewinds (now < from)', () => {
    const future = new Date(Date.parse(NOW) + 1000 * 60 * 60 * 24).toISOString();
    expect(daysBetween(future, NOW)).toBe(0);
  });
});

describe('hoursBetween', () => {
  it('returns Infinity when from is null', () => {
    expect(hoursBetween(null, NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('computes hours correctly', () => {
    expect(hoursBetween(hoursBefore(NOW, 6), NOW)).toBeCloseTo(6, 5);
  });

  it('clamps to 0 when clock rewinds', () => {
    const future = new Date(Date.parse(NOW) + 1000 * 60 * 60).toISOString();
    expect(hoursBetween(future, NOW)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cooldownDaysFor
// ---------------------------------------------------------------------------

describe('cooldownDaysFor', () => {
  it('returns rated cooldown when user has rated', () => {
    expect(cooldownDaysFor({ ...DEFAULT_REVIEW_PROMPT_STATE, rated: true })).toBe(
      REVIEW_COOLDOWN_RATED_DAYS,
    );
  });

  it('rated takes precedence over negative sentiment', () => {
    expect(
      cooldownDaysFor({
        ...DEFAULT_REVIEW_PROMPT_STATE,
        rated: true,
        lastSentiment: 'negative',
      }),
    ).toBe(REVIEW_COOLDOWN_RATED_DAYS);
  });

  it('returns negative cooldown for negative sentiment', () => {
    expect(
      cooldownDaysFor({ ...DEFAULT_REVIEW_PROMPT_STATE, lastSentiment: 'negative' }),
    ).toBe(REVIEW_COOLDOWN_NEGATIVE_DAYS);
  });

  it('returns later cooldown for "later" answer', () => {
    expect(
      cooldownDaysFor({ ...DEFAULT_REVIEW_PROMPT_STATE, lastSentiment: 'later' }),
    ).toBe(REVIEW_COOLDOWN_LATER_DAYS);
  });

  it('returns default cooldown when no sentiment recorded', () => {
    expect(cooldownDaysFor(DEFAULT_REVIEW_PROMPT_STATE)).toBe(
      REVIEW_COOLDOWN_DEFAULT_DAYS,
    );
  });
});

// ---------------------------------------------------------------------------
// evaluateReviewEligibility — happy path
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — happy path', () => {
  it('returns the trigger when all gates pass', () => {
    expect(evaluateReviewEligibility(eligibleState(), cleanCtx())).toEqual({
      trigger: 'ride_completed_safely',
    });
  });

  it('round-trips the trigger label from context', () => {
    expect(
      evaluateReviewEligibility(
        eligibleState(),
        cleanCtx({ trigger: 'tier_promotion' }),
      ),
    ).toEqual({ trigger: 'tier_promotion' });
  });
});

// ---------------------------------------------------------------------------
// Hard opt-outs / caps
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — hard opt-outs', () => {
  it('suppresses when optedOut is true', () => {
    expect(
      evaluateReviewEligibility(eligibleState({ optedOut: true }), cleanCtx()),
    ).toBeNull();
  });

  it('suppresses when user has already rated', () => {
    expect(
      evaluateReviewEligibility(eligibleState({ rated: true }), cleanCtx()),
    ).toBeNull();
  });

  it('suppresses when promptCount has hit the lifetime ceiling', () => {
    expect(
      evaluateReviewEligibility(
        eligibleState({
          promptCount: REVIEW_MAX_PROMPTS_LIFETIME,
          // Even with a long-ago lastShown, the cap wins.
          lastShownAt: daysBefore(NOW, 365 * 5),
        }),
        cleanCtx(),
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Live safety suppressors
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — live suppressors', () => {
  it.each([
    'hasRecentError',
    'isOffline',
    'isNavigating',
    'hadRerouteOnLastRide',
    'lastRideDiscarded',
    'lastFeedbackNegative',
  ] as const)('suppresses when %s is true', (key) => {
    const ctx = cleanCtx({ suppress: { ...cleanCtx().suppress, [key]: true } });
    expect(evaluateReviewEligibility(eligibleState(), ctx)).toBeNull();
  });

  it('suppresses when lastErrorAt is within the post-error window', () => {
    const state = eligibleState({
      lastErrorAt: hoursBefore(NOW, REVIEW_SUPPRESS_AFTER_ERROR_HOURS - 1),
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });

  it('allows when lastErrorAt is older than the post-error window', () => {
    const state = eligibleState({
      lastErrorAt: hoursBefore(NOW, REVIEW_SUPPRESS_AFTER_ERROR_HOURS + 1),
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Eligibility (install age, ride count)
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — eligibility gates', () => {
  it('suppresses when install is too recent', () => {
    const state: ReviewPromptState = {
      ...DEFAULT_REVIEW_PROMPT_STATE,
      installedAt: daysBefore(NOW, REVIEW_MIN_DAYS_SINCE_INSTALL - 1),
    };
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });

  it('suppresses when installedAt is null (never seeded)', () => {
    expect(
      evaluateReviewEligibility(
        DEFAULT_REVIEW_PROMPT_STATE,
        cleanCtx(),
      ),
    ).toBeNull();
  });

  it('suppresses when ride count is below threshold', () => {
    const ctx = cleanCtx({ completedRideCount: REVIEW_MIN_COMPLETED_RIDES - 1 });
    expect(evaluateReviewEligibility(eligibleState(), ctx)).toBeNull();
  });

  it('allows exactly at the ride-count threshold', () => {
    const ctx = cleanCtx({ completedRideCount: REVIEW_MIN_COMPLETED_RIDES });
    expect(evaluateReviewEligibility(eligibleState(), ctx)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — cooldown', () => {
  it('suppresses inside the default cooldown window', () => {
    const state = eligibleState({
      lastShownAt: daysBefore(NOW, REVIEW_COOLDOWN_DEFAULT_DAYS - 1),
      promptCount: 1,
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });

  it('allows once the default cooldown has elapsed', () => {
    const state = eligibleState({
      lastShownAt: daysBefore(NOW, REVIEW_COOLDOWN_DEFAULT_DAYS + 1),
      promptCount: 1,
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).not.toBeNull();
  });

  it('honours the longer negative-sentiment cooldown', () => {
    const state = eligibleState({
      lastShownAt: daysBefore(NOW, REVIEW_COOLDOWN_NEGATIVE_DAYS - 1),
      promptCount: 1,
      lastSentiment: 'negative',
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });

  it('honours the shorter "later" cooldown', () => {
    const state = eligibleState({
      lastShownAt: daysBefore(NOW, REVIEW_COOLDOWN_LATER_DAYS + 1),
      promptCount: 1,
      lastSentiment: 'later',
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe('recordPromptShown', () => {
  it('increments promptCount and stamps lastShownAt', () => {
    const next = recordPromptShown(DEFAULT_REVIEW_PROMPT_STATE, NOW);
    expect(next.promptCount).toBe(1);
    expect(next.lastShownAt).toBe(NOW);
  });

  it('does not mutate input', () => {
    const before = { ...DEFAULT_REVIEW_PROMPT_STATE };
    recordPromptShown(DEFAULT_REVIEW_PROMPT_STATE, NOW);
    expect(DEFAULT_REVIEW_PROMPT_STATE).toEqual(before);
  });
});

describe('recordSentiment', () => {
  it('writes the new sentiment', () => {
    expect(
      recordSentiment(DEFAULT_REVIEW_PROMPT_STATE, 'positive').lastSentiment,
    ).toBe('positive');
  });

  it('overwrites a prior sentiment', () => {
    const seeded = recordSentiment(DEFAULT_REVIEW_PROMPT_STATE, 'negative');
    expect(recordSentiment(seeded, 'positive').lastSentiment).toBe('positive');
  });
});

describe('recordSoftDismiss', () => {
  it('increments softDismissCount', () => {
    const a = recordSoftDismiss(DEFAULT_REVIEW_PROMPT_STATE);
    const b = recordSoftDismiss(a);
    expect(b.softDismissCount).toBe(2);
  });

  it('hitting the soft-dismiss limit does not on its own block (cooldown does the work)', () => {
    const state = eligibleState({
      softDismissCount: REVIEW_SOFT_DISMISS_LIMIT,
      lastShownAt: daysBefore(NOW, REVIEW_COOLDOWN_DEFAULT_DAYS + 1),
      promptCount: 1,
    });
    expect(evaluateReviewEligibility(state, cleanCtx())).not.toBeNull();
  });
});

describe('recordRated', () => {
  it('flips rated to true', () => {
    expect(recordRated(DEFAULT_REVIEW_PROMPT_STATE).rated).toBe(true);
  });

  it('a rated state is permanently suppressed', () => {
    const state = recordRated(eligibleState());
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });
});

describe('ensureInstalledAt', () => {
  it('seeds installedAt when missing', () => {
    expect(
      ensureInstalledAt(DEFAULT_REVIEW_PROMPT_STATE, NOW).installedAt,
    ).toBe(NOW);
  });

  it('leaves an existing installedAt untouched', () => {
    const earlier = daysBefore(NOW, 30);
    const state = { ...DEFAULT_REVIEW_PROMPT_STATE, installedAt: earlier };
    expect(ensureInstalledAt(state, NOW).installedAt).toBe(earlier);
  });
});

describe('recordError', () => {
  it('stamps lastErrorAt', () => {
    expect(recordError(DEFAULT_REVIEW_PROMPT_STATE, NOW).lastErrorAt).toBe(NOW);
  });

  it('suppresses for the configured window after stamping', () => {
    const state = recordError(eligibleState(), NOW);
    expect(evaluateReviewEligibility(state, cleanCtx())).toBeNull();
  });
});

describe('setOptedOut', () => {
  it('toggles opt-out', () => {
    expect(setOptedOut(DEFAULT_REVIEW_PROMPT_STATE, true).optedOut).toBe(true);
    expect(setOptedOut(setOptedOut(DEFAULT_REVIEW_PROMPT_STATE, true), false).optedOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: full happy + corrective sequence
// ---------------------------------------------------------------------------

describe('evaluateReviewEligibility — sequence', () => {
  it('user installs, completes 3 rides 8 days later, sees prompt, taps Later, suppressed for 30d', () => {
    const installed = ensureInstalledAt(DEFAULT_REVIEW_PROMPT_STATE, daysBefore(NOW, 8));

    const ctx = cleanCtx();
    const decision = evaluateReviewEligibility(installed, ctx);
    expect(decision).not.toBeNull();

    const shown = recordPromptShown(installed, NOW);
    const after = recordSentiment(shown, 'later');

    // 29 days later — still suppressed
    const dayLater = new Date(Date.parse(NOW) + 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      evaluateReviewEligibility(after, cleanCtx({ nowIso: dayLater })),
    ).toBeNull();

    // 31 days later — eligible again
    const monthPlus = new Date(Date.parse(NOW) + 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      evaluateReviewEligibility(after, cleanCtx({ nowIso: monthPlus })),
    ).not.toBeNull();
  });

  it('user rates → never asked again within the rated window', () => {
    const rated = recordRated(
      recordPromptShown(eligibleState(), NOW),
    );

    const fiveYears = new Date(
      Date.parse(NOW) + 5 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(evaluateReviewEligibility(rated, cleanCtx({ nowIso: fiveYears }))).toBeNull();
  });
});
