import type { RiskSegment } from '@defensivepedal/core';
import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';

import { useBicycleParking } from '../src/hooks/useBicycleParking';
// Bike lanes use Mapbox vector tiles directly
import { useBicycleRental } from '../src/hooks/useBicycleRental';
import { useBikeShops } from '../src/hooks/useBikeShops';
import { usePoiSearch } from '../src/hooks/usePoiSearch';
import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useWeather } from '../src/hooks/useWeather';
import { BrandLogo } from '../src/components/BrandLogo';
import { MapStageScreen } from '../src/components/MapStageScreen';
import { RouteMap } from '../src/components/map';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { createClientTripId } from '../src/lib/offlineQueue';
import { mobileApi } from '../src/lib/api';
import { telemetry } from '../src/lib/telemetry';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { ElevationChart } from '../src/design-system/organisms/ElevationChart';
import { RiskDistributionCard } from '../src/design-system/organisms/RiskDistributionCard';
import { WeatherWarningModal } from '../src/design-system/molecules/WeatherWarningModal';
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
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);
  const setSelectedRouteId = useAppStore((state) => state.setSelectedRouteId);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const startNavigation = useAppStore((state) => state.startNavigation);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const setActiveTripClientId = useAppStore((state) => state.setActiveTripClientId);
  const avoidUnpaved = useAppStore((state) => state.avoidUnpaved);
  const { parkingLocations } = useBicycleParking(
    routeRequest ? { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon } : null,
    routeRequest ? { lat: routeRequest.destination.lat, lon: routeRequest.destination.lon } : null,
  );
  const { rentalLocations } = useBicycleRental(
    routeRequest ? { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon } : null,
    routeRequest ? { lat: routeRequest.destination.lat, lon: routeRequest.destination.lon } : null,
  );
  const { shops: bikeShopLocations } = useBikeShops(
    routeRequest ? { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon } : null,
    routeRequest ? { lat: routeRequest.destination.lat, lon: routeRequest.destination.lon } : null,
    poiVisibility?.repair ?? false,
  );
  const { searchedPois } = usePoiSearch(
    routeRequest ? { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon } : null,
    routeRequest ? { lat: routeRequest.destination.lat, lon: routeRequest.destination.lon } : null,
    poiVisibility,
  );
  const { warnings: weatherWarnings } = useWeather(
    routeRequest.origin.lat,
    routeRequest.origin.lon,
  );
  const [weatherWarningDismissed, setWeatherWarningDismissed] = useState(false);
  const [switchingToSafe, setSwitchingToSafe] = useState(false);
  const previewSuccessRef = useRef<number>(0);
  const previewErrorRef = useRef<number>(0);

  const showRouteComparison = useAppStore((state) => state.showRouteComparison);
  const effectiveRequest = { ...routeRequest, avoidUnpaved, showRouteComparison };

  const previewQuery = useQuery({
    queryKey: ['route-preview', effectiveRequest],
    queryFn: () => mobileApi.previewRoute(effectiveRequest),
    enabled: true,
  });

  useEffect(() => {
    if (previewQuery.data) {
      setRoutePreview(previewQuery.data);
      setSwitchingToSafe(false);
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

  // ── Save Route ──
  const queryClient = useQueryClient();
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveRouteName, setSaveRouteName] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const handleSaveRoute = useCallback(async () => {
    if (!saveRouteName.trim()) return;
    setSavingRoute(true);
    try {
      await mobileApi.saveRoute({
        name: saveRouteName.trim(),
        origin: routeRequest.origin,
        destination: routeRequest.destination,
        waypoints: routeRequest.waypoints ?? [],
        mode: routeRequest.mode,
        avoidUnpaved: routeRequest.avoidUnpaved,
      });
      void queryClient.invalidateQueries({ queryKey: ['saved-routes'] });
      setSaveModalVisible(false);
      setSaveRouteName('');
      setSaveToast('Route saved!');
      setTimeout(() => setSaveToast(null), 3000);
    } catch {
      setSaveToast('Failed to save route');
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setSavingRoute(false);
    }
  }, [saveRouteName, routeRequest, queryClient]);

  const topOverlay = (
    <>
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
    <>
    <WeatherWarningModal
      warnings={weatherWarnings}
      visible={weatherWarnings.length > 0 && !weatherWarningDismissed}
      onDismiss={() => setWeatherWarningDismissed(true)}
    />
    <MapStageScreen
      useBottomSheet
      peekContent={selectedRoute ? (
        <View style={styles.peekStrip}>
          <Badge
            variant={routePreview?.selectedMode === 'safe' ? 'risk-safe' : 'info'}
            size="md"
          >
            {routePreview?.selectedMode === 'safe' ? 'Safe' : 'Fast'}
          </Badge>
          <Text style={styles.peekStat}>
            {(selectedRoute.distanceMeters / 1000).toFixed(1)} km
          </Text>
          <Text style={styles.peekDivider}>·</Text>
          <Text style={styles.peekStat}>
            {formatDuration(selectedRoute.adjustedDurationSeconds)}
          </Text>
          <View style={styles.peekSpacer} />
          <Text style={styles.peekHint}>Swipe up</Text>
        </View>
      ) : null}
      map={
        <RouteMap
          routes={routePreview?.routes}
          selectedRouteId={selectedRouteId}
          origin={previewOrigin}
          destination={routeRequest.destination}
          fullBleed
          showRouteOverlay={false}
          bicycleParkingLocations={parkingLocations}
          bicycleRentalLocations={rentalLocations}
          bikeShopLocations={bikeShopLocations}
          searchedPois={searchedPois}
          showBicycleLanes
          poiVisibility={poiVisibility}
        />
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
          <View style={styles.footerSecondaryRow}>
            <View style={styles.footerSecondaryButton}>
              <Button variant="secondary" size="md" fullWidth onPress={returnToPlanning}>
                Back to planning
              </Button>
            </View>
            {user ? (
              <Pressable
                style={styles.saveRouteButton}
                onPress={() => setSaveModalVisible(true)}
                accessibilityLabel="Save this route"
                accessibilityRole="button"
              >
                <Ionicons name="bookmark-outline" size={18} color={darkTheme.accent} />
                <Text style={styles.saveRouteLabel}>Save</Text>
              </Pressable>
            ) : null}
          </View>
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

            <Text style={styles.statDivider}>·</Text>

            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: '#F2C30F' }]}>
                +{Math.round(selectedRoute.distanceMeters / 1000 * 0.4 * 30)}min
              </Text>
              <Text style={styles.statUnit}>life</Text>
            </View>
          </View>
        </View>
      ) : null}

      {selectedRoute && selectedRoute.riskSegments.length > 0 ? (
        <RiskDistributionCard riskSegments={selectedRoute.riskSegments} />
      ) : null}

      {routePreview?.comparisonLabel ? (
        <View>
          <View style={[
            styles.comparisonBadge,
            routePreview.comparisonLabel.includes('less safe') && styles.comparisonBadgeWarning,
          ]}>
            <Ionicons
              name={routePreview.comparisonLabel.includes('less safe') ? 'warning' : 'shield-checkmark'}
              size={18}
              color={routePreview.comparisonLabel.includes('less safe') ? '#F59E0B' : '#22C55E'}
            />
            <Text style={[
              styles.comparisonText,
              routePreview.comparisonLabel.includes('less safe') && styles.comparisonTextWarning,
            ]}>
              {routePreview.comparisonLabel}
            </Text>
          </View>
          {routePreview.comparisonLabel.includes('less safe') ? (
            <Pressable
              style={styles.switchToSafeButton}
              onPress={() => {
                setSwitchingToSafe(true);
                const setRoutingMode = useAppStore.getState().setRoutingMode;
                setRoutingMode('safe');
              }}
              disabled={switchingToSafe}
            >
              {switchingToSafe ? (
                <>
                  <Spinner size={16} />
                  <Text style={styles.switchToSafeText}>Switching to safe route...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={16} color="#22C55E" />
                  <Text style={styles.switchToSafeText}>Switch to safe route</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
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

    {/* Save route modal */}
    {saveModalVisible ? (
      <Pressable style={styles.modalOverlay} onPress={() => setSaveModalVisible(false)}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Save Route</Text>
          <TextInput
            style={styles.modalInput}
            value={saveRouteName}
            onChangeText={setSaveRouteName}
            placeholder="Route name (e.g. Morning commute)"
            placeholderTextColor={darkTheme.textMuted}
            autoFocus
            maxLength={100}
          />
          <View style={styles.modalButtonRow}>
            <Button variant="ghost" size="md" onPress={() => setSaveModalVisible(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!saveRouteName.trim() || savingRoute}
              onPress={handleSaveRoute}
            >
              {savingRoute ? 'Saving...' : 'Save'}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    ) : null}

    {/* Save toast */}
    {saveToast ? (
      <View style={styles.toastContainer}>
        <View style={styles.toastPill}>
          <Ionicons name="checkmark-circle" size={16} color={darkTheme.accent} />
          <Text style={styles.toastText}>{saveToast}</Text>
        </View>
      </View>
    ) : null}
    </>
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
  comparisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  comparisonText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: '#22C55E',
  },
  comparisonBadgeWarning: {
    borderColor: 'rgba(245, 158, 11, 0.3)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  comparisonTextWarning: {
    color: '#F59E0B',
  },
  switchToSafeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    marginTop: space[2],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  switchToSafeText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: '#22C55E',
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
  footerSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  footerSecondaryButton: {
    flex: 1,
  },
  saveRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
  },
  saveRouteLabel: {
    fontSize: 14,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.accent,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalCard: {
    width: '85%',
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.xl,
    padding: space[5],
    gap: space[3],
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.textPrimary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    borderRadius: radii.md,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    fontSize: 15,
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textPrimary,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space[2],
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.full,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    ...shadows.md,
  },
  toastText: {
    fontSize: 14,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textPrimary,
  },
  peekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  peekStat: {
    ...textDataSm,
    fontSize: 16,
    color: darkTheme.textPrimary,
    fontFamily: fontFamily.mono.bold,
  },
  peekDivider: {
    ...textSm,
    color: darkTheme.textMuted,
  },
  peekSpacer: {
    flex: 1,
  },
  peekHint: {
    ...textXs,
    color: darkTheme.textMuted,
    fontFamily: fontFamily.body.regular,
  },
});
