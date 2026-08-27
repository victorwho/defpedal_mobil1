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

export type PromptSurface = 'save_ride' | 'review' | 'sesizare' | 'analytics';

let shownThisSession = new Set<PromptSurface>();

/**
 * Claim the prompt slot for a surface. Returns true when the surface may
 * render (and records the claim); false when arbitration blocks it.
 */
export const claimPromptSlot = (surface: PromptSurface): boolean => {
  if (surface === 'analytics') {
    if (
      shownThisSession.has('save_ride') ||
      shownThisSession.has('review') ||
      shownThisSession.has('sesizare')
    ) {
      return false;
    }
  } else if (surface === 'sesizare') {
    // Sesizări sit BELOW the review card: the Play review funnel is
    // quota-limited and revenue-adjacent, so it wins when both are eligible.
    // Ordering is enforced structurally too — the sesizare card lives on the
    // post-submit "thank you" view, which renders after the review card has
    // already claimed or declined its slot.
    if (
      shownThisSession.has('save_ride') ||
      shownThisSession.has('review') ||
      shownThisSession.has('analytics')
    ) {
      return false;
    }
  } else if (shownThisSession.has('analytics')) {
    // Bidirectional same-session exclusion (spec anti-nagging rules).
    return false;
  }
  shownThisSession.add(surface);
  return true;
};

/** Read-only check (no claim) — for eligibility previews. */
export const isPromptSlotAvailable = (surface: PromptSurface): boolean => {
  if (surface === 'analytics') {
    return (
      !shownThisSession.has('save_ride') &&
      !shownThisSession.has('review') &&
      !shownThisSession.has('sesizare')
    );
  }
  if (surface === 'sesizare') {
    return (
      !shownThisSession.has('save_ride') &&
      !shownThisSession.has('review') &&
      !shownThisSession.has('analytics')
    );
  }
  return !shownThisSession.has('analytics');
};

/** Test-only: reset the session state. */
export const resetPromptArbitrationForTest = (): void => {
  shownThisSession = new Set();
};
