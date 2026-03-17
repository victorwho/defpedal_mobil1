import type {
  Coordinate,
  NavigationLocationSample,
  NavigationSession,
  RouteOption,
} from './contracts';
import { findClosestPointIndex, haversineDistance } from './distance';
import { decodePolyline } from './polyline';

export type AppState = 'IDLE' | 'ROUTE_PREVIEW' | 'NAVIGATING' | 'AWAITING_FEEDBACK';

export const OFF_ROUTE_THRESHOLD_METERS = 50;
export const APPROACH_ANNOUNCEMENT_METERS = 50;
export const ARRIVAL_THRESHOLD_METERS = 25;
export const AUTO_REROUTE_DELAY_MS = 60000;
export const REROUTE_COOLDOWN_MS = 60000;

export interface NavigationProgressSnapshot {
  currentStepIndex: number;
  snappedCoordinate: Coordinate | null;
  distanceToRouteMeters: number;
  distanceToManeuverMeters: number | null;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
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

export const isOffRoute = (
  distanceToRouteMeters: number,
  thresholdMeters = OFF_ROUTE_THRESHOLD_METERS,
): boolean => distanceToRouteMeters > thresholdMeters;

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
): boolean => distanceToManeuverMeters < arrivalThresholdMeters;

const getClampedStepIndex = (
  session: NavigationSession,
  totalSteps: number,
): number =>
  totalSteps <= 0
    ? 0
    : Math.min(Math.max(session.currentStepIndex, 0), Math.max(totalSteps - 1, 0));

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
): NavigationProgressSnapshot => {
  const routeCoordinates = decodePolyline(route.geometryPolyline6);
  const totalSteps = route.steps.length;
  const clampedStepIndex = getClampedStepIndex(session, totalSteps);
  const closestPointIndex = findClosestPointIndex(
    [location.lat, location.lon],
    routeCoordinates,
  );

  const snappedCoordinate =
    closestPointIndex >= 0
      ? {
          lat: routeCoordinates[closestPointIndex][1],
          lon: routeCoordinates[closestPointIndex][0],
        }
      : null;

  const distanceToRouteMeters = snappedCoordinate
    ? haversineDistance(
        [location.lat, location.lon],
        [snappedCoordinate.lat, snappedCoordinate.lon],
      )
    : 0;
  const offRoute = isOffRoute(distanceToRouteMeters);

  const maneuverIndices = route.steps.map((step) =>
    findClosestPointIndex([step.maneuver.location[1], step.maneuver.location[0]], routeCoordinates),
  );

  const currentStepIndex =
    !offRoute && (session.offRouteSince || session.rerouteEligible)
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
      shouldAnnounceApproach: false,
      shouldAdvanceStep: false,
      shouldCompleteNavigation: false,
      isOffRoute: offRoute,
    };
  }

  const maneuverCoordinate: [number, number] = [
    currentStep.maneuver.location[1],
    currentStep.maneuver.location[0],
  ];
  const distanceToManeuverMeters = haversineDistance(
    [location.lat, location.lon],
    maneuverCoordinate,
  );
  const futureSteps = route.steps.slice(currentStepIndex + 1);
  const progressThroughStep =
    currentStep.distanceMeters > 0
      ? 1 - distanceToManeuverMeters / currentStep.distanceMeters
      : 0;
  const clampedProgress = Math.max(0, Math.min(1, progressThroughStep));
  const remainingDistanceMeters =
    distanceToManeuverMeters +
    futureSteps.reduce((total, step) => total + step.distanceMeters, 0);
  const remainingDurationSeconds =
    currentStep.durationSeconds * (1 - clampedProgress) +
    futureSteps.reduce((total, step) => total + step.durationSeconds, 0);
  const alreadyAnnouncedApproach = session.lastApproachAnnouncementStepId === currentStep.id;
  const arrivedAtManeuver = hasArrived(distanceToManeuverMeters);

  return {
    currentStepIndex,
    snappedCoordinate,
    distanceToRouteMeters,
    distanceToManeuverMeters,
    remainingDistanceMeters: arrivedAtManeuver && currentStepIndex >= totalSteps - 1 ? 0 : remainingDistanceMeters,
    remainingDurationSeconds:
      arrivedAtManeuver && currentStepIndex >= totalSteps - 1 ? 0 : remainingDurationSeconds,
    shouldAnnounceApproach: shouldAnnounceApproach(
      distanceToManeuverMeters,
      alreadyAnnouncedApproach,
    ),
    shouldAdvanceStep: arrivedAtManeuver && currentStepIndex < totalSteps - 1,
    shouldCompleteNavigation: arrivedAtManeuver && currentStepIndex >= totalSteps - 1,
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
