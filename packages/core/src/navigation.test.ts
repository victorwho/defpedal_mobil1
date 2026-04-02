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
