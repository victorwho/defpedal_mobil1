/**
 * Play Store review-prompt eligibility logic.
 *
 * Pure functions only — no I/O, no platform APIs, no clock side effects.
 * The mobile layer feeds in a snapshot (state + clock + ride context) and
 * gets back a decision (`null` = suppress, `ReviewTrigger` = show the card).
 *
 * Two-stage funnel: this helper decides only Stage 1 (whether to show our
 * sentiment card). Stage 2 (the native Play `ReviewManager` call) is gated
 * separately on a positive sentiment response in the mobile layer.
 *
 * Design doc: see "Play Store review prompt — Plan" in the project notes.
 */

// ---------------------------------------------------------------------------
// Constants — gating thresholds
// ---------------------------------------------------------------------------

/** Minimum app age before the very first prompt may surface. */
export const REVIEW_MIN_DAYS_SINCE_INSTALL = 7;

/** Minimum completed rides (lifetime) before the very first prompt. */
export const REVIEW_MIN_COMPLETED_RIDES = 3;

/** Cooldown after the user dismissed Stage 1 with "Later". */
export const REVIEW_COOLDOWN_LATER_DAYS = 30;

/** Cooldown after the user gave negative sentiment (route to feedback once). */
export const REVIEW_COOLDOWN_NEGATIVE_DAYS = 90;

/** Cooldown between any two consecutive prompts, regardless of outcome. */
export const REVIEW_COOLDOWN_DEFAULT_DAYS = 90;

/** Hard ceiling on total prompts shown to a single device. */
export const REVIEW_MAX_PROMPTS_LIFETIME = 3;

/**
 * After this many "seen but ignored" (scrolled past, never tapped any
 * button — counted by the UI when the card unmounts without an action),
 * escalate to the default cooldown to stop pestering.
 */
export const REVIEW_SOFT_DISMISS_LIMIT = 3;

/**
 * After the user taps "Sure, rate" we assume they engaged with the native
 * Play sheet. Don't ask again for a full year — matches Google's per-user
 * review quota window in practice and prevents annoying repeat asks.
 */
export const REVIEW_COOLDOWN_RATED_DAYS = 365;

/** Suppress for this long after any error/crash signal. */
export const REVIEW_SUPPRESS_AFTER_ERROR_HOURS = 24;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Why the prompt is being shown. Drives telemetry and lets us tune trigger
 * mix later. Card UI doesn't branch on this.
 */
export type ReviewTrigger =
  | 'ride_completed_safely'
  | 'positive_feedback'
  | 'badge_unlocked'
  | 'tier_promotion'
  | 'co2_milestone';

/**
 * User's response to Stage 1 sentiment check. Persisted so we can choose
 * the right cooldown on the next eligibility check.
 */
export type ReviewSentiment = 'positive' | 'negative' | 'later' | null;

/**
 * Persisted device-scoped state. The mobile Zustand slice mirrors this
 * shape exactly so it can be passed straight in.
 */
export interface ReviewPromptState {
  /** ISO timestamp the *first* eligibility check ever ran on this install. */
  readonly installedAt: string | null;
  /** ISO timestamp of the last prompt actually shown. */
  readonly lastShownAt: string | null;
  /** ISO timestamp of the most recent crash / error suppression signal. */
  readonly lastErrorAt: string | null;
  /** Total times Stage 1 card has been rendered (lifetime, this device). */
  readonly promptCount: number;
  /** How many times the card was shown but the user gave no explicit answer. */
  readonly softDismissCount: number;
  /** Latest explicit answer the user gave. */
  readonly lastSentiment: ReviewSentiment;
  /**
   * True once the user tapped "Sure, rate" (we assume they rated — Play
   * doesn't tell us if they actually submitted). Triggers the 365-day mute.
   */
  readonly rated: boolean;
  /** User toggled review prompts off in Profile. Hard suppress forever. */
  readonly optedOut: boolean;
}

export const DEFAULT_REVIEW_PROMPT_STATE: ReviewPromptState = {
  installedAt: null,
  lastShownAt: null,
  lastErrorAt: null,
  promptCount: 0,
  softDismissCount: 0,
  lastSentiment: null,
  rated: false,
  optedOut: false,
};

/**
 * Live signals about the ride that just finished (or the moment we're
 * considering). Pure data — no functions, no promises.
 */
export interface ReviewEvaluationContext {
  /** Current ISO timestamp. Caller injects so this stays testable. */
  readonly nowIso: string;
  /** Lifetime completed rides on this device/account. */
  readonly completedRideCount: number;
  /** What just happened. Drives the trigger label. */
  readonly trigger: ReviewTrigger;
  /**
   * Anti-trigger flags. If any are true we suppress regardless of trigger.
   * Caller composes them — this helper just respects whatever it's told.
   */
  readonly suppress: {
    readonly hasRecentError: boolean;
    readonly isOffline: boolean;
    readonly isNavigating: boolean;
    readonly hadRerouteOnLastRide: boolean;
    readonly lastRideDiscarded: boolean;
    readonly lastFeedbackNegative: boolean;
  };
}

/**
 * Decision returned to the caller. `null` = suppress, otherwise the trigger
 * label to render with (we round-trip it for telemetry / a/b later).
 */
export interface ReviewDecision {
  readonly trigger: ReviewTrigger;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Returns elapsed days between two ISO timestamps. Returns `Infinity` when
 * `from` is null so "never happened" passes any "≥ N days" gate trivially.
 * Returns 0 (not negative) when `now` is somehow earlier than `from`, e.g.
 * device clock rewound — we never want to *re-enable* a cooldown via clock
 * skew, but we also don't want to permanently lock the user out.
 */
export function daysBetween(fromIso: string | null, nowIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return Number.POSITIVE_INFINITY;
  const diff = now - from;
  if (diff <= 0) return 0;
  return diff / MS_PER_DAY;
}

export function hoursBetween(fromIso: string | null, nowIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = Date.parse(fromIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(from) || Number.isNaN(now)) return Number.POSITIVE_INFINITY;
  const diff = now - from;
  if (diff <= 0) return 0;
  return diff / MS_PER_HOUR;
}

/**
 * Cooldown days based on the *last* sentiment answer. Latest answer wins;
 * "rated" beats everything else.
 */
export function cooldownDaysFor(state: ReviewPromptState): number {
  if (state.rated) return REVIEW_COOLDOWN_RATED_DAYS;
  if (state.lastSentiment === 'negative') return REVIEW_COOLDOWN_NEGATIVE_DAYS;
  if (state.lastSentiment === 'later') return REVIEW_COOLDOWN_LATER_DAYS;
  if (state.softDismissCount >= REVIEW_SOFT_DISMISS_LIMIT) {
    return REVIEW_COOLDOWN_DEFAULT_DAYS;
  }
  return REVIEW_COOLDOWN_DEFAULT_DAYS;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Returns a decision for whether to show the Stage 1 review card now.
 * Returns `null` whenever any gate fails — the caller should treat that
 * as "render nothing".
 *
 * Evaluation order (cheapest checks first to make failures fast):
 *   1. Hard opt-out / lifetime cap / already-rated
 *   2. Live safety suppressors (navigating, offline, recent crash, ...)
 *   3. Eligibility (install age, ride count)
 *   4. Cooldown since last prompt
 *
 * The "trigger" itself is whatever the caller passed in — we don't choose
 * between trigger sources here, that's the caller's job. We only decide
 * whether *any* trigger is allowed to fire right now.
 */
export function evaluateReviewEligibility(
  state: ReviewPromptState,
  ctx: ReviewEvaluationContext,
): ReviewDecision | null {
  // 1. Hard opt-out / caps
  if (state.optedOut) return null;
  if (state.rated) return null;
  if (state.promptCount >= REVIEW_MAX_PROMPTS_LIFETIME) return null;

  // 2. Live safety suppressors (cheapest signals — fail fast)
  if (ctx.suppress.isNavigating) return null;
  if (ctx.suppress.isOffline) return null;
  if (ctx.suppress.hasRecentError) return null;
  if (ctx.suppress.lastRideDiscarded) return null;
  if (ctx.suppress.lastFeedbackNegative) return null;
  if (ctx.suppress.hadRerouteOnLastRide) return null;

  // Belt-and-suspenders: even if the caller forgot to set hasRecentError,
  // we cross-check the stored lastErrorAt timestamp here.
  if (
    hoursBetween(state.lastErrorAt, ctx.nowIso) < REVIEW_SUPPRESS_AFTER_ERROR_HOURS
  ) {
    return null;
  }

  // 3. Eligibility — `installedAt: null` means we have never seeded a first
  // eligibility check, so we have no idea how long the app has been around.
  // Treat that as "too new" rather than "infinitely old" (the daysBetween
  // null→Infinity convention is right for cooldown timestamps but wrong here).
  if (
    state.installedAt === null ||
    daysBetween(state.installedAt, ctx.nowIso) < REVIEW_MIN_DAYS_SINCE_INSTALL
  ) {
    return null;
  }
  if (ctx.completedRideCount < REVIEW_MIN_COMPLETED_RIDES) return null;

  // 4. Cooldown
  const requiredCooldown = cooldownDaysFor(state);
  if (daysBetween(state.lastShownAt, ctx.nowIso) < requiredCooldown) {
    return null;
  }

  return { trigger: ctx.trigger };
}

// ---------------------------------------------------------------------------
// State transitions — pure reducers the Zustand slice composes from
// ---------------------------------------------------------------------------

/** Record that the Stage 1 card was actually rendered. */
export function recordPromptShown(
  state: ReviewPromptState,
  nowIso: string,
): ReviewPromptState {
  return {
    ...state,
    lastShownAt: nowIso,
    promptCount: state.promptCount + 1,
  };
}

/** Record an explicit user answer on Stage 1. */
export function recordSentiment(
  state: ReviewPromptState,
  sentiment: ReviewSentiment,
): ReviewPromptState {
  return { ...state, lastSentiment: sentiment };
}

/** Card unmounted with no user interaction — soft-dismiss bookkeeping. */
export function recordSoftDismiss(
  state: ReviewPromptState,
): ReviewPromptState {
  return { ...state, softDismissCount: state.softDismissCount + 1 };
}

/**
 * User tapped "Sure, rate" → we asked the Play sheet to open. Even if Play
 * silently no-op'd (quota exhausted, etc.) we treat this as terminal —
 * don't re-prompt for a year, the user has been given the path.
 */
export function recordRated(state: ReviewPromptState): ReviewPromptState {
  return { ...state, rated: true };
}

/** First eligibility evaluation seeds the install timestamp. */
export function ensureInstalledAt(
  state: ReviewPromptState,
  nowIso: string,
): ReviewPromptState {
  if (state.installedAt) return state;
  return { ...state, installedAt: nowIso };
}

/** Mark an error/crash signal to drive the 24h post-error suppression window. */
export function recordError(
  state: ReviewPromptState,
  nowIso: string,
): ReviewPromptState {
  return { ...state, lastErrorAt: nowIso };
}

export function setOptedOut(
  state: ReviewPromptState,
  optedOut: boolean,
): ReviewPromptState {
  return { ...state, optedOut };
}
