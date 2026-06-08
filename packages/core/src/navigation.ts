import type {
  Coordinate,
  NavigationLocationSample,
  NavigationSession,
  RouteOption,
} from './contracts';
import {
  closestPointOnPolyline,
  findClosestPointIndex,
  haversineDistance,
  polylineSegmentDistance,
  type PolylineSnapResult,
} from './distance';
import { decodePolyline } from './polyline';

export type AppState = 'IDLE' | 'ROUTE_PREVIEW' | 'NAVIGATING' | 'AWAITING_FEEDBACK';

export const OFF_ROUTE_THRESHOLD_METERS = 50;
export const PRE_ANNOUNCEMENT_METERS = 200;
export const APPROACH_ANNOUNCEMENT_METERS = 50;
export const ARRIVAL_THRESHOLD_METERS = 25;
export const AUTO_REROUTE_DELAY_MS = 60000;
export const REROUTE_COOLDOWN_MS = 60000;
export const ETA_ANNOUNCEMENT_INTERVAL_MS = 5 * 60 * 1000;

export interface NavigationProgressSnapshot {
  currentStepIndex: number;
  snappedCoordinate: Coordinate | null;
  distanceToRouteMeters: number;
  distanceToManeuverMeters: number | null;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  shouldPreAnnounce: boolean;
  shouldAnnounceApproach: boolean;
  shouldAdvanceStep: boolean;
  shouldCompleteNavigation: boolean;
  isOffRoute: boolean;
}

const generateSessionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}`;
};

export const createNavigationSession = (
  routeId: string,
  startedAt = new Date().toISOString(),
  sessionId = generateSessionId(),
): NavigationSession => ({
  sessionId,
  routeId,
  state: 'navigating',
  currentStepIndex: 0,
  isMuted: false,
  isFollowing: true,
  startedAt,
  rerouteEligible: false,
  lastApproachAnnouncementStepId: null,
  offRouteSince: null,
  lastRerouteAt: null,
  gpsBreadcrumbs: [],
});

export const setSessionMute = (
  session: NavigationSession,
  isMuted: boolean,
): NavigationSession => ({
  ...session,
  isMuted,
});

export const setSessionFollowMode = (
  session: NavigationSession,
  isFollowing: boolean,
): NavigationSession => ({
  ...session,
  isFollowing,
});

export const setSessionSnappedCoordinate = (
  session: NavigationSession,
  coordinate: Coordinate,
): NavigationSession => ({
  ...session,
  lastSnappedCoordinate: coordinate,
});

export const setSessionRerouteEligible = (
  session: NavigationSession,
  rerouteEligible: boolean,
): NavigationSession => ({
  ...session,
  rerouteEligible,
});

export const setSessionPreAnnouncement = (
  session: NavigationSession,
  stepId: string | null,
): NavigationSession => ({
  ...session,
  lastPreAnnouncementStepId: stepId,
});

export const setSessionApproachAnnouncement = (
  session: NavigationSession,
  stepId: string | null,
): NavigationSession => ({
  ...session,
  lastApproachAnnouncementStepId: stepId,
});

export const syncSessionToRoute = (
  session: NavigationSession,
  routeId: string,
): NavigationSession => ({
  ...session,
  routeId,
  currentStepIndex: 0,
  state: 'navigating',
  lastPreAnnouncementStepId: null,
  lastApproachAnnouncementStepId: null,
  distanceToManeuverMeters: undefined,
  distanceToRouteMeters: undefined,
  remainingDistanceMeters: undefined,
  remainingDurationSeconds: undefined,
  rerouteEligible: false,
  offRouteSince: null,
});

export const recordRerouteAttempt = (
  session: NavigationSession,
  at = new Date().toISOString(),
): NavigationSession => ({
  ...session,
  lastRerouteAt: at,
  rerouteEligible: false,
  offRouteSince: null,
});

export const updateNavigationSessionProgress = (
  session: NavigationSession,
  sample: NavigationLocationSample,
  snapshot: NavigationProgressSnapshot,
  observedAt = new Date().toISOString(),
): NavigationSession => ({
  ...session,
  currentStepIndex: snapshot.currentStepIndex,
  lastKnownCoordinate: sample.coordinate,
  lastKnownHeading: sample.heading ?? null,
  lastKnownSpeedMetersPerSecond: sample.speedMetersPerSecond ?? null,
  lastLocationAccuracyMeters: sample.accuracyMeters ?? null,
  lastSnappedCoordinate: snapshot.snappedCoordinate ?? session.lastSnappedCoordinate,
  distanceToManeuverMeters: snapshot.distanceToManeuverMeters,
  distanceToRouteMeters: snapshot.distanceToRouteMeters,
  remainingDistanceMeters: snapshot.remainingDistanceMeters,
  remainingDurationSeconds: snapshot.remainingDurationSeconds,
  rerouteEligible: snapshot.isOffRoute,
  offRouteSince: snapshot.isOffRoute ? session.offRouteSince ?? observedAt : null,
});

export const advanceNavigationStep = (
  session: NavigationSession,
  totalSteps: number,
): NavigationSession => ({
  ...session,
  currentStepIndex:
    totalSteps <= 0
      ? 0
      : Math.min(session.currentStepIndex + 1, Math.max(totalSteps - 1, 0)),
  lastApproachAnnouncementStepId: null,
});

export const completeNavigationSession = (
  session: NavigationSession,
): NavigationSession => ({
  ...session,
  state: 'awaiting_feedback',
});

export const resetNavigationSession = (): NavigationSession => ({
  sessionId: generateSessionId(),
  routeId: '',
  state: 'idle',
  currentStepIndex: 0,
  isMuted: false,
  isFollowing: true,
  startedAt: new Date().toISOString(),
  lastApproachAnnouncementStepId: null,
  offRouteSince: null,
  lastRerouteAt: null,
  gpsBreadcrumbs: [],
});

export const getAppStateFromSession = (session: NavigationSession | null): AppState => {
  if (!session || session.state === 'idle') {
    return 'IDLE';
  }

  if (session.state === 'preview') {
    return 'ROUTE_PREVIEW';
  }

  if (session.state === 'awaiting_feedback') {
    return 'AWAITING_FEEDBACK';
  }

  return 'NAVIGATING';
};

/**
 * Determine if the user is off-route, accounting for GPS accuracy.
 * The effective threshold is the base threshold + GPS accuracy (clamped to 50m).
 * This prevents false off-route triggers when GPS is inaccurate near buildings.
 */
export const isOffRoute = (
  distanceToRouteMeters: number,
  thresholdMeters = OFF_ROUTE_THRESHOLD_METERS,
  gpsAccuracyMeters = 0,
): boolean => {
  const accuracyBuffer = Math.min(gpsAccuracyMeters, 50); // clamp so bad GPS doesn't prevent all rerouting
  return distanceToRouteMeters > thresholdMeters + accuracyBuffer;
};

export const shouldPreAnnounce = (
  distanceToManeuverMeters: number,
  hasPreAnnounced: boolean,
): boolean =>
  !hasPreAnnounced &&
  distanceToManeuverMeters <= PRE_ANNOUNCEMENT_METERS &&
  distanceToManeuverMeters > APPROACH_ANNOUNCEMENT_METERS;

export const shouldAnnounceApproach = (
  distanceToManeuverMeters: number,
  hasAnnouncedApproach: boolean,
): boolean =>
  !hasAnnouncedApproach &&
  distanceToManeuverMeters <= APPROACH_ANNOUNCEMENT_METERS &&
  distanceToManeuverMeters > ARRIVAL_THRESHOLD_METERS;

export const hasArrived = (
  distanceToManeuverMeters: number,
  arrivalThresholdMeters = ARRIVAL_THRESHOLD_METERS,
): boolean => distanceToManeuverMeters <= arrivalThresholdMeters;

const getClampedStepIndex = (
  session: NavigationSession,
  totalSteps: number,
): number =>
  totalSteps <= 0
    ? 0
    : Math.min(Math.max(session.currentStepIndex, 0), Math.max(totalSteps - 1, 0));

/**
 * Given a segment index, return whichever of the two segment endpoints is closer
 * to the target coordinate. Used for step/maneuver tracking which works with
 * vertex indices on the decoded polyline.
 */
const pickCloserVertex = (
  segmentIndex: number,
  points: [number, number][],
  targetLatLon: [number, number],
): number => {
  const a = segmentIndex;
  const b = Math.min(segmentIndex + 1, points.length - 1);
  if (a === b) return a;
  const distA = haversineDistance(targetLatLon, [points[a][1], points[a][0]]);
  const distB = haversineDistance(targetLatLon, [points[b][1], points[b][0]]);
  return distB < distA ? b : a;
};

const getUpcomingStepIndex = (
  maneuverIndices: number[],
  closestPointIndex: number,
  totalSteps: number,
): number => {
  const nextIndex = maneuverIndices.findIndex((index) => index >= closestPointIndex);

  if (nextIndex !== -1) {
    return nextIndex;
  }

  return totalSteps <= 0 ? 0 : Math.max(totalSteps - 1, 0);
};

export const getNavigationProgress = (
  route: RouteOption,
  session: NavigationSession,
  location: Coordinate,
  gpsAccuracyMeters = 0,
): NavigationProgressSnapshot => {
  const routeCoordinates = decodePolyline(route.geometryPolyline6);

  // Guard: empty polyline means decode failed or route has no geometry.
  // Return a safe "off-route, no progress" snapshot instead of reporting
  // the user as on-route with 0 remaining distance.
  if (routeCoordinates.length === 0) {
    return {
      currentStepIndex: session.currentStepIndex,
      distanceToManeuverMeters: Infinity,
      distanceToRouteMeters: Infinity,
      remainingDistanceMeters: route.distanceMeters,
      remainingDurationSeconds: route.durationSeconds,
      snappedCoordinate: null,
      isOffRoute: true,
      shouldCompleteNavigation: false,
      shouldAdvanceStep: false,
      shouldPreAnnounce: false,
      shouldAnnounceApproach: false,
    };
  }

  const totalSteps = route.steps.length;
  const clampedStepIndex = getClampedStepIndex(session, totalSteps);

  // Segment-aware snap: projects onto the nearest line segment between vertices
  // instead of snapping to the nearest vertex. This gives the true perpendicular
  // distance to the route and prevents false off-route triggers on straight roads
  // where vertices can be 50-200m apart.
  const snapResult = closestPointOnPolyline(
    [location.lat, location.lon],
    routeCoordinates,
  );

  // Vertex index needed for step tracking and along-route distance calculations.
  // Pick the closer of the two segment endpoints to the user's position.
  // Note: this is an approximation — polylineSegmentDistance measures vertex-to-vertex,
  // so distanceToManeuver can be off by up to half a segment length on sparse polylines.
  // OSRM safety profiles typically produce vertices every 10-50m, keeping error small.
  const closestPointIndex = snapResult
    ? pickCloserVertex(snapResult.segmentIndex, routeCoordinates, [location.lat, location.lon])
    : findClosestPointIndex([location.lat, location.lon], routeCoordinates);

  const snappedCoordinate = snapResult
    ? { lat: snapResult.projectedPoint[0], lon: snapResult.projectedPoint[1] }
    : closestPointIndex >= 0
      ? {
          lat: routeCoordinates[closestPointIndex][1],
          lon: routeCoordinates[closestPointIndex][0],
        }
      : null;

  const distanceToRouteMeters = snapResult ? snapResult.distanceMeters : 0;
  const offRoute = isOffRoute(distanceToRouteMeters, OFF_ROUTE_THRESHOLD_METERS, gpsAccuracyMeters);

  const maneuverIndices = route.steps.map((step) =>
    findClosestPointIndex([step.maneuver.location[1], step.maneuver.location[0]], routeCoordinates),
  );

  // Detect if rider has passed the current maneuver on the polyline
  // (e.g., on a parallel street within 100m but past the turn point).
  // This handles the "missed turn" scenario where the rider never got
  // within 25m of the maneuver but has clearly passed it.
  // Guard: only trigger when the rider is close to the route (<30m).
  // When laterally offset (30-100m), closestPointIndex can snap past
  // the maneuver's index even though the rider hasn't reached it yet.
  const PASSED_MANEUVER_MAX_OFFSET_METERS = 30;
  const currentManeuverIndex = maneuverIndices[clampedStepIndex] ?? 0;
  const hasPassedCurrentManeuver =
    closestPointIndex > currentManeuverIndex &&
    distanceToRouteMeters < PASSED_MANEUVER_MAX_OFFSET_METERS;

  // Recalculate step index when:
  // 1. Off-route (>50m from route)
  // 2. Just returned from being off-route
  // 3. Reroute eligible
  // 4. Rider has passed the current maneuver on the polyline (missed turn)
  const shouldRecalcStep =
    offRoute || session.offRouteSince != null || session.rerouteEligible || hasPassedCurrentManeuver;
  const currentStepIndex = shouldRecalcStep
    ? getUpcomingStepIndex(maneuverIndices, closestPointIndex, totalSteps)
    : clampedStepIndex;
  const currentStep = route.steps[currentStepIndex] ?? null;

  if (!currentStep) {
    return {
      currentStepIndex,
      snappedCoordinate,
      distanceToRouteMeters,
      distanceToManeuverMeters: null,
      remainingDistanceMeters: 0,
      remainingDurationSeconds: 0,
      shouldPreAnnounce: false,
      shouldAnnounceApproach: false,
      shouldAdvanceStep: false,
      shouldCompleteNavigation: false,
      isOffRoute: offRoute,
    };
  }

  const currentManeuverPolylineIndex = maneuverIndices[currentStepIndex] ?? closestPointIndex;
  const distanceToManeuverMeters = polylineSegmentDistance(
    routeCoordinates,
    closestPointIndex,
    currentManeuverPolylineIndex,
  );
  const futureSteps = route.steps.slice(currentStepIndex + 1);

  // distanceToManeuverMeters is the remaining distance on the PREVIOUS step's
  // segment (from the user's position to the current step's maneuver).
  // The current step's distanceMeters covers the segment from the current
  // maneuver to the next maneuver — it must be included in the remaining total.
  const remainingDistanceMeters =
    distanceToManeuverMeters +
    currentStep.distanceMeters +
    futureSteps.reduce((total, step) => total + step.distanceMeters, 0);

  // Estimate time to reach the current maneuver using the previous step's pace
  const prevStep = currentStepIndex > 0 ? route.steps[currentStepIndex - 1] : null;
  const timeToManeuverSeconds =
    prevStep && prevStep.distanceMeters > 0
      ? Math.min(1, distanceToManeuverMeters / prevStep.distanceMeters) * prevStep.durationSeconds
      : 0;
  const remainingDurationSeconds =
    timeToManeuverSeconds +
    currentStep.durationSeconds +
    futureSteps.reduce((total, step) => total + step.durationSeconds, 0);
  const alreadyPreAnnounced = session.lastPreAnnouncementStepId === currentStep.id;
  const alreadyAnnouncedApproach = session.lastApproachAnnouncementStepId === currentStep.id;
  const arrivedAtManeuver = hasArrived(distanceToManeuverMeters);

  // Independent destination-distance check: closestPointIndex can snap past
  // the penultimate maneuver on a parallel street (the "missed turn" branch),
  // which advances currentStepIndex to the last step and zeroes
  // distanceToManeuverMeters even though the rider is meters from the actual
  // destination. Gating completion on physical haversine distance to the
  // route's last vertex prevents that premature completion.
  // GPS-accuracy buffer matches the off-route check direction so a fuzzy
  // GPS reading near the destination still resolves as arrived.
  const destinationCoord = routeCoordinates[routeCoordinates.length - 1];
  const distanceToDestinationMeters = haversineDistance(
    [location.lat, location.lon],
    [destinationCoord[1], destinationCoord[0]],
  );
  const reachedDestination =
    distanceToDestinationMeters <= ARRIVAL_THRESHOLD_METERS + gpsAccuracyMeters;
  const onLastStep = currentStepIndex >= totalSteps - 1;
  const completeNavigation = arrivedAtManeuver && onLastStep && reachedDestination;

  // When the rider is on the last step with closestPointIndex pinned to the
  // destination vertex (along-polyline distance = 0) but they're physically
  // still meters away from the destination, the polyline-derived
  // remainingDistanceMeters reads 0 — which is wrong on the FooterCard. Floor
  // it to the haversine remaining so the display matches reality.
  const displayedRemainingDistance =
    onLastStep && !reachedDestination
      ? Math.max(remainingDistanceMeters, distanceToDestinationMeters)
      : remainingDistanceMeters;

  return {
    currentStepIndex,
    snappedCoordinate,
    distanceToRouteMeters,
    distanceToManeuverMeters,
    remainingDistanceMeters: completeNavigation ? 0 : displayedRemainingDistance,
    remainingDurationSeconds: completeNavigation ? 0 : remainingDurationSeconds,
    shouldPreAnnounce: shouldPreAnnounce(distanceToManeuverMeters, alreadyPreAnnounced),
    shouldAnnounceApproach: shouldAnnounceApproach(
      distanceToManeuverMeters,
      alreadyAnnouncedApproach,
    ),
    shouldAdvanceStep: arrivedAtManeuver && !onLastStep,
    shouldCompleteNavigation: completeNavigation,
    isOffRoute: offRoute,
  };
};

export const shouldTriggerAutomaticReroute = (
  session: NavigationSession,
  now = Date.now(),
  offRouteDelayMs = AUTO_REROUTE_DELAY_MS,
  cooldownMs = REROUTE_COOLDOWN_MS,
): boolean => {
  if (!session.offRouteSince) {
    return false;
  }

  const offRouteSinceMs = Date.parse(session.offRouteSince);

  if (Number.isNaN(offRouteSinceMs) || now - offRouteSinceMs < offRouteDelayMs) {
    return false;
  }

  if (!session.lastRerouteAt) {
    return true;
  }

  const lastRerouteAtMs = Date.parse(session.lastRerouteAt);

  if (Number.isNaN(lastRerouteAtMs)) {
    return true;
  }

  return now - lastRerouteAtMs >= cooldownMs;
};

/**
 * Compute the remaining elevation gain from the current position to the end of the route.
 *
 * Uses the elevation profile (sampled array of elevations along the route) and maps
 * the user's progress (via remaining distance) to find the starting index, then sums
 * only the positive elevation deltas from that point forward.
 *
 * Returns 0 if the profile is empty or progress data is unavailable.
 */
export const computeRemainingClimb = (
  elevationProfile: readonly number[],
  totalDistanceMeters: number,
  remainingDistanceMeters: number,
): number => {
  if (elevationProfile.length < 2 || totalDistanceMeters <= 0) return 0;

  const progressRatio = Math.max(
    0,
    Math.min(1, 1 - remainingDistanceMeters / totalDistanceMeters),
  );
  const startIndex = Math.floor(progressRatio * (elevationProfile.length - 1));

  let climb = 0;
  for (let i = startIndex; i < elevationProfile.length - 1; i++) {
    const delta = elevationProfile[i + 1] - elevationProfile[i];
    if (delta > 0) climb += delta;
  }

  return Math.round(climb);
};

/**
 * Compute the remaining elevation loss (descent) from the current position to
 * the end of the route. Mirror of `computeRemainingClimb` — sums negative deltas.
 */
export const computeRemainingDescent = (
  elevationProfile: readonly number[],
  totalDistanceMeters: number,
  remainingDistanceMeters: number,
): number => {
  if (elevationProfile.length < 2 || totalDistanceMeters <= 0) return 0;

  const progressRatio = Math.max(
    0,
    Math.min(1, 1 - remainingDistanceMeters / totalDistanceMeters),
  );
  const startIndex = Math.floor(progressRatio * (elevationProfile.length - 1));

  let descent = 0;
  for (let i = startIndex; i < elevationProfile.length - 1; i++) {
    const delta = elevationProfile[i + 1] - elevationProfile[i];
    if (delta < 0) descent += Math.abs(delta);
  }

  return Math.round(descent);
};

/**
 * Compute the current road grade (%) at the rider's position on the route.
 *
 * Grade is calculated from the elevation profile by finding the segment the
 * rider is on and computing rise / run.  Positive = uphill, negative = downhill.
 *
 * Returns `null` when data is insufficient (profile too short, no progress, etc.).
 */
export const computeCurrentGrade = (
  elevationProfile: readonly number[],
  totalDistanceMeters: number,
  remainingDistanceMeters: number,
): number | null => {
  if (elevationProfile.length < 2 || totalDistanceMeters <= 0) return null;

  const progressRatio = Math.max(
    0,
    Math.min(1, 1 - remainingDistanceMeters / totalDistanceMeters),
  );

  const segments = elevationProfile.length - 1;
  const exactIndex = progressRatio * segments;
  const segmentIndex = Math.min(Math.floor(exactIndex), segments - 1);

  const segmentLengthMeters = totalDistanceMeters / segments;
  if (segmentLengthMeters <= 0) return null;

  const rise = elevationProfile[segmentIndex + 1] - elevationProfile[segmentIndex];
  const grade = (rise / segmentLengthMeters) * 100;

  return Math.round(grade * 10) / 10; // one decimal
};

/**
 * Sum the positive elevation deltas of the profile window between two route
 * fractions (0 = route start, 1 = route end). Generalizes
 * `computeRemainingClimb` (which always runs to the route end) so callers can
 * measure climb up to an intermediate point such as the next stop.
 */
export const climbBetweenFractions = (
  elevationProfile: readonly number[],
  startFraction: number,
  endFraction: number,
): number => {
  if (elevationProfile.length < 2) return 0;
  const segments = elevationProfile.length - 1;
  const start = Math.max(0, Math.min(1, startFraction));
  const end = Math.max(start, Math.min(1, endFraction));
  const startIndex = Math.floor(start * segments);
  const endIndex = Math.floor(end * segments);

  let climb = 0;
  for (let i = startIndex; i < endIndex; i++) {
    const delta = elevationProfile[i + 1] - elevationProfile[i];
    if (delta > 0) climb += delta;
  }
  return Math.round(climb);
};

export interface NextStopProgress {
  /** 1-based label of the stop the rider is heading to ("Stop {stopIndex} of {stopCount}"). 0 when none. */
  readonly stopIndex: number;
  /** Total intermediate stops on the route (0 when none). */
  readonly stopCount: number;
  /** True when at least one intermediate stop is still ahead of the rider. */
  readonly hasNextStop: boolean;
  /**
   * Index of the next stop inside the original `waypoints` array, or null when
   * none remain ahead. The "skip stop" action removes exactly this index so the
   * displayed next stop and the skipped stop never disagree.
   */
  readonly nextWaypointIndex: number | null;
  /** Along-route distance to the next stop in meters (0 when no stop ahead). */
  readonly distanceToNextStopMeters: number;
  /** Pace-scaled seconds to the next stop (0 when no stop ahead). */
  readonly durationToNextStopSeconds: number;
  /** Positive elevation gain between the rider and the next stop (0 when no stop ahead). */
  readonly climbToNextStopMeters: number;
}

const EMPTY_NEXT_STOP = (stopCount: number, stopIndex: number): NextStopProgress => ({
  stopIndex,
  stopCount,
  hasNextStop: false,
  nextWaypointIndex: null,
  distanceToNextStopMeters: 0,
  durationToNextStopSeconds: 0,
  climbToNextStopMeters: 0,
});

/** Along-route distance from the route start to a snapped point (full segments + partial). */
const alongRouteDistanceToSnap = (
  routeCoordinates: readonly [number, number][],
  snap: PolylineSnapResult,
): number => {
  const fullSegments = polylineSegmentDistance(routeCoordinates, 0, snap.segmentIndex);
  const vertex = routeCoordinates[snap.segmentIndex];
  if (!vertex) return fullSegments;
  // vertex is [lon, lat]; haversine + projectedPoint expect [lat, lon].
  const partial = haversineDistance([vertex[1], vertex[0]], snap.projectedPoint);
  return fullSegments + partial;
};

/**
 * Compute distance / ETA / climb from the rider to the NEXT intermediate stop
 * (rather than the final destination). Pure + client-derivable: leg boundaries
 * are inferred from the route geometry + waypoints, so no engine `legs` data is
 * required. "Passed" semantics match `stripPassedWaypoints` (the reroute path),
 * so the next stop shown here is the same one a reroute would keep.
 *
 * Returns `hasNextStop: false` (and zeroed metrics) when there are no stops or
 * none remain ahead — callers should fall back to their to-destination totals.
 *
 * @param routeCoordinates decoded route geometry as [lon, lat] (GeoJSON order)
 */
export const computeNextStopProgress = (
  route: Pick<RouteOption, 'distanceMeters' | 'durationSeconds' | 'elevationProfile'>,
  routeCoordinates: readonly [number, number][],
  waypoints: readonly Coordinate[],
  location: Coordinate,
): NextStopProgress => {
  const stopCount = waypoints.length;
  if (stopCount === 0 || routeCoordinates.length < 2) return EMPTY_NEXT_STOP(stopCount, 0);

  const riderSnap = closestPointOnPolyline([location.lat, location.lon], routeCoordinates);
  if (!riderSnap) return EMPTY_NEXT_STOP(stopCount, 0);

  const riderIndex = findClosestPointIndex(
    [location.lat, location.lon],
    routeCoordinates as [number, number][],
  );

  // First waypoint still ahead of the rider (mirror of stripPassedWaypoints).
  let nextWaypointIndex = -1;
  for (let i = 0; i < waypoints.length; i++) {
    const wpIndex = findClosestPointIndex(
      [waypoints[i].lat, waypoints[i].lon],
      routeCoordinates as [number, number][],
    );
    if (wpIndex > riderIndex) {
      nextWaypointIndex = i;
      break;
    }
  }

  // All stops passed → heading to the destination; keep stopCount for context.
  if (nextWaypointIndex === -1) return EMPTY_NEXT_STOP(stopCount, stopCount);

  const wp = waypoints[nextWaypointIndex];
  const wpSnap = closestPointOnPolyline([wp.lat, wp.lon], routeCoordinates);

  const riderAlong = alongRouteDistanceToSnap(routeCoordinates, riderSnap);
  const wpAlong = wpSnap ? alongRouteDistanceToSnap(routeCoordinates, wpSnap) : riderAlong;
  const distanceToNextStopMeters = Math.max(0, wpAlong - riderAlong);

  const pace =
    route.distanceMeters > 0 ? route.durationSeconds / route.distanceMeters : 0;
  const durationToNextStopSeconds = Math.round(distanceToNextStopMeters * pace);

  const profile = route.elevationProfile ?? [];
  const climbToNextStopMeters =
    route.distanceMeters > 0 && profile.length >= 2
      ? climbBetweenFractions(
          profile,
          riderAlong / route.distanceMeters,
          wpAlong / route.distanceMeters,
        )
      : 0;

  return {
    stopIndex: nextWaypointIndex + 1,
    stopCount,
    hasNextStop: true,
    nextWaypointIndex,
    distanceToNextStopMeters,
    durationToNextStopSeconds,
    climbToNextStopMeters,
  };
};
