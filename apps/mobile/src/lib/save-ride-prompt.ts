/**
 * Save-ride signup prompt — pure gating logic.
 *
 * Decides whether the post-ride impact screen shows the SaveRideCard (the
 * contextual "Save this ride before it's gone" signup ask for anonymous
 * riders). Mirrors the review-prompt discipline: bounded schedule, hard
 * dismissal cap, never during navigation.
 *
 * Pure functions only — no store, no IO — trivially testable.
 */

export interface SaveRidePromptState {
  /**
   * `completedRideCount` at the last time the card was shown. Guards against
   * re-showing for the same ride (screen re-mounts, re-renders after the
   * shown-marker is recorded).
   */
  lastShownRide: number;
  /** Explicit dismissals (✕ or "keep riding as guest"). Soft unmounts don't count. */
  dismissCount: number;
}

/** After this many explicit dismissals the card never shows again. */
export const SAVE_RIDE_MAX_DISMISSALS = 2;

export interface SaveRidePromptInput {
  isAnonymous: boolean;
  completedRideCount: number;
  state: SaveRidePromptState;
  isNavigating: boolean;
}

/**
 * Pestering schedule: rides 1, 3, then every 5th ride after that (8, 13, 18…).
 * Ride 1 is the highest-motivation moment (first-ever results on screen);
 * ride 3 catches the habit-forming window; the 5-ride cadence keeps the ask
 * alive without becoming noise.
 */
export const isSaveRideScheduledRide = (ride: number): boolean => {
  if (ride === 1 || ride === 3) return true;
  return ride > 3 && (ride - 3) % 5 === 0;
};

export const shouldShowSaveRidePrompt = (input: SaveRidePromptInput): boolean => {
  // Anonymous-only: a signed-in user has nothing to save.
  if (!input.isAnonymous) return false;
  // Not reachable during navigation today (feedback requires
  // AWAITING_FEEDBACK), but keep the guard consistent with every other
  // attention-asking surface.
  if (input.isNavigating) return false;
  if (input.completedRideCount < 1) return false;
  if (input.state.dismissCount >= SAVE_RIDE_MAX_DISMISSALS) return false;
  // Already shown for this ride (count only ever increases).
  if (input.completedRideCount <= input.state.lastShownRide) return false;
  return isSaveRideScheduledRide(input.completedRideCount);
};
