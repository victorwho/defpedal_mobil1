/**
 * When to show the Loop feature intro — pure decisions, no React.
 *
 * The intro explains recreational loops to riders who have never used them,
 * on app open, with a close X and a "Try it" that opens `/loop-planner`.
 *
 * Cadence (product decision 2026-10-01): up to three showings, a week apart.
 *  - "Try it" retires it for good — the rider has now found the feature.
 *  - Each close counts; the third retires it. Declining three times is an
 *    answer, and a fourth ask would be nagging.
 *  - Ever opening the planner, by any path, retires it too (`hasUsedLoops`).
 *
 * Audience: only riders whose region-gate country the routing graph covers.
 * Loops are generated on our OSRM graph with no degraded mode, so elsewhere
 * "Try it" would land on a planner that can only explain why it cannot run.
 *
 * Only when the app is IDLE: never during onboarding (a fresh install has a
 * mandatory signup wall to get through first), mid-ride, over a route preview,
 * or over the post-ride feedback screen.
 */
import { isRoutingCountry, type AppState } from '@defensivepedal/core';

export interface LoopIntroState {
  readonly lastShownAt: string | null;
  readonly closes: number;
  readonly retired: boolean;
}

export const EMPTY_LOOP_INTRO_STATE: LoopIntroState = {
  lastShownAt: null,
  closes: 0,
  retired: false,
};

export const LOOP_INTRO_SPACING_DAYS = 7;
export const LOOP_INTRO_MAX_CLOSES = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LoopIntroContext {
  readonly state: LoopIntroState;
  readonly hasUsedLoops: boolean;
  /** The region gate's country (ISO alpha-2), or null when unknown. */
  readonly countryCode: string | null;
  readonly onboardingCompleted: boolean;
  readonly appState: AppState;
  readonly now: Date;
}

const spacingElapsed = (lastShownAt: string | null, now: Date): boolean => {
  if (!lastShownAt) return true;
  const shown = Date.parse(lastShownAt);
  if (Number.isNaN(shown)) return true;
  return now.getTime() - shown >= LOOP_INTRO_SPACING_DAYS * MS_PER_DAY;
};

export const shouldShowLoopIntro = (ctx: LoopIntroContext): boolean =>
  !ctx.hasUsedLoops &&
  !ctx.state.retired &&
  ctx.state.closes < LOOP_INTRO_MAX_CLOSES &&
  ctx.onboardingCompleted &&
  // IDLE only: never over a ride, a route being previewed, or the post-ride
  // feedback screen a rider lands on when reopening right after a ride.
  ctx.appState === 'IDLE' &&
  isRoutingCountry(ctx.countryCode) &&
  spacingElapsed(ctx.state.lastShownAt, ctx.now);

export const withLoopIntroShown = (state: LoopIntroState, nowIso: string): LoopIntroState => ({
  ...state,
  lastShownAt: nowIso,
});

export const withLoopIntroClosed = (state: LoopIntroState): LoopIntroState => ({
  ...state,
  closes: state.closes + 1,
});

export const withLoopIntroTried = (state: LoopIntroState): LoopIntroState => ({
  ...state,
  retired: true,
});

/**
 * Has this rider used loops? Opening the planner counts (stamped on mount by
 * `/loop-planner`), and so does a saved loop — the only evidence that exists
 * for someone who used loops on a build older than the planner stamp.
 */
export const hasUsedLoops = (input: {
  readonly hasOpenedLoopPlanner: boolean;
  readonly savedLoopCount: number;
}): boolean => input.hasOpenedLoopPlanner || input.savedLoopCount > 0;
