/**
 * Setting off on a generated loop.
 *
 * Lives here rather than inline in `/loop-planner` for one reason: the whole
 * failure this replaces was a hand-off that looked wired and did nothing —
 * `openSelected` fired telemetry and showed a toast, so the button reacted, the
 * screen rendered, typecheck passed, and no ride ever started. That is not
 * reachable by rendering the screen in a test without standing up Mapbox, GPS
 * and the premium gate, so it stayed unreachable and shipped twice.
 *
 * As a plain function over the store's actions it is exercised directly, and
 * the assertion is the thing that actually matters: the route reaches
 * `routePreview`, a `trip_start` is queued, and the session begins.
 */
import type { Coordinate, RouteOption } from '@defensivepedal/core';

import type { AppStore } from '../store/appStore';
import { boundRoutePolyline6 } from './routeGeometry';

/**
 * Just the store surface a ride start needs.
 *
 * Picked from the real `AppStore` rather than hand-written, so it cannot drift
 * from the store it is called with. The import is type-only, so it erases at
 * runtime and the test never loads the store, AsyncStorage or the persist
 * middleware.
 */
export type LoopRideStore = Pick<
  AppStore,
  | 'appState'
  | 'setRouteRequest'
  | 'setRoutePreview'
  | 'enqueueMutation'
  | 'setActiveTripClientId'
  | 'startNavigation'
>;

export interface BeginLoopRideArgs {
  readonly route: RouteOption;
  readonly start: Coordinate;
  readonly distanceMeters: number;
  /** Human label for the ride, e.g. "24 km loop". Becomes `destinationText`. */
  readonly loopName: string;
  /** Passed in rather than read from the clock, so the result is testable. */
  readonly startedAt: string;
  readonly sessionId: string;
  readonly clientTripId: string;
}

export type BeginLoopRideResult = 'started' | 'already-navigating';

/**
 * Publish the loop and begin a navigation session.
 *
 * Returns `already-navigating` without touching anything when a ride is
 * already under way — the rider has backed out of `/navigation` onto the
 * planner, and starting again would enqueue a second `trip_start` with a fresh
 * `clientTripId`, orphaning the first.
 */
export const beginLoopRide = (
  store: LoopRideStore,
  args: BeginLoopRideArgs,
): BeginLoopRideResult => {
  if (store.appState === 'NAVIGATING') return 'already-navigating';

  // Both ends are the start, because that is what a loop is. Safe because
  // navigation gates completion on `onLastStep` as well as proximity, so
  // sitting on the destination at kilometre zero does not end the ride.
  store.setRouteRequest({
    origin: args.start,
    destination: args.start,
    waypoints: [],
    startOverride: undefined,
  });

  // Navigation reads its route from `routePreview.routes`, so the loop has to
  // be published there before the session starts.
  store.setRoutePreview(
    {
      routes: [args.route],
      selectedMode: 'safe',
      coverage: {
        countryCode: '',
        status: 'supported',
        safeRouting: false,
        fastRouting: false,
      },
      generatedAt: args.startedAt,
    },
    { preferredRouteId: args.route.id },
  );

  // Enqueued unconditionally, even with no auth session yet — the offline
  // queue is the right buffer, and a missing `trip_start` is how recorded
  // rides get silently dropped (GPS audit 2026-07-15 P0-1).
  store.enqueueMutation('trip_start', {
    clientTripId: args.clientTripId,
    sessionId: args.sessionId,
    startLocationText: `Loop start (${args.start.lat.toFixed(5)}, ${args.start.lon.toFixed(5)})`,
    startCoordinate: args.start,
    destinationText: args.loopName,
    destinationCoordinate: args.start,
    distanceMeters: args.distanceMeters,
    startedAt: args.startedAt,
    // Recorded at start: a loop's destination IS its origin, so without the
    // geometry a trips row alone cannot draw anything at all.
    plannedRoutePolyline6: boundRoutePolyline6(args.route.geometryPolyline6),
    plannedRouteDistanceMeters: args.route.distanceMeters,
    routingMode: 'generated_loop',
  });
  store.setActiveTripClientId(args.clientTripId);

  store.startNavigation(args.route, args.sessionId);
  return 'started';
};
