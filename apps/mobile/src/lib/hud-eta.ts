/**
 * The navigation HUD's time for what is left (docs/plans/adaptive-eta.md):
 * the rider's pace before the ride (Phase 1), then blended with the speed
 * ridden so far (Phase 2). Display only; the session keeps the router's
 * figure. With the Display switch off it is the router's time throughout.
 */
import {
  adaptiveRemainingSeconds,
  personalRideSeconds,
  type RiddenSoFar,
  type RiderPace,
} from '@defensivepedal/core';

export const hudRemainingSeconds = (input: {
  readonly remainingDistanceMeters: number;
  readonly remainingClimbMeters: number | null;
  readonly routerSeconds: number;
  /** From `useRiderPace`. */
  readonly pace: RiderPace | null;
  /** Null when the Display switch is off: no in-ride blending either. */
  readonly ridden: RiddenSoFar | null;
  readonly riddenClimbMeters: number | null;
}): number => {
  const priorSeconds = personalRideSeconds(
    {
      distanceMeters: input.remainingDistanceMeters,
      climbMeters: input.remainingClimbMeters,
      routerSeconds: input.routerSeconds,
    },
    input.pace,
  );
  if (!input.ridden) return Math.round(priorSeconds);
  return Math.round(
    adaptiveRemainingSeconds({
      remainingDistanceMeters: input.remainingDistanceMeters,
      remainingClimbMeters: input.remainingClimbMeters,
      priorSeconds,
      ridden: input.ridden,
      riddenClimbMeters: input.riddenClimbMeters,
    }),
  );
};
