import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/RouteMap';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { createClientTripId } from '../src/lib/offlineQueue';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { telemetry } from '../src/lib/telemetry';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { Spinner } from '../src/design-system/atoms/Spinner';
import { RouteComparisonPanel } from '../src/design-system/organisms/RouteComparisonPanel';
import { darkTheme, safetyColors } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import {
  fontFamily,
  text2xl,
  textXs,
  textSm,
  textDataSm,
} from '../src/design-system/tokens/typography';

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
        <Button variant="secondary" size="sm" onPress={returnToPlanning}>
          Back
        </Button>
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
        <Badge variant="neutral" size="md">
          {routePreview?.coverage.status
            ? `Coverage: ${routePreview.coverage.status}`
            : 'Coverage pending'}
        </Badge>
        <Badge
          variant={routePreview?.selectedMode === 'safe' ? 'risk-safe' : 'info'}
          size="md"
        >
          {routePreview?.selectedMode === 'safe' ? 'Safe routing' : 'Fast routing'}
        </Badge>
        <Badge variant={user ? 'accent' : 'neutral'} size="md">
          {user ? 'Sync on' : 'Anonymous'}
        </Badge>
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
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!selectedRoute}
            onPress={beginNavigation}
          >
            {selectedRoute ? 'Start navigation' : 'No route selected'}
          </Button>
          <Button variant="secondary" size="md" fullWidth onPress={returnToPlanning}>
            Back to planning
          </Button>
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
          <Spinner size={32} />
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
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              void previewQuery.refetch();
            }}
          >
            Retry preview
          </Button>
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

          <RouteComparisonPanel
            routes={routePreview?.routes ?? []}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            loading={previewQuery.isPending}
          />

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
    gap: space[3],
  },
  brandCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  brandCopy: {
    flex: 1,
    gap: space[0.5],
  },
  topEyebrow: {
    ...textXs,
    color: darkTheme.accent,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  topTitle: {
    ...text2xl,
    color: darkTheme.textPrimary,
  },
  topSubtitle: {
    ...textSm,
    color: darkTheme.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  sheetHero: {
    gap: space[1],
  },
  sheetEyebrow: {
    ...textXs,
    color: darkTheme.accent,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sheetTitle: {
    ...text2xl,
    fontSize: 26,
    color: darkTheme.textPrimary,
    letterSpacing: -0.7,
  },
  sheetSubtitle: {
    ...textSm,
    color: darkTheme.textSecondary,
    lineHeight: 20,
  },
  warningPanel: {
    borderRadius: radii['2xl'],
    backgroundColor: safetyColors.cautionTint + '28', // ~16% opacity tint
    padding: space[3],
    gap: 6,
  },
  warningTitle: {
    ...textXs,
    color: safetyColors.caution,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  warningBody: {
    ...textSm,
    fontSize: 13,
    color: darkTheme.textPrimary,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2] + 2,
  },
  metricCard: {
    minWidth: '47%',
    borderRadius: radii['2xl'],
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    ...shadows.sm,
  },
  metricLabel: {
    ...textXs,
    color: darkTheme.textMuted,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    ...textDataSm,
    fontSize: 17,
    color: darkTheme.textPrimary,
    fontFamily: fontFamily.mono.bold,
  },
  syncPanel: {
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: space[3],
    gap: space[1],
  },
  syncPanelTitle: {
    ...textXs,
    color: darkTheme.accent,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  syncPanelBody: {
    ...textSm,
    fontSize: 13,
    color: darkTheme.textSecondary,
    lineHeight: 18,
  },
});
