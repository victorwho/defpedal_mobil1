import type { RouteOption, RoutePreviewResponse } from '@defensivepedal/core';
import { afterEach, describe, expect, it } from 'vitest';

import { useAppStore } from './appStore';

const createRoute = (id: string): RouteOption => ({
  id,
  source: 'custom_osrm',
  routingEngineVersion: 'safe-osrm-v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'osm-europe-current',
  riskModelVersion: 'risk-model-v1',
  geometryPolyline6: '_o~iF~ps|U_ulLnnqC_mqNvxq`@',
  distanceMeters: 1200,
  durationSeconds: 420,
  adjustedDurationSeconds: 450,
  totalClimbMeters: 24,
  steps: [],
  riskSegments: [],
  warnings: [],
});

const createPreviewResponse = (routes: RouteOption[]): RoutePreviewResponse => ({
  routes,
  selectedMode: 'safe',
  coverage: {
    countryCode: 'RO',
    status: 'supported',
    safeRouting: true,
    fastRouting: true,
  },
  generatedAt: new Date().toISOString(),
});

afterEach(() => {
  useAppStore.getState().resetFlow();
  useAppStore.setState({
    queuedMutations: [],
    offlineRegions: [],
    tripServerIds: {},
    activeTripClientId: null,
    recentDestinations: [],
    pendingBadgeUnlocks: [],
    earnedMilestones: [],
    bikeType: null,
    cyclingFrequency: null,
    avoidUnpaved: false,
    voiceGuidanceEnabled: false,
    themePreference: 'dark',
    showBicycleLanes: true,
    poiVisibility: {
      hydration: false,
      repair: false,
      restroom: false,
      bikeRental: false,
      bikeParking: false,
      supplies: false,
    },
    notifyWeather: true,
    notifyHazard: true,
    notifyCommunity: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    locale: 'en',
    onboardingCompleted: false,
    ratingSkipCount: 0,
    anonymousOpenCount: 0,
    showRouteComparison: true,
    shareTripsPublicly: true,
    cachedStreak: null,
    cachedImpact: null,
    cyclingGoal: null,
  });
  useAppStore.persist.clearStorage();
});

describe('useAppStore', () => {
  // =========================================================================
  // Initial State
  // =========================================================================

  describe('initial state', () => {
    it('starts in IDLE state', () => {
      expect(useAppStore.getState().appState).toBe('IDLE');
    });

    it('has null route preview', () => {
      expect(useAppStore.getState().routePreview).toBeNull();
    });

    it('has a reset navigation session after resetFlow', () => {
      // After resetFlow, navigationSession is a reset session object (not null)
      // because resetNavigationSession() returns an idle session object
      const session = useAppStore.getState().navigationSession;
      if (session !== null) {
        expect(session.state).toBe('idle');
      }
    });

    it('has empty queued mutations', () => {
      expect(useAppStore.getState().queuedMutations).toEqual([]);
    });

    it('has default route request with 0,0 coordinates', () => {
      const req = useAppStore.getState().routeRequest;
      expect(req.origin).toEqual({ lat: 0, lon: 0 });
      expect(req.destination).toEqual({ lat: 0, lon: 0 });
      expect(req.mode).toBe('safe');
    });

    it('has voice guidance disabled by default', () => {
      expect(useAppStore.getState().voiceGuidanceEnabled).toBe(false);
    });

    it('has dark theme preference by default', () => {
      expect(useAppStore.getState().themePreference).toBe('dark');
    });

    it('has empty recent destinations', () => {
      expect(useAppStore.getState().recentDestinations).toEqual([]);
    });

    it('has empty pending badge unlocks', () => {
      expect(useAppStore.getState().pendingBadgeUnlocks).toEqual([]);
    });

    it('has default POI visibility (all off)', () => {
      const poi = useAppStore.getState().poiVisibility;
      expect(poi.hydration).toBe(false);
      expect(poi.repair).toBe(false);
      expect(poi.restroom).toBe(false);
      expect(poi.bikeRental).toBe(false);
      expect(poi.bikeParking).toBe(false);
      expect(poi.supplies).toBe(false);
    });
  });

  // =========================================================================
  // Route Lifecycle
  // =========================================================================

  describe('route lifecycle', () => {
    it('preserves the selected route when a fresh preview contains the same route id', () => {
      const firstPreview = createPreviewResponse([createRoute('safe-1'), createRoute('safe-2')]);
      const refreshedPreview = createPreviewResponse([createRoute('safe-2'), createRoute('safe-3')]);

      useAppStore.getState().setRoutePreview(firstPreview);
      useAppStore.getState().setSelectedRouteId('safe-2');
      useAppStore.getState().setRoutePreview(refreshedPreview);

      expect(useAppStore.getState().selectedRouteId).toBe('safe-2');
      expect(useAppStore.getState().routePreview?.routes).toHaveLength(2);
    });

    it('falls back to the first route when the selected route disappears', () => {
      const firstPreview = createPreviewResponse([createRoute('safe-1'), createRoute('safe-2')]);
      const refreshedPreview = createPreviewResponse([createRoute('safe-3')]);

      useAppStore.getState().setRoutePreview(firstPreview);
      useAppStore.getState().setSelectedRouteId('safe-2');
      useAppStore.getState().setRoutePreview(refreshedPreview);

      expect(useAppStore.getState().selectedRouteId).toBe('safe-3');
    });

    it('transitions to ROUTE_PREVIEW when routes are set', () => {
      useAppStore.getState().setRoutePreview(
        createPreviewResponse([createRoute('safe-1')]),
      );
      expect(useAppStore.getState().appState).toBe('ROUTE_PREVIEW');
    });

    it('transitions to NAVIGATING when navigation starts', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      expect(useAppStore.getState().appState).toBe('NAVIGATING');
    });

    it('transitions to AWAITING_FEEDBACK when navigation finishes', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().finishNavigation();
      expect(useAppStore.getState().appState).toBe('AWAITING_FEEDBACK');
    });

    it('full lifecycle: IDLE -> ROUTE_PREVIEW -> NAVIGATING -> AWAITING_FEEDBACK -> IDLE', () => {
      expect(useAppStore.getState().appState).toBe('IDLE');

      useAppStore.getState().setRoutePreview(
        createPreviewResponse([createRoute('safe-1')]),
      );
      expect(useAppStore.getState().appState).toBe('ROUTE_PREVIEW');

      useAppStore.getState().startNavigation(createRoute('safe-1'));
      expect(useAppStore.getState().appState).toBe('NAVIGATING');

      useAppStore.getState().finishNavigation();
      expect(useAppStore.getState().appState).toBe('AWAITING_FEEDBACK');

      useAppStore.getState().resetFlow();
      expect(useAppStore.getState().appState).toBe('IDLE');
    });

    it('clears route preview and returns to IDLE when setting null', () => {
      useAppStore.getState().setRoutePreview(
        createPreviewResponse([createRoute('safe-1')]),
      );
      expect(useAppStore.getState().appState).toBe('ROUTE_PREVIEW');

      useAppStore.getState().setRoutePreview(null);
      expect(useAppStore.getState().routePreview).toBeNull();
      expect(useAppStore.getState().selectedRouteId).toBeNull();
      expect(useAppStore.getState().appState).toBe('IDLE');
    });

    it('preserves NAVIGATING state when setRoutePreview is called during navigation', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      expect(useAppStore.getState().appState).toBe('NAVIGATING');

      useAppStore.getState().setRoutePreview(
        createPreviewResponse([createRoute('safe-2')]),
      );
      expect(useAppStore.getState().appState).toBe('NAVIGATING');
    });
  });

  // =========================================================================
  // Route Request & Waypoints
  // =========================================================================

  describe('route request', () => {
    it('merges partial route request updates', () => {
      useAppStore.getState().setRouteRequest({
        origin: { lat: 44.42, lon: 26.10 },
      });
      expect(useAppStore.getState().routeRequest.origin).toEqual({ lat: 44.42, lon: 26.10 });
      // Destination should remain unchanged
      expect(useAppStore.getState().routeRequest.destination).toEqual({ lat: 0, lon: 0 });
    });

    it('setRoutingMode updates the mode', () => {
      useAppStore.getState().setRoutingMode('fast');
      expect(useAppStore.getState().routeRequest.mode).toBe('fast');
    });
  });

  describe('waypoints', () => {
    it('adds a waypoint', () => {
      useAppStore.getState().addWaypoint({ lat: 44.43, lon: 26.09 });
      expect(useAppStore.getState().routeRequest.waypoints).toEqual([
        { lat: 44.43, lon: 26.09 },
      ]);
    });

    it('adds multiple waypoints', () => {
      useAppStore.getState().addWaypoint({ lat: 44.43, lon: 26.09 });
      useAppStore.getState().addWaypoint({ lat: 44.44, lon: 26.08 });
      useAppStore.getState().addWaypoint({ lat: 44.45, lon: 26.07 });
      expect(useAppStore.getState().routeRequest.waypoints).toHaveLength(3);
    });

    it('removes a waypoint by index', () => {
      useAppStore.getState().addWaypoint({ lat: 44.43, lon: 26.09 });
      useAppStore.getState().addWaypoint({ lat: 44.44, lon: 26.08 });
      useAppStore.getState().removeWaypoint(0);
      expect(useAppStore.getState().routeRequest.waypoints).toEqual([
        { lat: 44.44, lon: 26.08 },
      ]);
    });

    it('clears all waypoints', () => {
      useAppStore.getState().addWaypoint({ lat: 44.43, lon: 26.09 });
      useAppStore.getState().addWaypoint({ lat: 44.44, lon: 26.08 });
      useAppStore.getState().clearWaypoints();
      expect(useAppStore.getState().routeRequest.waypoints).toEqual([]);
    });

    it('reorders waypoints', () => {
      useAppStore.getState().addWaypoint({ lat: 1, lon: 1 });
      useAppStore.getState().addWaypoint({ lat: 2, lon: 2 });
      useAppStore.getState().addWaypoint({ lat: 3, lon: 3 });
      useAppStore.getState().reorderWaypoints(0, 2);
      expect(useAppStore.getState().routeRequest.waypoints).toEqual([
        { lat: 2, lon: 2 },
        { lat: 3, lon: 3 },
        { lat: 1, lon: 1 },
      ]);
    });

    it('does not reorder with out-of-bounds indices', () => {
      useAppStore.getState().addWaypoint({ lat: 1, lon: 1 });
      useAppStore.getState().addWaypoint({ lat: 2, lon: 2 });
      const before = useAppStore.getState().routeRequest.waypoints;
      useAppStore.getState().reorderWaypoints(-1, 5);
      expect(useAppStore.getState().routeRequest.waypoints).toEqual(before);
    });
  });

  // =========================================================================
  // Navigation Session
  // =========================================================================

  describe('navigation session', () => {
    it('stores live navigation progress for the active session', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().updateNavigationProgress(
        {
          coordinate: {
            lat: 44.4268,
            lon: 26.1025,
          },
          speedMetersPerSecond: 5.4,
          timestamp: 1710400000000,
        },
        {
          currentStepIndex: 0,
          snappedCoordinate: {
            lat: 44.4269,
            lon: 26.1024,
          },
          distanceToRouteMeters: 9,
          distanceToManeuverMeters: 42,
          remainingDistanceMeters: 840,
          remainingDurationSeconds: 250,
          shouldAnnounceApproach: true,
          shouldAdvanceStep: false,
          shouldCompleteNavigation: false,
          isOffRoute: false,
        },
      );

      expect(useAppStore.getState().navigationSession).toMatchObject({
        routeId: 'safe-1',
        lastKnownCoordinate: {
          lat: 44.4268,
          lon: 26.1025,
        },
        lastSnappedCoordinate: {
          lat: 44.4269,
          lon: 26.1024,
        },
        remainingDistanceMeters: 840,
        remainingDurationSeconds: 250,
      });
    });

    it('applies the voice-guidance preference to active navigation sessions', () => {
      useAppStore.getState().setVoiceGuidanceEnabled(false);
      useAppStore.getState().startNavigation(createRoute('safe-1'));

      expect(useAppStore.getState().voiceGuidanceEnabled).toBe(false);
      expect(useAppStore.getState().navigationSession?.isMuted).toBe(true);

      useAppStore.getState().setVoiceGuidanceEnabled(true);

      expect(useAppStore.getState().voiceGuidanceEnabled).toBe(true);
      expect(useAppStore.getState().navigationSession?.isMuted).toBe(false);
    });

    it('resets step progress when a reroute replaces the active route', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().advanceNavigation(4);
      useAppStore.getState().recordNavigationReroute('2026-03-14T10:00:00.000Z');
      useAppStore.getState().syncNavigationRoute('safe-2');

      expect(useAppStore.getState().selectedRouteId).toBe('safe-2');
      expect(useAppStore.getState().navigationSession).toMatchObject({
        routeId: 'safe-2',
        currentStepIndex: 0,
        lastRerouteAt: '2026-03-14T10:00:00.000Z',
        rerouteEligible: false,
        offRouteSince: null,
      });
    });

    it('appends GPS breadcrumbs during navigation', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().appendGpsBreadcrumb({
        coordinate: { lat: 44.4268, lon: 26.1025 },
        speedMetersPerSecond: 5.0,
        timestamp: 1710400000000,
      });
      useAppStore.getState().appendGpsBreadcrumb({
        coordinate: { lat: 44.4270, lon: 26.1027 },
        speedMetersPerSecond: 5.2,
        timestamp: 1710400001000,
      });

      const breadcrumbs = useAppStore.getState().navigationSession?.gpsBreadcrumbs;
      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs?.[0].lat).toBe(44.4268);
      expect(breadcrumbs?.[1].lat).toBe(44.4270);
    });

    it('caps GPS breadcrumbs at 2000', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      // Manually set near cap
      const session = useAppStore.getState().navigationSession!;
      const bigCrumbs = Array.from({ length: 2000 }, (_, i) => ({
        lat: 44 + i * 0.0001,
        lon: 26,
        ts: 1710400000000 + i,
        acc: null,
        spd: null,
        hdg: null,
      }));
      useAppStore.setState({
        navigationSession: { ...session, gpsBreadcrumbs: bigCrumbs },
      });

      useAppStore.getState().appendGpsBreadcrumb({
        coordinate: { lat: 99, lon: 99 },
        speedMetersPerSecond: 1,
        timestamp: Date.now(),
      });

      // Should still be 2000, not 2001
      expect(useAppStore.getState().navigationSession?.gpsBreadcrumbs).toHaveLength(2000);
    });

    it('sets muted state on navigation session', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().setMuted(true);
      expect(useAppStore.getState().navigationSession?.isMuted).toBe(true);
      useAppStore.getState().setMuted(false);
      expect(useAppStore.getState().navigationSession?.isMuted).toBe(false);
    });

    it('sets following state on navigation session', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().setFollowing(false);
      expect(useAppStore.getState().navigationSession?.isFollowing).toBe(false);
      useAppStore.getState().setFollowing(true);
      expect(useAppStore.getState().navigationSession?.isFollowing).toBe(true);
    });
  });

  // =========================================================================
  // Offline Queue
  // =========================================================================

  describe('offline queue', () => {
    it('queues and resolves offline mutations while preserving trip id mappings', () => {
      const mutationId = useAppStore.getState().enqueueMutation('trip_start', {
        clientTripId: 'client-trip-1',
        sessionId: 'session-1',
        startLocationText: 'Current rider location',
        startCoordinate: {
          lat: 44.4268,
          lon: 26.1025,
        },
        destinationText: 'Piata Victoriei',
        destinationCoordinate: {
          lat: 44.4521,
          lon: 26.0865,
        },
        distanceMeters: 2400,
        startedAt: '2026-03-14T10:00:00.000Z',
      });

      useAppStore.getState().markMutationSyncing(mutationId);
      useAppStore.getState().setTripServerId('client-trip-1', 'trip-123');
      useAppStore.getState().resolveMutation(mutationId);

      expect(useAppStore.getState().queuedMutations).toHaveLength(0);
      expect(useAppStore.getState().tripServerIds).toEqual({
        'client-trip-1': 'trip-123',
      });
    });

    it('recovers stale syncing mutations so they can be retried after restart', () => {
      const mutationId = useAppStore.getState().enqueueMutation('trip_start', {
        clientTripId: 'client-trip-2',
        sessionId: 'session-2',
        startLocationText: 'Current rider location',
        startCoordinate: {
          lat: 44.4268,
          lon: 26.1025,
        },
        destinationText: 'Piata Victoriei',
        destinationCoordinate: {
          lat: 44.4521,
          lon: 26.0865,
        },
        distanceMeters: 2400,
        startedAt: '2026-03-15T06:00:00.000Z',
      });

      useAppStore.getState().markMutationSyncing(mutationId);
      useAppStore.getState().recoverSyncingMutations('Recovered after validation restart.');

      expect(useAppStore.getState().queuedMutations).toEqual([
        expect.objectContaining({
          id: mutationId,
          status: 'failed',
          retryCount: 1,
          lastError: 'Recovered after validation restart.',
        }),
      ]);
    });

    it('queues the full developer validation write set with an active trip id', () => {
      useAppStore.getState().setRoutePreview(createPreviewResponse([createRoute('safe-1')]));
      const result = useAppStore.getState().queueDeveloperValidationWrites();

      expect(result.clientTripId).toMatch(/^dev-trip-/);
      expect(result.sessionId).toMatch(/^dev-session-/);
      expect(result.mutationIds).toHaveLength(4);
      expect(useAppStore.getState().activeTripClientId).toBe(result.clientTripId);
      expect(useAppStore.getState().queuedMutations).toEqual([
        expect.objectContaining({
          id: result.mutationIds[0],
          type: 'trip_start',
          status: 'queued',
        }),
        expect.objectContaining({
          id: result.mutationIds[1],
          type: 'hazard',
          status: 'queued',
        }),
        expect.objectContaining({
          id: result.mutationIds[2],
          type: 'feedback',
          status: 'queued',
        }),
        expect.objectContaining({
          id: result.mutationIds[3],
          type: 'trip_end',
          status: 'queued',
        }),
      ]);
    });

    it('returns unique mutation IDs', () => {
      const id1 = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      const id2 = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.43, lon: 26.11 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      expect(id1).not.toBe(id2);
    });

    it('failMutation increments retry count and sets error', () => {
      const id = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      useAppStore.getState().markMutationSyncing(id);
      useAppStore.getState().failMutation(id, 'Network error');

      const mutation = useAppStore.getState().queuedMutations.find((m) => m.id === id);
      expect(mutation?.status).toBe('failed');
      expect(mutation?.retryCount).toBe(1);
      expect(mutation?.lastError).toBe('Network error');
    });

    it('killMutation marks as dead with MAX RETRIES prefix', () => {
      const id = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      useAppStore.getState().killMutation(id, 'Server rejected');

      const mutation = useAppStore.getState().queuedMutations.find((m) => m.id === id);
      expect(mutation?.status).toBe('dead');
      expect(mutation?.lastError).toContain('[MAX RETRIES]');
    });

    it('retryDeadMutations resets dead mutations to queued', () => {
      const id = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      useAppStore.getState().killMutation(id, 'Server rejected');

      const count = useAppStore.getState().retryDeadMutations();
      expect(count).toBe(1);

      const mutation = useAppStore.getState().queuedMutations.find((m) => m.id === id);
      expect(mutation?.status).toBe('queued');
      expect(mutation?.retryCount).toBe(0);
      expect(mutation?.lastError).toBeNull();
    });

    it('retryDeadMutations returns 0 when no dead mutations exist', () => {
      const count = useAppStore.getState().retryDeadMutations();
      expect(count).toBe(0);
    });

    it('mutation records contain createdAt timestamp', () => {
      const id = useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      const mutation = useAppStore.getState().queuedMutations.find((m) => m.id === id);
      expect(mutation?.createdAt).toBeDefined();
      expect(new Date(mutation!.createdAt).getTime()).not.toBeNaN();
    });
  });

  // =========================================================================
  // Preferences
  // =========================================================================

  describe('preferences', () => {
    it('setBikeType sets bike type and auto-enables avoidUnpaved for road bikes', () => {
      useAppStore.getState().setBikeType('Road bike');
      expect(useAppStore.getState().bikeType).toBe('Road bike');
      expect(useAppStore.getState().avoidUnpaved).toBe(true);
    });

    it('setBikeType auto-disables avoidUnpaved for mountain bikes', () => {
      useAppStore.getState().setBikeType('Mountain bike');
      expect(useAppStore.getState().bikeType).toBe('Mountain bike');
      expect(useAppStore.getState().avoidUnpaved).toBe(false);
    });

    it('setBikeType preserves avoidUnpaved for other bike types', () => {
      useAppStore.getState().setAvoidUnpaved(true);
      useAppStore.getState().setBikeType('E-bike');
      expect(useAppStore.getState().bikeType).toBe('E-bike');
      expect(useAppStore.getState().avoidUnpaved).toBe(true);
    });

    it('setVoiceGuidanceEnabled updates both preference and session mute', () => {
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().setVoiceGuidanceEnabled(true);
      expect(useAppStore.getState().voiceGuidanceEnabled).toBe(true);
      expect(useAppStore.getState().navigationSession?.isMuted).toBe(false);
    });

    it('setThemePreference changes the theme', () => {
      useAppStore.getState().setThemePreference('light');
      expect(useAppStore.getState().themePreference).toBe('light');

      useAppStore.getState().setThemePreference('system');
      expect(useAppStore.getState().themePreference).toBe('system');
    });

    it('setPoiVisibility updates a single POI category', () => {
      useAppStore.getState().setPoiVisibility('hydration', true);
      expect(useAppStore.getState().poiVisibility.hydration).toBe(true);
      // Other categories should remain unchanged
      expect(useAppStore.getState().poiVisibility.repair).toBe(false);
    });

    it('setShowBicycleLanes toggles bicycle lanes', () => {
      useAppStore.getState().setShowBicycleLanes(false);
      expect(useAppStore.getState().showBicycleLanes).toBe(false);
    });

    it('setCyclingFrequency updates frequency', () => {
      useAppStore.getState().setCyclingFrequency('daily');
      expect(useAppStore.getState().cyclingFrequency).toBe('daily');
    });

    it('setAvoidUnpaved updates directly', () => {
      useAppStore.getState().setAvoidUnpaved(true);
      expect(useAppStore.getState().avoidUnpaved).toBe(true);
    });

    it('notification preferences can be toggled independently', () => {
      useAppStore.getState().setNotifyWeather(false);
      useAppStore.getState().setNotifyHazard(false);
      useAppStore.getState().setNotifyCommunity(false);
      expect(useAppStore.getState().notifyWeather).toBe(false);
      expect(useAppStore.getState().notifyHazard).toBe(false);
      expect(useAppStore.getState().notifyCommunity).toBe(false);
    });

    it('setQuietHours sets both start and end', () => {
      useAppStore.getState().setQuietHours('23:00', '06:00');
      expect(useAppStore.getState().quietHoursStart).toBe('23:00');
      expect(useAppStore.getState().quietHoursEnd).toBe('06:00');
    });

    it('setShareTripsPublicly toggles trip sharing', () => {
      useAppStore.getState().setShareTripsPublicly(false);
      expect(useAppStore.getState().shareTripsPublicly).toBe(false);
    });

    it('setLocale switches locale', () => {
      useAppStore.getState().setLocale('ro');
      expect(useAppStore.getState().locale).toBe('ro');
    });

    it('setShowRouteComparison toggles route comparison', () => {
      useAppStore.getState().setShowRouteComparison(false);
      expect(useAppStore.getState().showRouteComparison).toBe(false);
    });
  });

  // =========================================================================
  // Badge Unlock Queue
  // =========================================================================

  describe('badge unlock queue', () => {
    it('enqueueBadgeUnlocks adds badges to pending list', () => {
      useAppStore.getState().enqueueBadgeUnlocks([
        {
          badgeKey: 'first_ride',
          tier: 'bronze',
          name: 'First Ride',
          flavorText: 'Every journey begins...',
          iconKey: 'first_ride',
          earnedAt: '2026-04-01T10:00:00Z',
        },
      ]);
      expect(useAppStore.getState().pendingBadgeUnlocks).toHaveLength(1);
      expect(useAppStore.getState().pendingBadgeUnlocks[0].badgeKey).toBe('first_ride');
    });

    it('shiftBadgeUnlock removes and returns the first badge', () => {
      useAppStore.getState().enqueueBadgeUnlocks([
        {
          badgeKey: 'first_ride',
          tier: 'bronze',
          name: 'First Ride',
          flavorText: 'Every journey begins...',
          iconKey: 'first_ride',
          earnedAt: '2026-04-01T10:00:00Z',
        },
        {
          badgeKey: 'distance_1',
          tier: 'silver',
          name: 'Distance Runner',
          flavorText: 'Going the distance...',
          iconKey: 'distance',
          earnedAt: '2026-04-01T10:01:00Z',
        },
      ]);

      const first = useAppStore.getState().shiftBadgeUnlock();
      expect(first?.badgeKey).toBe('first_ride');
      expect(useAppStore.getState().pendingBadgeUnlocks).toHaveLength(1);
      expect(useAppStore.getState().pendingBadgeUnlocks[0].badgeKey).toBe('distance_1');
    });

    it('shiftBadgeUnlock returns undefined when queue is empty', () => {
      const result = useAppStore.getState().shiftBadgeUnlock();
      expect(result).toBeUndefined();
    });

    it('clearBadgeUnlocks empties the queue', () => {
      useAppStore.getState().enqueueBadgeUnlocks([
        {
          badgeKey: 'first_ride',
          tier: 'bronze',
          name: 'First Ride',
          flavorText: 'Every journey begins...',
          iconKey: 'first_ride',
          earnedAt: '2026-04-01T10:00:00Z',
        },
      ]);
      useAppStore.getState().clearBadgeUnlocks();
      expect(useAppStore.getState().pendingBadgeUnlocks).toEqual([]);
    });

    it('enqueueBadgeUnlocks appends to existing queue', () => {
      useAppStore.getState().enqueueBadgeUnlocks([
        {
          badgeKey: 'a',
          tier: 'bronze',
          name: 'A',
          flavorText: 'A',
          iconKey: 'a',
          earnedAt: '2026-04-01T10:00:00Z',
        },
      ]);
      useAppStore.getState().enqueueBadgeUnlocks([
        {
          badgeKey: 'b',
          tier: 'silver',
          name: 'B',
          flavorText: 'B',
          iconKey: 'b',
          earnedAt: '2026-04-01T10:01:00Z',
        },
      ]);
      expect(useAppStore.getState().pendingBadgeUnlocks).toHaveLength(2);
    });
  });

  // =========================================================================
  // Recent Destinations
  // =========================================================================

  describe('recent destinations', () => {
    const createDestination = (id: string, lat: number, lon: number) => ({
      id,
      label: `Place ${id}`,
      primaryText: `Place ${id}`,
      coordinates: { lat, lon },
      selectedAt: new Date().toISOString(),
    });

    it('adds a destination to the front', () => {
      useAppStore.getState().addRecentDestination(createDestination('1', 44.42, 26.10));
      expect(useAppStore.getState().recentDestinations).toHaveLength(1);
      expect(useAppStore.getState().recentDestinations[0].id).toBe('1');
    });

    it('deduplicates by coordinates', () => {
      useAppStore.getState().addRecentDestination(createDestination('1', 44.42, 26.10));
      useAppStore.getState().addRecentDestination(createDestination('2', 44.42, 26.10));
      expect(useAppStore.getState().recentDestinations).toHaveLength(1);
      expect(useAppStore.getState().recentDestinations[0].id).toBe('2');
    });

    it('limits to 3 destinations', () => {
      for (let i = 0; i < 5; i++) {
        useAppStore.getState().addRecentDestination(
          createDestination(`${i}`, 44 + i * 0.01, 26),
        );
      }
      expect(useAppStore.getState().recentDestinations).toHaveLength(3);
    });

    it('most recent destination is at index 0', () => {
      useAppStore.getState().addRecentDestination(createDestination('old', 44.42, 26.10));
      useAppStore.getState().addRecentDestination(createDestination('new', 44.43, 26.11));
      expect(useAppStore.getState().recentDestinations[0].id).toBe('new');
    });
  });

  // =========================================================================
  // Milestones & Counters
  // =========================================================================

  describe('milestones and counters', () => {
    it('addEarnedMilestone adds unique milestones', () => {
      useAppStore.getState().addEarnedMilestone('first_trip');
      useAppStore.getState().addEarnedMilestone('first_trip');
      expect(useAppStore.getState().earnedMilestones).toEqual(['first_trip']);
    });

    it('incrementRatingSkipCount increments counter', () => {
      useAppStore.getState().incrementRatingSkipCount();
      useAppStore.getState().incrementRatingSkipCount();
      expect(useAppStore.getState().ratingSkipCount).toBe(2);
    });

    it('incrementAnonymousOpenCount increments counter', () => {
      useAppStore.getState().incrementAnonymousOpenCount();
      expect(useAppStore.getState().anonymousOpenCount).toBe(1);
    });

    it('resetAnonymousOpenCount resets to zero', () => {
      useAppStore.getState().incrementAnonymousOpenCount();
      useAppStore.getState().incrementAnonymousOpenCount();
      useAppStore.getState().resetAnonymousOpenCount();
      expect(useAppStore.getState().anonymousOpenCount).toBe(0);
    });
  });

  // =========================================================================
  // Offline Regions
  // =========================================================================

  describe('offline regions', () => {
    it('stores offline region metadata for route packs', () => {
      useAppStore.getState().upsertOfflineRegion({
        id: 'route-pack-1',
        name: 'Selected route region',
        bbox: [26.08, 44.42, 26.11, 44.45],
        minZoom: 11,
        maxZoom: 16,
        status: 'downloading',
        progressPercentage: 42,
      });

      useAppStore.getState().upsertOfflineRegion({
        id: 'route-pack-1',
        name: 'Selected route region',
        bbox: [26.08, 44.42, 26.11, 44.45],
        minZoom: 11,
        maxZoom: 16,
        status: 'ready',
        progressPercentage: 100,
      });

      expect(useAppStore.getState().offlineRegions).toEqual([
        expect.objectContaining({
          id: 'route-pack-1',
          status: 'ready',
          progressPercentage: 100,
        }),
      ]);

      useAppStore.getState().removeOfflineRegion('route-pack-1');
      expect(useAppStore.getState().offlineRegions).toHaveLength(0);
    });

    it('setOfflineRegions replaces all regions', () => {
      useAppStore.getState().setOfflineRegions([
        {
          id: 'r1',
          name: 'Region 1',
          bbox: [0, 0, 1, 1],
          minZoom: 10,
          maxZoom: 15,
          status: 'ready',
          progressPercentage: 100,
        },
      ]);
      expect(useAppStore.getState().offlineRegions).toHaveLength(1);
    });
  });

  // =========================================================================
  // Immutability
  // =========================================================================

  describe('immutability', () => {
    it('setRouteRequest creates a new routeRequest object', () => {
      const before = useAppStore.getState().routeRequest;
      useAppStore.getState().setRouteRequest({ mode: 'fast' });
      const after = useAppStore.getState().routeRequest;
      expect(before).not.toBe(after);
    });

    it('setPoiVisibility creates a new poiVisibility object', () => {
      const before = useAppStore.getState().poiVisibility;
      useAppStore.getState().setPoiVisibility('hydration', true);
      const after = useAppStore.getState().poiVisibility;
      expect(before).not.toBe(after);
    });

    it('addRecentDestination creates a new array', () => {
      const before = useAppStore.getState().recentDestinations;
      useAppStore.getState().addRecentDestination({
        id: '1',
        label: 'Place',
        primaryText: 'Place',
        coordinates: { lat: 44.42, lon: 26.10 },
        selectedAt: new Date().toISOString(),
      });
      const after = useAppStore.getState().recentDestinations;
      expect(before).not.toBe(after);
    });

    it('enqueueMutation creates a new queue array', () => {
      const before = useAppStore.getState().queuedMutations;
      useAppStore.getState().enqueueMutation('hazard', {
        coordinate: { lat: 44.42, lon: 26.10 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      });
      const after = useAppStore.getState().queuedMutations;
      expect(before).not.toBe(after);
    });
  });

  // =========================================================================
  // Reset Flow
  // =========================================================================

  describe('resetFlow', () => {
    it('resets all navigation state to defaults', () => {
      useAppStore.getState().setRoutePreview(
        createPreviewResponse([createRoute('safe-1')]),
      );
      useAppStore.getState().startNavigation(createRoute('safe-1'));
      useAppStore.getState().resetFlow();

      expect(useAppStore.getState().appState).toBe('IDLE');
      expect(useAppStore.getState().routePreview).toBeNull();
      expect(useAppStore.getState().selectedRouteId).toBeNull();
      expect(useAppStore.getState().activeTripClientId).toBeNull();
      expect(useAppStore.getState().routeRequest.origin).toEqual({ lat: 0, lon: 0 });
    });
  });
});
