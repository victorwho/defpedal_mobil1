import type { RiskSegment } from '@defensivepedal/core';
import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/RouteMap';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { createClientTripId } from '../src/lib/offlineQueue';
import { mobileApi } from '../src/lib/api';
import { telemetry } from '../src/lib/telemetry';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { ElevationChart } from '../src/design-system/organisms/ElevationChart';
import { RiskDistributionCard } from '../src/design-system/organisms/RiskDistributionCard';
import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { Spinner } from '../src/design-system/atoms/Spinner';
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

const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};
const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

export default function RoutePreviewScreen() {
  const { user } = useAuthSession();
  // Allow IDLE (initial load), ROUTE_PREVIEW (routes loaded), and NAVIGATING
  // (brief transitional state while router.push('/navigation') is in flight).
  // Without NAVIGATING here, the guard fires router.replace('/route-planning')
  // before the push to /navigation completes, winning the race.
  const guardPassed = useRouteGuard({
    requiredStates: ['IDLE', 'ROUTE_PREVIEW', 'NAVIGATING'],
  });
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
    enabled: true,
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

  const isMissingApi = false; // Routing now calls OSRM/Mapbox directly
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

  if (!guardPassed) return null;

  return (
    <MapStageScreen
      useBottomSheet
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
      {previewQuery.isPending ? (
        <View style={styles.sheetHero}>
          <Spinner size={32} />
          <Text style={styles.sheetEyebrow}>Preview loading</Text>
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
        <View style={styles.summaryStrip}>
          <Badge
            variant={routePreview?.selectedMode === 'safe' ? 'risk-safe' : 'info'}
            size="md"
          >
            {routePreview?.selectedMode === 'safe' ? 'Safe' : 'Fast'}
          </Badge>

          <View style={styles.statGroup}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {(selectedRoute.distanceMeters / 1000).toFixed(1)}
              </Text>
              <Text style={styles.statUnit}>km</Text>
            </View>

            <Text style={styles.statDivider}>·</Text>

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {formatDuration(selectedRoute.adjustedDurationSeconds)}
              </Text>
            </View>

            <Text style={styles.statDivider}>·</Text>

            <View style={styles.stat}>
              <Text style={styles.statValue}>
                ↑{selectedRoute.totalClimbMeters !== null
                  ? `${Math.round(selectedRoute.totalClimbMeters)} m`
                  : '—'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {selectedRoute && selectedRoute.riskSegments.length > 0 ? (
        <RiskDistributionCard riskSegments={selectedRoute.riskSegments} />
      ) : null}

      {selectedRoute?.elevationProfile && selectedRoute.elevationProfile.length > 1 ? (
        <ElevationChart
          elevationProfile={selectedRoute.elevationProfile}
          distanceMeters={selectedRoute.distanceMeters}
        />
      ) : null}

      {isMissingApi ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>Missing configuration</Text>
          <Text style={styles.warningBody}>
            Set `EXPO_PUBLIC_MOBILE_API_URL` before requesting route previews.
          </Text>
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
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radii['2xl'],
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.sm,
  },
  statGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space[2],
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  statValue: {
    ...textDataSm,
    fontSize: 17,
    color: darkTheme.textPrimary,
    fontFamily: fontFamily.mono.bold,
  },
  statUnit: {
    ...textXs,
    color: darkTheme.textMuted,
    fontFamily: fontFamily.mono.medium,
  },
  statDivider: {
    ...textSm,
    color: darkTheme.textMuted,
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
});
