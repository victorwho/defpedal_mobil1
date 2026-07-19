/**
 * Product-analytics opt-in prompts — pure gating logic.
 *
 * Spec: docs/plans/analytics-optin-prompts.md. Three contextual in-app cards
 * (post-second-ride, post-first-hazard, impact-dashboard regular) replace the
 * removed onboarding consent toggle as PostHog's acquisition surface. This is
 * lawful Art 6(1)(a) consent acquisition — the prompts ask, they never
 * pre-tick — bounded by the EDPB anti-nagging rules below.
 *
 * Pure functions — no store, no IO. Cross-surface session arbitration
 * (SaveRideCard > ReviewPromptCard > AnalyticsOptInCard) lives in
 * `prompt-arbitration.ts`.
 */

export type AnalyticsPromptId =
  | 'post_second_ride'
  | 'post_first_hazard'
  | 'impact_dashboard';

/** Persisted slice (USER-scoped — cleared by resetUserScopedState). */
export interface AnalyticsPromptState {
  /** Prompt ids shown at least once — each prompt shows AT MOST once, ever. */
  asksShown: readonly string[];
  /** Explicit dismissals (✕ / "No thanks") across ALL prompts. */
  dismissCount: number;
  /** ISO timestamp of the most recent ask (drives the 14-day spacing). */
  lastAskAt: string | null;
  /** What flipped PostHog on: a prompt id, 'settings', or null (never). */
  convertedBy: string | null;
  /** Impact Dashboard visit counter (prompt 3 trigger — "same store slice"). */
  impactDashboardVisits: number;
  /** First-hazard-report evidence (prompt 2 trigger). */
  hasReportedHazard: boolean;
}

export const DEFAULT_ANALYTICS_PROMPT_STATE: AnalyticsPromptState = {
  asksShown: [],
  dismissCount: 0,
  lastAskAt: null,
  convertedBy: null,
  impactDashboardVisits: 0,
  hasReportedHazard: false,
};

/** Anti-nagging caps (EDPB dark-pattern guidance — spec header). */
export const ANALYTICS_PROMPT_LIFETIME_CAP = 3;
export const ANALYTICS_PROMPT_MAX_DISMISSALS = 2;
export const ANALYTICS_PROMPT_MIN_SPACING_DAYS = 14;

const SPACING_MS = ANALYTICS_PROMPT_MIN_SPACING_DAYS * 24 * 60 * 60 * 1000;

export interface AnalyticsPromptGateInput {
  /** Current PostHog consent flag — true retires every prompt permanently. */
  posthogEnabled: boolean;
  /**
   * True when the user has made an explicit Settings choice
   * (`analyticsConsent.capturedAt !== null`). Since the 2026-07-19
   * default-ON flip, PostHog-off + explicit choice = a deliberate opt-OUT —
   * re-asking would be nagging a decliner, so every prompt is suppressed.
   */
  hasExplicitChoice?: boolean;
  state: AnalyticsPromptState;
  now: Date;
}

/**
 * Shared gates for every prompt. Per-prompt trigger conditions (ride count,
 * hazard flag, visit count) are the CALLER's job — this enforces the caps:
 *   - retired once PostHog is on (any source) or a conversion is recorded
 *   - retired forever for explicit decliners (post-2026-07-19 default-ON,
 *     posthog=false means the user turned it OFF in Settings)
 *   - 2 explicit dismissals anywhere → all prompts off forever
 *   - each prompt shows at most once, ever (asksShown)
 *   - lifetime cap of 3 asks total
 *   - ≥14 days between any two asks
 */
export const shouldShowAnalyticsPrompt = (
  promptId: AnalyticsPromptId,
  input: AnalyticsPromptGateInput,
): boolean => {
  const { posthogEnabled, hasExplicitChoice, state, now } = input;
  if (posthogEnabled) return false;
  if (hasExplicitChoice) return false;
  if (state.convertedBy !== null) return false;
  if (state.dismissCount >= ANALYTICS_PROMPT_MAX_DISMISSALS) return false;
  if (state.asksShown.includes(promptId)) return false;
  if (state.asksShown.length >= ANALYTICS_PROMPT_LIFETIME_CAP) return false;
  if (state.lastAskAt !== null) {
    const last = Date.parse(state.lastAskAt);
    if (!Number.isFinite(last)) return false;
    if (now.getTime() - last < SPACING_MS) return false;
  }
  return true;
};

/** Prompt-1 trigger: exactly the second completed ride. */
export const isPostSecondRideTriggered = (completedRideCount: number): boolean =>
  completedRideCount === 2;

/** Prompt-3 trigger: third-or-later dashboard visit. */
export const isImpactDashboardTriggered = (visits: number): boolean => visits >= 3;
