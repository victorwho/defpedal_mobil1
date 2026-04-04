import { describe, expect, it } from 'vitest';

import {
  createNavigationSession,
  encodePolyline,
  getNavigationProgress,
  syncSessionToRoute,
  updateNavigationSessionProgress,
} from './index';

/**
 * Diagnostic tests for stale navigation metrics after off-route / reroute.
 *
 * Bug: distance, ETA, remaining climb, and instructions freeze after the
 * user goes off-route, misses the route start, or rerouting succeeds.
 */

// ── Shared test route ──

const buildTestRoute = () => {
  const geometryPolyline6 = encodePolyline([
    [26.1025, 44.4268], // A — start
    [26.1000, 44.4300], // B — mid
    [26.0946, 44.4378], // C — turn maneuver
    [26.0900, 44.4400], // D — end
  ]);

  return {
    id: 'route-test',
    source: 'custom_osrm' as const,
    routingEngineVersion: 'v1',
    routingProfileVersion: 'v1',
    mapDataVersion: 'v1',
    riskModelVersion: 'v1',
    geometryPolyline6,
    distanceMeters: 2000,
    durationSeconds: 600,
    adjustedDurationSeconds: 600,
    totalClimbMeters: 15,
    riskSegments: [],
    warnings: [],
    steps: [
      {
        id: 'step-1',
        instruction: 'Head north on Start Street',
        streetName: 'Start Street',
        distanceMeters: 1200,
        durationSeconds: 360,
        maneuver: {
          bearing_after: 0,
          bearing_before: 0,
          location: [26.0946, 44.4378] as [number, number],
          type: 'turn',
          modifier: 'left',
        },
        mode: 'cycling',
      },
      {
        id: 'step-2',
        instruction: 'Turn left on Finish Street',
        streetName: 'Finish Street',
        distanceMeters: 800,
        durationSeconds: 240,
        maneuver: {
          bearing_after: 270,
          bearing_before: 0,
          location: [26.0900, 44.4400] as [number, number],
          type: 'arrive',
        },
        mode: 'cycling',
      },
    ],
  };
};

describe('navigation metrics after off-route', () => {
  it('recalculates remaining distance when user drifts off-route', () => {
    const route = buildTestRoute();
    const session = createNavigationSession(route.id);

    // On-route location near start
    const onRoute = getNavigationProgress(route, session, {
      lat: 44.4300,
      lon: 26.1000,
    });
    expect(onRoute.isOffRoute).toBe(false);
    const initialRemaining = onRoute.remainingDistanceMeters;

    // Off-route location: 500m east of the route
    const offRoute = getNavigationProgress(route, session, {
      lat: 44.4300,
      lon: 26.1080,
    });
    expect(offRoute.isOffRoute).toBe(true);
    // Remaining distance MUST still update (not freeze at initialRemaining)
    expect(offRoute.remainingDistanceMeters).not.toBe(initialRemaining);
    expect(offRoute.remainingDistanceMeters).toBeGreaterThan(0);
    expect(offRoute.remainingDurationSeconds).toBeGreaterThan(0);
  });

  it('resumes correct step index after returning on-route from off-route', () => {
    const route = buildTestRoute();
    let session = createNavigationSession(route.id);

    // Simulate off-route state in session
    session = {
      ...session,
      offRouteSince: new Date().toISOString(),
      rerouteEligible: true,
      currentStepIndex: 0,
    };

    // User returns to the route near the second maneuver (step 2)
    const progress = getNavigationProgress(route, session, {
      lat: 44.4400,
      lon: 26.0900,
    });

    expect(progress.isOffRoute).toBe(false);
    // Should detect that we're near step-2 maneuver, not stuck on step 0
    expect(progress.currentStepIndex).toBe(1);
  });
});

describe('navigation metrics after reroute', () => {
  it('syncSessionToRoute resets all stale metric fields', () => {
    const session = createNavigationSession('old-route');
    const stale = {
      ...session,
      currentStepIndex: 3,
      distanceToManeuverMeters: 42,
      distanceToRouteMeters: 5,
      remainingDistanceMeters: 1500,
      remainingDurationSeconds: 450,
      rerouteEligible: true,
      offRouteSince: '2026-04-04T10:00:00Z',
      lastApproachAnnouncementStepId: 'step-old',
      lastPreAnnouncementStepId: 'step-old',
    };

    const synced = syncSessionToRoute(stale, 'new-route');

    expect(synced.routeId).toBe('new-route');
    expect(synced.currentStepIndex).toBe(0);
    expect(synced.state).toBe('navigating');
    expect(synced.distanceToManeuverMeters).toBeUndefined();
    expect(synced.distanceToRouteMeters).toBeUndefined();
    expect(synced.remainingDistanceMeters).toBeUndefined();
    expect(synced.remainingDurationSeconds).toBeUndefined();
    expect(synced.rerouteEligible).toBe(false);
    expect(synced.offRouteSince).toBeNull();
    expect(synced.lastApproachAnnouncementStepId).toBeNull();
    expect(synced.lastPreAnnouncementStepId).toBeNull();
  });

  it('computes fresh metrics on the new route after reroute sync', () => {
    const newRoute = buildTestRoute();
    const synced = syncSessionToRoute(
      createNavigationSession('old-route'),
      newRoute.id,
    );

    // User position is near the start of the new route
    const progress = getNavigationProgress(newRoute, synced, {
      lat: 44.4268,
      lon: 26.1025,
    });

    expect(progress.currentStepIndex).toBe(0);
    expect(progress.remainingDistanceMeters).toBeGreaterThan(0);
    expect(progress.remainingDurationSeconds).toBeGreaterThan(0);
    expect(progress.isOffRoute).toBe(false);
  });
});

describe('navigation metrics when user misses route start', () => {
  it('computes valid metrics when user is far from route start', () => {
    const route = buildTestRoute();
    const session = createNavigationSession(route.id);

    // User is 2km south of the route start
    const progress = getNavigationProgress(route, session, {
      lat: 44.4100,
      lon: 26.1025,
    });

    // Should still compute meaningful distance (not 0 or NaN)
    expect(progress.remainingDistanceMeters).toBeGreaterThan(0);
    expect(progress.remainingDurationSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(progress.remainingDistanceMeters)).toBe(true);
    expect(Number.isFinite(progress.remainingDurationSeconds)).toBe(true);
  });
});
