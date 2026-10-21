/**
 * `eta_accuracy`: how close the ride time we showed was to the ride itself
 * (docs/plans/adaptive-eta.md, "Measuring it"). Captured once per completed
 * ride that never rerouted, so the prediction and the ride cover the same
 * route.
 */
import {
  personalRideSeconds,
  resolveEtaPace,
  type NavigationSession,
  type RiderPaces,
  type RouteOption,
} from '@defensivepedal/core';

export interface EtaAccuracyInput {
  readonly session: NavigationSession | null;
  readonly route: RouteOption | null;
  readonly riderPaces: RiderPaces | null;
  readonly paceEtaEnabled: boolean;
  readonly isEbike: boolean;
  readonly nowMs: number;
}

export const etaAccuracyProperties = (
  input: EtaAccuracyInput,
): Record<string, string | number> | null => {
  const { session, route } = input;
  if (!session || !route || (session.rerouteCount ?? 0) > 0) return null;
  const actualSeconds = Math.round((input.nowMs - Date.parse(session.startedAt)) / 1000);
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0) return null;

  const pace = resolveEtaPace({
    paces: input.riderPaces,
    enabled: input.paceEtaEnabled,
    isEbike: input.isEbike,
  });
  const routerSeconds = Math.round(route.adjustedDurationSeconds);
  const personalSeconds = Math.round(
    personalRideSeconds(
      {
        distanceMeters: route.distanceMeters,
        climbMeters: route.totalClimbMeters,
        routerSeconds,
      },
      pace,
    ),
  );

  return {
    method: pace ? (pace.routerFactor !== undefined ? 'factor' : 'pace') : 'router',
    router_seconds: routerSeconds,
    personal_seconds: personalSeconds,
    actual_seconds: actualSeconds,
    distance_meters: Math.round(route.distanceMeters),
    pace_ride_count: pace?.rideCount ?? 0,
    is_ebike: input.isEbike ? 1 : 0,
  };
};
