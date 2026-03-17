import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/RouteMap';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { createClientTripId } from '../src/lib/offlineQueue';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { telemetry } from '../src/lib/telemetry';
import { mobileTheme } from '../src/lib/theme';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

export default function RoutePreviewScreen() {
  const { user } = useAuthSession();
  const routeRequest = useAppStore((state) => state.routeRequest);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const startNavigation = useAppStore((state) => state.startNavigation);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const setActiveTripClientId = useAppStore((state) => state.setActiveTripClientId);
  const previewSuccessRef = useRef<number>(0);
  const previewErrorRef = useRef<number>(0);

  const previewQuery = useQuery({
    queryKey: ['route-preview', routeRequest],
    queryFn: () => mobileApi.previewRoute(routeRequest),
    enabled: Boolean(mobileEnv.mobileApiUrl),
  });

  useEffect(() => {
    if (previewQuery.data) {
      setRoutePreview(previewQuery.data);
    }
  }, [previewQuery.data, setRoutePreview]);

  useEffect(() => {
    if (
      !previewQuery.data ||
      previewQuery.dataUpdatedAt === 0 ||
      previewSuccessRef.current === previewQuery.dataUpdatedAt
    ) {
      return;
    }

    previewSuccessRef.current = previewQuery.dataUpdatedAt;
    telemetry.capture('route_preview_succeeded', {
      mode: previewQuery.data.selectedMode,
      route_count: previewQuery.data.routes.length,
      coverage_status: previewQuery.data.coverage.status,
      using_custom_start: hasStartOverride(routeRequest),
    });
  }, [previewQuery.data, previewQuery.dataUpdatedAt, routeRequest]);

  useEffect(() => {
    if (
      !previewQuery.isError ||
      previewQuery.errorUpdatedAt === 0 ||
      previewErrorRef.current === previewQuery.errorUpdatedAt
    ) {
      return;
    }

    previewErrorRef.current = previewQuery.errorUpdatedAt;
    telemetry.capture('route_preview_failed', {
      mode: routeRequest.mode,
      using_custom_start: hasStartOverride(routeRequest),
    });
    telemetry.captureError(previewQuery.error, {
      feature: 'route_preview',
      mode: routeRequest.mode,
    });
  }, [previewQuery.error, previewQuery.errorUpdatedAt, previewQuery.isError, routeRequest]);

  const selectedRoute = useMemo(
    () =>
      routePreview?.routes.find((route) => route.id === selectedRouteId) ??
      routePreview?.routes[0] ??
      null,
    [routePreview, selectedRouteId],
  );

  const isMissingApi = !mobileEnv.mobileApiUrl;
  const isEmpty =
    !previewQuery.isPending &&
    !previewQuery.isError &&
    (routePreview?.routes.length ?? 0) === 0;
  const previewOrigin = getPreviewOrigin(routeRequest);
  const usingCustomStart = hasStartOverride(routeRequest);

  const returnToPlanning = () => {
    router.replace('/route-planning');
  };

  const toggleVoiceGuidance = () => {
    const nextEnabled = !voiceGuidanceEnabled;
    setVoiceGuidanceEnabled(nextEnabled);

    if (!nextEnabled) {
      void Speech.stop();
      return;
    }

    const previewInstruction =
      selectedRoute?.steps[0]?.instruction ??
      'Voice guidance on. Start navigation to hear turn-by-turn instructions.';

    Speech.speak(previewInstruction, {
      language: routeRequest.locale,
    });
  };

  const beginNavigation = () => {
    if (!selectedRoute) {
      return;
    }

    const sessionId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    const previewOriginCoordinate = getPreviewOrigin(routeRequest);

    if (user) {
      const clientTripId = createClientTripId();

      enqueueMutation('trip_start', {
        clientTripId,
        sessionId,
        startLocationText: usingCustomStart
          ? `Custom start (${formatCoordinateLabel(previewOriginCoordinate.lat, previewOriginCoordinate.lon)})`
          : `Current rider location (${formatCoordinateLabel(previewOriginCoordinate.lat, previewOriginCoordinate.lon)})`,
        startCoordinate: previewOriginCoordinate,
        destinationText: formatCoordinateLabel(
          routeRequest.destination.lat,
          routeRequest.destination.lon,
        ),
        destinationCoordinate: routeRequest.destination,
        distanceMeters: selectedRoute.distanceMeters,
        startedAt: new Date().toISOString(),
      });
      setActiveTripClientId(clientTripId);
    } else {
      setActiveTripClientId(null);
    }

    telemetry.capture('navigation_started', {
      mode: routePreview?.selectedMode ?? routeRequest.mode,
      route_id: selectedRoute.id,
      route_source: selectedRoute.source,
      signed_in: Boolean(user),
    });
    startNavigation(selectedRoute, sessionId);
    router.push('/navigation');
  };

  const topOverlay = (
    <>
      <View style={styles.topBar}>
        <Pressable style={styles.backPill} onPress={returnToPlanning}>
          <Text style={styles.backPillLabel}>Back</Text>
        </Pressable>
        <View style={styles.brandCluster}>
          <BrandLogo size={40} />
          <View style={styles.brandCopy}>
            <Text style={styles.topEyebrow}>Defensive Pedal</Text>
            <Text style={styles.topTitle}>Route preview</Text>
            <Text style={styles.topSubtitle}>
              {previewQuery.isPending
                ? 'Loading alternatives…'
                : routePreview
                  ? `${routePreview.routes.length} route${routePreview.routes.length === 1 ? '' : 's'} ready`
                  : 'Waiting for route data'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeLabel}>
            {routePreview?.coverage.status
              ? `Coverage: ${routePreview.coverage.status}`
              : 'Coverage pending'}
          </Text>
        </View>
        <View
          style={[
            styles.metaBadge,
            routePreview?.selectedMode === 'safe' ? styles.metaBadgeSafe : styles.metaBadgeFast,
          ]}
        >
          <Text style={styles.metaBadgeLabel}>
            {routePreview?.selectedMode === 'safe' ? 'Safe routing' : 'Fast routing'}
          </Text>
        </View>
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeLabel}>{user ? 'Sync on' : 'Anonymous'}</Text>
        </View>
      </View>
    </>
  );

  return (
    <MapStageScreen
      map={
        <RouteMap
          routes={routePreview?.routes}
          selectedRouteId={selectedRouteId}
          origin={previewOrigin}
          destination={routeRequest.destination}
          fullBleed
          showRouteOverlay={false}
        />
      }
      rightOverlay={
        <VoiceGuidanceButton enabled={voiceGuidanceEnabled} onPress={toggleVoiceGuidance} />
      }
      topOverlay={topOverlay}
      footer={
        <>
          <Pressable
            style={[styles.primaryButton, !selectedRoute ? styles.primaryButtonDisabled : null]}
            disabled={!selectedRoute}
            onPress={beginNavigation}
          >
            <Text style={styles.primaryButtonLabel}>
              {selectedRoute ? 'Start navigation' : 'No route selected'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={returnToPlanning}>
            <Text style={styles.secondaryButtonLabel}>Back to planning</Text>
          </Pressable>
        </>
      }
    >
      {isMissingApi ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>Missing configuration</Text>
          <Text style={styles.warningBody}>
            Set `EXPO_PUBLIC_MOBILE_API_URL` before requesting route previews.
          </Text>
        </View>
      ) : null}

      {previewQuery.isPending ? (
        <View style={styles.sheetHero}>
          <Text style={styles.sheetEyebrow}>Preview loading</Text>
          <Text style={styles.sheetTitle}>Building safer alternatives</Text>
          <Text style={styles.sheetSubtitle}>
            Requesting routes, terrain summaries, and risk overlays from the mobile backend.
          </Text>
        </View>
      ) : null}

      {previewQuery.isError ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>Preview failed</Text>
          <Text style={styles.warningBody}>{previewQuery.error.message}</Text>
          <Pressable
            style={styles.retryPill}
            onPress={() => {
              void previewQuery.refetch();
            }}
          >
            <Text style={styles.retryPillLabel}>Retry preview</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedRoute ? (
        <>
          <View style={styles.sheetHero}>
            <Text style={styles.sheetEyebrow}>
              {routePreview?.selectedMode === 'safe' ? 'Safer route selected' : 'Fast route selected'}
            </Text>
            <Text style={styles.sheetTitle}>
              {(selectedRoute.distanceMeters / 1000).toFixed(1)} km ·{' '}
              {formatMinutes(selectedRoute.adjustedDurationSeconds)}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {usingCustomStart ? 'Custom start active.' : 'Using live rider start.'} {selectedRoute.riskSegments.length}{' '}
              risk overlay{selectedRoute.riskSegments.length === 1 ? '' : 's'} on the selected route.
            </Text>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Routing mode</Text>
              <Text style={styles.metricValue}>{routePreview?.selectedMode.toUpperCase()}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricValue}>{(selectedRoute.distanceMeters / 1000).toFixed(1)} km</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Adjusted ETA</Text>
              <Text style={styles.metricValue}>{formatMinutes(selectedRoute.adjustedDurationSeconds)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Total climb</Text>
              <Text style={styles.metricValue}>
                {selectedRoute.totalClimbMeters !== null
                  ? `${Math.round(selectedRoute.totalClimbMeters)} m`
                  : 'Unknown'}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alternatives</Text>
            <Text style={styles.sectionHint}>
              {routePreview?.routes.length ?? 0} available
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.alternativeTrack}
          >
            {routePreview?.routes.map((route) => (
              <Pressable
                key={route.id}
                style={[
                  styles.alternativeCard,
                  selectedRoute?.id === route.id ? styles.alternativeCardActive : null,
                ]}
                onPress={() => setSelectedRouteId(route.id)}
              >
                <Text
                  style={[
                    styles.alternativeDuration,
                    selectedRoute?.id === route.id ? styles.alternativeDurationActive : null,
                  ]}
                >
                  {formatMinutes(route.adjustedDurationSeconds)}
                </Text>
                <Text style={styles.alternativeDistance}>
                  {(route.distanceMeters / 1000).toFixed(1)} km
                </Text>
                <Text style={styles.alternativeMeta}>
                  {route.source === 'custom_osrm' ? 'Custom safe routing' : 'Mapbox fast routing'}
                </Text>
                <Text style={styles.alternativeMeta}>
                  {route.riskSegments.length} risk overlay{route.riskSegments.length === 1 ? '' : 's'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.syncPanel}>
            <Text style={styles.syncPanelTitle}>Sync mode</Text>
            <Text style={styles.syncPanelBody}>
              {user
                ? `Signed in as ${user.email ?? user.id}. Trips, hazards, and feedback will sync.`
                : 'Anonymous mode is active. Route preview works, but persisted writes stay local until you sign in.'}
            </Text>
          </View>
        </>
      ) : null}

      {selectedRoute?.warnings.length ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>Warnings</Text>
          <Text style={styles.warningBody}>{selectedRoute.warnings.join(' ')}</Text>
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>No routes available</Text>
          <Text style={styles.warningBody}>
            {routePreview?.coverage.message ??
              'The backend returned no alternatives for this request. Try fast mode or a different destination.'}
          </Text>
        </View>
      ) : null}
    </MapStageScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backPill: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.84)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backPillLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
  brandCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  topEyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  topTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  topSubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaBadge: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.82)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaBadgeSafe: {
    backgroundColor: 'rgba(15, 118, 110, 0.22)',
  },
  metaBadgeFast: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  metaBadgeLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
  sheetHero: {
    gap: 4,
  },
  sheetEyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sheetTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  sheetSubtitle: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  warningPanel: {
    borderRadius: 22,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    padding: 14,
    gap: 6,
  },
  warningTitle: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  warningBody: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    lineHeight: 18,
  },
  retryPill: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryPillLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    minWidth: '47%',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
  },
  metricLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  sectionTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionHint: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 12,
  },
  alternativeTrack: {
    gap: 10,
    paddingRight: 4,
  },
  alternativeCard: {
    width: 150,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  alternativeCardActive: {
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
    borderColor: mobileTheme.colors.borderStrong,
  },
  alternativeDuration: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 20,
    fontWeight: '900',
  },
  alternativeDurationActive: {
    color: mobileTheme.colors.brand,
  },
  alternativeDistance: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    fontWeight: '800',
  },
  alternativeMeta: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  syncPanel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 14,
    gap: 4,
  },
  syncPanelTitle: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  syncPanelBody: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: 24,
    backgroundColor: mobileTheme.colors.brand,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: '#8f9bad',
  },
  primaryButtonLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    paddingVertical: 15,
  },
  secondaryButtonLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
});
