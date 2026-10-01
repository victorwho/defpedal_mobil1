/**
 * Session-scoped arbitration between the attention-asking card surfaces. Spec (docs/plans/analytics-optin-prompts.md): the analytics
 * opt-in card must NEVER appear in the same session as the SaveRideCard or
 * ReviewPromptCard; when eligible simultaneously the priority order is
 * SaveRideCard > ReviewPromptCard > SesizareCard > AnalyticsOptInCard.
 *
 * Implementation: every surface CLAIMS its slot through this module before
 * rendering, in the order the flows naturally evaluate them (SaveRideCard on
 * the impact step, ReviewPromptCard on the rating step, analytics prompts at
 * their trigger points). The same-session exclusion is bidirectional for the
 * analytics card: if it managed to show first (e.g. on the dashboard), the
 * save-ride / review cards yield for the rest of the session — an analytics
 * ask is rare (3 lifetime) so the deferral cost is negligible, and stacking
 * a second ask violates the anti-nagging rules either way.
 *
 * Module-level state = session-scoped by construction (cleared on process
 * restart, which is the session boundary every other prompt latch uses).
 */

export type PromptSurface =
  | 'save_ride'
  | 'review'
  | 'sesizare'
  | 'analytics'
  | 'plus'
  | 'feature_intro';

/*
 * Which already-shown surfaces block each surface for the rest of the session.
 * One table, read by both `claimPromptSlot` and `isPromptSlotAvailable`, so the
 * claim and the preview can never disagree.
 *
 *  - save_ride / review: yield only to the analytics ask (bidirectional
 *    same-session exclusion from the analytics-optin spec).
 *  - sesizare: sits BELOW the review card — the Play review funnel is
 *    quota-limited — and is also ordered structurally (it renders on the
 *    post-submit view, after the review card has claimed or declined).
 *  - analytics: yields to everything; it is rare (3 lifetime) so deferral is
 *    cheap.
 *  - plus (docs/plans/pedal-plus-nudges.md): the lowest-priority ASK. A sale
 *    never displaces a rider's own ride, a review, a civic report or consent.
 *    Save-ride and review still render after it — they carry the rider's own
 *    data and the review quota, and a Plus card is inline and dismissible.
 *  - feature_intro (the app-open Loop explainer, lib/loop-intro.ts): yields to
 *    any ask already shown, and once shown keeps the two lower-value asks —
 *    Plus and analytics — out of its session. Never blocks save-ride, review
 *    or a civic report: those come from the rider's own ride.
 */
const BLOCKED_BY: Record<PromptSurface, readonly PromptSurface[]> = {
  save_ride: ['analytics'],
  review: ['analytics'],
  sesizare: ['save_ride', 'review', 'analytics'],
  analytics: ['save_ride', 'review', 'sesizare', 'plus', 'feature_intro'],
  plus: ['save_ride', 'review', 'sesizare', 'analytics', 'feature_intro'],
  feature_intro: ['save_ride', 'review', 'sesizare', 'analytics', 'plus'],
};

let shownThisSession = new Set<PromptSurface>();

/**
 * Read-only check (no claim) — for eligibility previews. A surface that has
 * already claimed this session stays available, so a re-render never hides
 * what is showing.
 */
export const isPromptSlotAvailable = (surface: PromptSurface): boolean =>
  shownThisSession.has(surface) ||
  !BLOCKED_BY[surface].some((blocker) => shownThisSession.has(blocker));

/**
 * Claim the prompt slot for a surface. Returns true when the surface may
 * render (and records the claim); false when arbitration blocks it.
 */
export const claimPromptSlot = (surface: PromptSurface): boolean => {
  if (!isPromptSlotAvailable(surface)) return false;
  shownThisSession.add(surface);
  return true;
};

/** Test-only: reset the session state. */
export const resetPromptArbitrationForTest = (): void => {
  shownThisSession = new Set();
};
