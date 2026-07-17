/**
 * Session-scoped arbitration between the three attention-asking card
 * surfaces. Spec (docs/plans/analytics-optin-prompts.md): the analytics
 * opt-in card must NEVER appear in the same session as the SaveRideCard or
 * ReviewPromptCard; when eligible simultaneously the priority order is
 * SaveRideCard > ReviewPromptCard > AnalyticsOptInCard.
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

export type PromptSurface = 'save_ride' | 'review' | 'analytics';

let shownThisSession = new Set<PromptSurface>();

/**
 * Claim the prompt slot for a surface. Returns true when the surface may
 * render (and records the claim); false when arbitration blocks it.
 */
export const claimPromptSlot = (surface: PromptSurface): boolean => {
  if (surface === 'analytics') {
    if (shownThisSession.has('save_ride') || shownThisSession.has('review')) {
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
    return !shownThisSession.has('save_ride') && !shownThisSession.has('review');
  }
  return !shownThisSession.has('analytics');
};

/** Test-only: reset the session state. */
export const resetPromptArbitrationForTest = (): void => {
  shownThisSession = new Set();
};
