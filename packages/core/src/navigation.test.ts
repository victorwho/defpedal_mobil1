import { describe, expect, it } from 'vitest';

import {
  AUTO_REROUTE_DELAY_MS,
  advanceNavigationStep,
  createNavigationSession,
  encodePolyline,
  getNavigationProgress,
  hasArrived,
  isOffRoute,
  recordRerouteAttempt,
  shouldTriggerAutomaticReroute,
  shouldAnnounceApproach,
  updateNavigationSessionProgress,
} from './index';

describe('navigation helpers', () => {
  it('creates a session ready for navigation', () => {
    const session = createNavigationSession('route-1', '2026-03-14T00:00:00.000Z');

    expect(session.routeId).toBe('route-1');
    expect(session.state).toBe('navigating');
    expect(session.currentStepIndex).toBe(0);
    expect(session.isFollowing).toBe(true);
  });

  it('caps the current step at the last known step', () => {
    const session = createNavigationSession('route-1');
    const advanced = advanceNavigationStep(
      {
        ...session,
        currentStepIndex: 3,
      },
      4,
    );

    expect(advanced.currentStepIndex).toBe(3);
  });

  it('flags off-route states using the shared threshold', () => {
    // OFF_ROUTE_THRESHOLD_METERS is 100 — values above it are off-route
    expect(isOffRoute(101)).toBe(true);
    expect(isOffRoute(100)).toBe(false);
    expect(isOffRoute(60)).toBe(false);
    expect(isOffRoute(20)).toBe(false);
  });

  it('uses the same approach and arrival thresholds for all clients', () => {
    expect(shouldAnnounceApproach(40, false)).toBe(true);
    expect(shouldAnnounceApproach(20, false)).toBe(false);
    expect(hasArrived(10)).toBe(true);
  });

  it('derives live navigation progress from the rider position and route geometry', () => {
    const geometryPolyline6 = encodePolyline([
      [26.1025, 44.4268],
      [26.0989, 44.4301],
      [26.0946, 44.4378],
    ]);
    const route = {
      id: 'safe-1',
      source: 'custom_osrm' as const,
      routingEngineVersion: 'safe-osrm-v1',
      routingProfileVersion: 'safety-profile-v1',
      mapDataVersion: 'osm-europe-current',
      riskModelVersion: 'risk-model-v1',
      geometryPolyline6,
      distanceMeters: 1200,
      durationSeconds: 420,
      adjustedDurationSeconds: 450,
      totalClimbMeters: 24,
      riskSegments: [],
      warnings: [],
      steps: [
        {
          id: 'step-1',
          instruction: 'Head north',
          streetName: 'Start Street',
          distanceMeters: 420,
          durationSeconds: 120,
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [26.1025, 44.4268] as [number, number],
            type: 'depart',
          },
          mode: 'cycling',
        },
        {
          id: 'step-2',
          instruction: 'Turn left',
          streetName: 'Finish Street',
          distanceMeters: 780,
          durationSeconds: 300,
          maneuver: {
            bearing_after: 280,
            bearing_before: 12,
            location: [26.0946, 44.4378] as [number, number],
            type: 'turn',
            modifier: 'left',
          },
          mode: 'cycling',
        },
      ],
    };
    const session = {
      ...createNavigationSession(route.id),
      currentStepIndex: 1,
    };

    const progress = getNavigationProgress(route, session, {
      lat: 44.4378,
      lon: 26.0946,
    });

    expect(progress.distanceToRouteMeters).toBeLessThan(20);
    expect(progress.shouldAdvanceStep || progress.shouldCompleteNavigation).toBe(true);
    expect(progress.remainingDistanceMeters).toBeGreaterThanOrEqual(0);
  });

  it('includes current step distance in remaining totals (off-by-one fix)', () => {
    // A 3-step route with a clear intermediate segment.
    // Points are spaced ~111m apart along longitude at ~44.43°N.
    const geometryPolyline6 = encodePolyline([
      [26.1000, 44.4300], // index 0 — depart
      [26.1010, 44.4300], // index 1
      [26.1020, 44.4300], // index 2 — turn (step-2 maneuver)
      [26.1030, 44.4300], // index 3
      [26.1040, 44.4300], // index 4 — arrive (step-3 maneuver)
    ]);
    const route = {
      id: 'remaining-dist-test',
      source: 'custom_osrm' as const,
      routingEngineVersion: 'safe-osrm-v1',
      routingProfileVersion: 'safety-profile-v1',
      mapDataVersion: 'osm-europe-current',
      riskModelVersion: 'risk-model-v1',
      geometryPolyline6,
      distanceMeters: 320,
      durationSeconds: 120,
      adjustedDurationSeconds: 120,
      totalClimbMeters: 0,
      riskSegments: [],
      warnings: [],
      steps: [
        {
          id: 'step-1',
          instruction: 'Head east',
          streetName: 'Main Street',
          distanceMeters: 160, // depart → turn
          durationSeconds: 60,
          maneuver: {
            bearing_after: 90,
            bearing_before: 0,
            location: [26.1000, 44.4300] as [number, number],
            type: 'depart',
          },
          mode: 'cycling',
        },
        {
          id: 'step-2',
          instruction: 'Continue east',
          streetName: 'Main Street',
          distanceMeters: 160, // turn → arrive
          durationSeconds: 60,
          maneuver: {
            bearing_after: 90,
            bearing_before: 90,
            location: [26.1020, 44.4300] as [number, number],
            type: 'new name',
          },
          mode: 'cycling',
        },
        {
          id: 'step-3',
          instruction: 'Arrive',
          streetName: 'Main Street',
          distanceMeters: 0,
          durationSeconds: 0,
          maneuver: {
            bearing_after: 0,
            bearing_before: 90,
            location: [26.1040, 44.4300] as [number, number],
            type: 'arrive',
          },
          mode: 'cycling',
        },
      ],
    };

    // User is near the start, approaching step-2's maneuver (the turn).
    // currentStepIndex = 1 means step-2 is the step being approached.
    const session = {
      ...createNavigationSession(route.id),
      currentStepIndex: 1,
    };
    const progress = getNavigationProgress(route, session, {
      lat: 44.4300,
      lon: 26.1005, // near index 0-1, ~40m into the route
    });

    // distanceToManeuver = distance to step-2's maneuver at index 2
    // (remaining portion of step-1's segment). ~120m.
    expect(progress.distanceToManeuverMeters).toBeGreaterThan(80);
    expect(progress.distanceToManeuverMeters).toBeLessThan(200);

    // Remaining distance MUST include the current step's distance (step-2 = 160m)
    // plus step-3 (0m), on top of distanceToManeuver.
    // Without the fix, step-2's 160m was omitted, making remaining ≈ 120m instead of ≈ 280m.
    const expectedMin = progress.distanceToManeuverMeters! + 160; // + step-2 dist
    expect(progress.remainingDistanceMeters).toBeGreaterThanOrEqual(expectedMin - 5);

    // Duration should also include step-2's full duration (60s).
    expect(progress.remainingDurationSeconds).toBeGreaterThanOrEqual(60);
  });

  it('remaining distance decreases monotonically across step advance', () => {
    // Verify no upward jump when advancing from step 1 → step 2.
    const geometryPolyline6 = encodePolyline([
      [26.1000, 44.4300], // 0 — depart
      [26.1010, 44.4300], // 1
      [26.1020, 44.4300], // 2 — step-2 maneuver
      [26.1030, 44.4300], // 3
      [26.1040, 44.4300], // 4 — arrive
    ]);
    const route = {
      id: 'monotonic-test',
      source: 'custom_osrm' as const,
      routingEngineVersion: 'v1',
      routingProfileVersion: 'v1',
      mapDataVersion: 'v1',
      riskModelVersion: 'v1',
      geometryPolyline6,
      distanceMeters: 320,
      durationSeconds: 120,
      adjustedDurationSeconds: 120,
      totalClimbMeters: 0,
      riskSegments: [],
      warnings: [],
      steps: [
        {
          id: 's1', instruction: 'Depart', streetName: 'A',
          distanceMeters: 160, durationSeconds: 60,
          maneuver: { bearing_after: 90, bearing_before: 0, location: [26.1000, 44.4300] as [number, number], type: 'depart' },
          mode: 'cycling',
        },
        {
          id: 's2', instruction: 'Continue', streetName: 'A',
          distanceMeters: 160, durationSeconds: 60,
          maneuver: { bearing_after: 90, bearing_before: 90, location: [26.1020, 44.4300] as [number, number], type: 'new name' },
          mode: 'cycling',
        },
        {
          id: 's3', instruction: 'Arrive', streetName: 'A',
          distanceMeters: 0, durationSeconds: 0,
          maneuver: { bearing_after: 0, bearing_before: 90, location: [26.1040, 44.4300] as [number, number], type: 'arrive' },
          mode: 'cycling',
        },
      ],
    };

    // Just before step advance: user near step-2's maneuver, currentStepIndex = 1
    const beforeSession = { ...createNavigationSession(route.id), currentStepIndex: 1 };
    const beforeProgress = getNavigationProgress(route, beforeSession, {
      lat: 44.4300, lon: 26.10195, // ~5m before the turn
    });

    // Just after step advance: user slightly past, currentStepIndex = 2
    const afterSession = { ...createNavigationSession(route.id), currentStepIndex: 2 };
    const afterProgress = getNavigationProgress(route, afterSession, {
      lat: 44.4300, lon: 26.10205, // ~5m past the turn
    });

    // Remaining distance should NOT jump upward across the advance
    expect(afterProgress.remainingDistanceMeters).toBeLessThanOrEqual(
      beforeProgress.remainingDistanceMeters + 5, // small tolerance for GPS snap
    );
  });

  it('does not advance step when rider is laterally offset >30m from route (prevents false maneuver-passed)', () => {
    // Scenario: Rider is on a parallel street ~50m north of the route.
    // closestPointIndex may snap past the maneuver, but the lateral offset
    // (>30m) means the rider hasn't actually reached the turn — don't advance.
    const geometryPolyline6 = encodePolyline([
      [26.1000, 44.4300], // Start (depart)
      [26.1010, 44.4300], // ~80m east
      [26.1020, 44.4300], // ~160m east - turn point (step-2)
      [26.1020, 44.4310], // After turn, heading north
      [26.1020, 44.4320], // End (arrive)
    ]);
    const route = {
      id: 'parallel-street-test',
      source: 'custom_osrm' as const,
      routingEngineVersion: 'safe-osrm-v1',
      routingProfileVersion: 'safety-profile-v1',
      mapDataVersion: 'osm-europe-current',
      riskModelVersion: 'risk-model-v1',
      geometryPolyline6,
      distanceMeters: 400,
      durationSeconds: 120,
      adjustedDurationSeconds: 120,
      totalClimbMeters: 0,
      riskSegments: [],
      warnings: [],
      steps: [
        {
          id: 'step-1',
          instruction: 'Head east',
          streetName: 'Main Street',
          distanceMeters: 160,
          durationSeconds: 40,
          maneuver: {
            bearing_after: 90,
            bearing_before: 0,
            location: [26.1000, 44.4300] as [number, number],
            type: 'depart',
          },
          mode: 'cycling',
        },
        {
          id: 'step-2',
          instruction: 'Turn left onto North Street',
          streetName: 'North Street',
          distanceMeters: 120,
          durationSeconds: 40,
          maneuver: {
            bearing_after: 0,
            bearing_before: 90,
            location: [26.1020, 44.4300] as [number, number], // Turn at lon 26.1020
            type: 'turn',
            modifier: 'left',
          },
          mode: 'cycling',
        },
        {
          id: 'step-3',
          instruction: 'Arrive at destination',
          streetName: 'North Street',
          distanceMeters: 120,
          durationSeconds: 40,
          maneuver: {
            bearing_after: 0,
            bearing_before: 0,
            location: [26.1020, 44.4320] as [number, number],
            type: 'arrive',
          },
          mode: 'cycling',
        },
      ],
    };

    // Session is at step-1 (heading east, about to turn left at step-2)
    const session = {
      ...createNavigationSession(route.id),
      currentStepIndex: 0,
    };

    // Rider is on a parallel street ~50m north of the main route,
    // and has passed the turn point (lon 26.1025 > turn at 26.1020).
    // At lat 44.4300, 0.0005 degrees lon ≈ 40m, so rider at 44.43045 is ~50m north
    // They're within 100m of the route so not "off-route", but have passed the maneuver.
    const riderLocation = {
      lat: 44.43045, // ~50m north of route (parallel street)
      lon: 26.1025, // Past the turn point at 26.1020
    };

    const progress = getNavigationProgress(route, session, riderLocation);

    // Step should NOT advance — rider is ~50m off the route laterally.
    // The 30m guard prevents hasPassedCurrentManeuver from firing on lateral GPS offset.
    expect(progress.currentStepIndex).toBe(0);
    // Should not be marked as off-route since within 100m
    expect(progress.isOffRoute).toBe(false);
  });

  it('marks off-route time and reroute cooldown in the shared session state', () => {
    const session = createNavigationSession('route-1');
    const updated = updateNavigationSessionProgress(
      session,
      {
        coordinate: {
          lat: 44.4268,
          lon: 26.1025,
        },
        timestamp: 1710400000000,
      },
      {
        currentStepIndex: 0,
        snappedCoordinate: {
          lat: 44.4269,
          lon: 26.1024,
        },
        distanceToRouteMeters: 85,
        distanceToManeuverMeters: 120,
        remainingDistanceMeters: 900,
        remainingDurationSeconds: 300,
        shouldAnnounceApproach: false,
        shouldAdvanceStep: false,
        shouldCompleteNavigation: false,
        isOffRoute: true,
      },
      '2026-03-14T10:00:00.000Z',
    );

    expect(updated.offRouteSince).toBe('2026-03-14T10:00:00.000Z');
    expect(
      shouldTriggerAutomaticReroute(
        updated,
        Date.parse('2026-03-14T10:00:00.000Z') + AUTO_REROUTE_DELAY_MS + 1,
      ),
    ).toBe(true);

    const rerouted = recordRerouteAttempt(updated, '2026-03-14T10:01:00.000Z');
    expect(rerouted.lastRerouteAt).toBe('2026-03-14T10:01:00.000Z');
    expect(shouldTriggerAutomaticReroute(rerouted, Date.parse('2026-03-14T10:01:10.000Z'))).toBe(
      false,
    );
  });
});
