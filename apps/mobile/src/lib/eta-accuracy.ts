/**
 * `eta_accuracy`: how close the ride time we showed was to the ride itself
 * (docs/plans/adaptive-eta.md, "Measuring it"). Captured once per completed
 * ride that never rerouted, so the prediction and the ride cover the same
 * route.
 */
import {
  isEbikeBikeTypeValue,
  paceAppliesTo,
  personalRideSeconds,
  resolveEtaPace,
  routerTimeIsEstimate,
  type NavigationSession,
  type RiderPaces,
  type RouteOption,
} from '@defensivepedal/core';

export interface EtaAccuracyInput {
  readonly session: NavigationSession | null;
  readonly route: RouteOption | null;
  readonly riderPaces: RiderPaces | null;
  readonly paceEtaEnabled: boolean;
  /** Profile bike id: picks the pace. */
  readonly bikeTypeId: string | null;
  /** E-bike routing mode: decides whether the route's time is a router's. */
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
    ebikeOwner: isEbikeBikeTypeValue(input.bikeTypeId),
  });
  const routerSeconds = Math.round(route.adjustedDurationSeconds);
  const timed = {
    distanceMeters: route.distanceMeters,
    climbMeters: route.totalClimbMeters,
    routerSeconds,
    routerIsEstimate: routerTimeIsEstimate(route, input.isEbike),
  };
  const personalSeconds = Math.round(personalRideSeconds(timed, pace));
  const method = !paceAppliesTo(timed, pace)
    ? 'router'
    : pace.routerFactor !== undefined && !timed.routerIsEstimate
      ? 'factor'
      : 'pace';

  return {
    method,
    router_seconds: routerSeconds,
    personal_seconds: personalSeconds,
    actual_seconds: actualSeconds,
    distance_meters: Math.round(route.distanceMeters),
    pace_ride_count: pace?.rideCount ?? 0,
    is_ebike: isEbikeBikeTypeValue(input.bikeTypeId) ? 1 : 0,
    ebike_routing: input.isEbike ? 1 : 0,
  };
};
