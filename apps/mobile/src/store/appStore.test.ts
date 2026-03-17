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
  });
  useAppStore.persist.clearStorage();
});

describe('useAppStore', () => {
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
});
