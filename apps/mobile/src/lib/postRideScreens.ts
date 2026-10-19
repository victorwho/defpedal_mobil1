/**
 * Post-ride screens are skipped for a rider's first rides (2026-10-09).
 *
 * Measured over 90 days of production rides: only 14 of 119 riders reach a
 * third saved ride and 12 a fourth, so the post-ride rating and the
 * save/discard prompts were landing on riders who had not yet decided to stay.
 * Those rides are saved quietly instead — the impact still records through the
 * `ride_impact` queue mutation — and the rider returns to the map.
 */
import { haversineDistance } from '@defensivepedal/core';

export const QUIET_FIRST_RIDES = 3;

/**
 * True when the ride that is ending should skip the post-ride screens.
 * `completedRideCount` is the count BEFORE this ride (device-scoped,
 * incremented as each ride is saved).
 */
export const isQuietRide = (completedRideCount: number): boolean =>
  completedRideCount < QUIET_FIRST_RIDES;

/** How long the "Ride saved · Discard" toast stays up. */
export const RIDE_SAVED_UNDO_MS = 6_000;

/**
 * How long a quietly-saved early stop is held before uploading. Longer than
 * the toast so a Discard tapped on its last frame still lands before anything
 * is sent.
 */
export const RIDE_SAVED_HOLD_MS = 8_000;

// ---------------------------------------------------------------------------
// From ride 4 on (product decision 2026-10-09)
// ---------------------------------------------------------------------------
//
// - A COMPLETED ride always shows the impact summary; the rating step after
//   it only when `isRatingDue`. 50 of the last 65 ratings were 5 stars and 4
//   carried a comment, so asking on every ride bought little.
// - An EARLY stop saves with the "Ride saved · Discard" toast, never a
//   dialog. Badges and tier-ups still celebrate through the root overlays.
//   The reason question is asked on every third early stop only.
// - A stop within `ARRIVAL_RADIUS_METERS` of the destination counts as
//   arrived: 59 riders had answered "I reached my destination" to the
//   early-stop question, i.e. arrival was not detected.

/** First ride on which the post-ride rating may be asked. */
export const RATING_FIRST_RIDE = QUIET_FIRST_RIDES + 1;
/** After that, at least this many rides since it was last asked… */
export const RATING_MIN_RIDES_BETWEEN = 5;
/** …and at least this many days. */
export const RATING_MIN_DAYS_BETWEEN = 14;

export type RatingPromptHistory = {
  /** Ride number on which the rating was last asked. */
  readonly lastRide: number | null;
  /** When it was last asked (ISO). */
  readonly lastAt: string | null;
};

const DAY_MS = 86_400_000;

/**
 * Whether the rating step follows the impact summary on this ride.
 * `rideNumber` counts the ride that just ended (1 = the rider's first).
 */
export const isRatingDue = (
  rideNumber: number,
  history: RatingPromptHistory,
  nowMs: number = Date.now(),
): boolean => {
  if (rideNumber < RATING_FIRST_RIDE) return false;
  if (history.lastRide == null || history.lastAt == null) return true;
  const lastAtMs = Date.parse(history.lastAt);
  const daysSince = Number.isFinite(lastAtMs) ? (nowMs - lastAtMs) / DAY_MS : Infinity;
  return (
    rideNumber - history.lastRide >= RATING_MIN_RIDES_BETWEEN &&
    daysSince >= RATING_MIN_DAYS_BETWEEN
  );
};

/** The early-stop reason question is asked on one early stop in this many. */
export const EARLY_END_REASON_EVERY = 3;

/** `earlyStopsSoFar` counts earlier early stops (from ride 4 on), not this one. */
export const isEarlyEndReasonDue = (earlyStopsSoFar: number): boolean =>
  earlyStopsSoFar % EARLY_END_REASON_EVERY === 0;

/** A stop this close to the destination is treated as arriving. */
export const ARRIVAL_RADIUS_METERS = 150;

type LatLon = { readonly lat: number; readonly lon: number };

export const isNearDestination = (
  position: LatLon | null | undefined,
  destination: LatLon | null | undefined,
): boolean => {
  if (!position || !destination) return false;
  // 0,0 is the store's "no destination" placeholder.
  if (destination.lat === 0 && destination.lon === 0) return false;
  return (
    haversineDistance([position.lat, position.lon], [destination.lat, destination.lon]) <=
    ARRIVAL_RADIUS_METERS
  );
};

/**
 * Where a quietly saved ride sends the rider.
 *
 * A rider on the first-ride onboarding who rode WITHOUT an account (audit
 * 2026-10-18 #2) goes straight to the signup screen to keep the ride — not to
 * the map with a "Ride saved" toast, which the signup gate then redirected
 * through and which could land them back on "Where do you want to ride?".
 * Everyone else returns to the map as before.
 */
export const quietRideDestination = (input: {
  readonly isAnonymous: boolean;
  readonly onboardingFlow: 'legacy' | 'first_ride' | null;
  readonly onboardingCompleted: boolean;
}): '/onboarding/signup-prompt' | '/route-planning' =>
  input.isAnonymous && input.onboardingFlow === 'first_ride' && !input.onboardingCompleted
    ? '/onboarding/signup-prompt'
    : '/route-planning';
