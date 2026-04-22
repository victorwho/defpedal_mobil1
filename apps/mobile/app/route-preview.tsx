import type { RiskSegment } from '@defensivepedal/core';
import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import {
  buildOfflineRegionFromRoute,
  downloadOfflineRegion,
} from '../src/lib/offlinePacks';
import { mobileApi } from '../src/lib/api';
import { telemetry } from '../src/lib/telemetry';
import { useConnectivity } from '../src/providers/ConnectivityMonitor';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

import { ElevationChart } from '../src/design-system/organisms/ElevationChart';
import { RiskDistributionCard } from '../src/design-system/organisms/RiskDistributionCard';
import { WeatherWarningModal } from '../src/design-system/molecules/WeatherWarningModal';
import { ShareOptionsModal } from '../src/design-system/molecules/ShareOptionsModal';
import { Toast } from '../src/design-system/molecules/Toast';
import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { Spinner } from '../src/design-system/atoms/Spinner';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { ShareRouteButton } from '../src/design-system/atoms/ShareRouteButton';
import { useShareRoute } from '../src/hooks/useShareRoute';
import { useTheme, type ThemeColors } from '../src/design-system';
import { surfaceTints } from '../src/design-system/tokens/tints';
import { zIndex } from '../src/design-system/tokens/zIndex';
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
import { MiaSegmentPreview } from '../src/design-system/molecules/MiaSegmentPreview';
import type { MiaSegmentInfo } from '../src/design-system/molecules/MiaSegmentPreview';
import { usePersonaT } from '../src/hooks/usePersonaT';

const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};
const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

export default function RoutePreviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
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
  const avoidHills = useAppStore((state) => state.avoidHills);
  const enqueueTelemetryEvent = useAppStore((state) => state.enqueueTelemetryEvent);

  const { isOnline } = useConnectivity();

  // ── Route-share flow (slice 1 of route-share PRD) ──
  const {
    share: shareRoute,
    isSharing: isSharingRoute,
    toastMessage: shareToastMessage,
    consumeToast: consumeShareToast,
  } = useShareRoute();

  // ── Offline download state ──
  type OfflineDownloadStatus = 'idle' | 'downloading' | 'complete' | 'error';
  const [offlineDownloadStatus, setOfflineDownloadStatus] = useState<OfflineDownloadStatus>('idle');
  const [offlineDownloadProgress, setOfflineDownloadProgress] = useState(0);
  const [offlineDownloadError, setOfflineDownloadError] = useState<string | null>(null);
  const upsertOfflineRegion = useAppStore((state) => state.upsertOfflineRegion);
  const offlineRegions = useAppStore((state) => state.offlineRegions);

  // Check if the selected route already has a ready offline pack
  const isRouteOfflineReady = useMemo(() => {
    if (!selectedRouteId) return false;
    const packId = `route-pack-${selectedRouteId}`;
    return offlineRegions.some((r) => r.id === packId && r.status === 'ready');
  }, [selectedRouteId, offlineRegions]);

  // ── Route Preview Telemetry: route_generated_not_started ──
  const navigationStartedRef = useRef(false);
  // Keep route data in a ref so the cleanup closure sees the latest values
  const routeDataRef = useRef<{ mode: string; distanceKm: number }>({
    mode: 'safe',
    distanceKm: 0,
  });

  // ── Mia Persona Journey ──
  const persona = useAppStore((state) => state.persona);
  const miaJourneyLevel = useAppStore((state) => state.miaJourneyLevel);
  const miaJourneyStatus = useAppStore((state) => state.miaJourneyStatus);
  const isMia = persona === 'mia' && miaJourneyStatus === 'active';
  const pt = usePersonaT();

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
  const effectiveRequest = { ...routeRequest, avoidUnpaved, avoidHills, showRouteComparison };

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

  // Slice 6: the share button no longer jumps straight to the native
  // share sheet — it opens ShareOptionsModal where the user can flip
  // the privacy toggle. PRD default is hideEndpoints=true; the toggle
  // state resets every time the modal opens (not persisted across
  // shares) so a one-off "show the whole route" decision on share A
  // can't accidentally leak endpoints on share B.
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [shareHideEndpoints, setShareHideEndpoints] = useState(true);

  // 400m safeguard threshold (PRD: 2 × 200m trim). Disables the toggle
  // when trimming would produce an empty / degenerate polyline.
  const SHORT_ROUTE_THRESHOLD_METERS = 400;
  const shareShortRouteFallback =
    (selectedRoute?.distanceMeters ?? 0) < SHORT_ROUTE_THRESHOLD_METERS;

  const handleSharePress = useCallback(() => {
    if (!selectedRoute || !routeRequest) return;
    // Reset the toggle to the PRD default each open — the state is
    // per-share, never cross-share.
    setShareHideEndpoints(true);
    setShareOptionsVisible(true);
  }, [selectedRoute, routeRequest]);

  const handleShareConfirm = useCallback(() => {
    if (!selectedRoute || !routeRequest) return;
    setShareOptionsVisible(false);
    const routingMode: 'safe' | 'fast' | 'flat' = avoidHills
      ? 'flat'
      : routeRequest.mode;
    void shareRoute({
      route: selectedRoute,
      origin: routeRequest.origin,
      destination: routeRequest.destination,
      routingMode,
      // Short-route fallback: the server ignores the flag below 400m
      // anyway, but sending false makes the intent explicit and matches
      // the effective behavior the UI communicated.
      hideEndpoints: shareShortRouteFallback ? false : shareHideEndpoints,
    });
  }, [
    selectedRoute,
    routeRequest,
    avoidHills,
    shareRoute,
    shareHideEndpoints,
    shareShortRouteFallback,
  ]);

  const handleDownloadOffline = useCallback(() => {
    if (!selectedRoute) return;
    setOfflineDownloadStatus('downloading');
    setOfflineDownloadProgress(0);
    setOfflineDownloadError(null);

    const region = buildOfflineRegionFromRoute(selectedRoute);
    void downloadOfflineRegion(region, (updated) => {
      if (updated.status === 'ready') {
        setOfflineDownloadStatus('complete');
        setOfflineDownloadProgress(100);
      } else if (updated.status === 'failed') {
        setOfflineDownloadStatus('error');
        setOfflineDownloadError(updated.error ?? 'Download failed');
      } else {
        setOfflineDownloadProgress(Math.round(updated.progressPercentage ?? 0));
      }
      upsertOfflineRegion(updated);
    }).catch((err) => {
      setOfflineDownloadStatus('error');
      setOfflineDownloadError(err instanceof Error ? err.message : 'Download failed');
    });
  }, [selectedRoute, upsertOfflineRegion]);

  // Keep route data ref in sync for unmount telemetry
  useEffect(() => {
    if (selectedRoute) {
      routeDataRef.current = {
        mode: routePreview?.selectedMode ?? routeRequest.mode,
        distanceKm: selectedRoute.distanceMeters / 1000,
      };
    }
  }, [selectedRoute, routePreview, routeRequest.mode]);

  // Emit route_generated_not_started if user leaves without pressing Start Navigation
  useEffect(() => {
    return () => {
      if (!navigationStartedRef.current) {
        const { mode, distanceKm } = routeDataRef.current;
        useAppStore.getState().enqueueTelemetryEvent({
          eventType: 'route_generated_not_started',
          properties: {
            route_mode: mode,
            distance_km: Math.round(distanceKm * 10) / 10,
          },
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, []);

  // ── Mia: extract moderate risk segments for "What to Expect" ──
  const miaModerateSegments = useMemo((): readonly MiaSegmentInfo[] => {
    if (!isMia || miaJourneyLevel > 3 || !selectedRoute) return [];
    return selectedRoute.riskSegments
      .filter((seg) => seg.riskScore >= 3 && seg.riskScore < 8)
      .map((seg) => ({
        streetName: seg.id,
        hasBikeLane: false, // determined server-side in future
        lengthMeters: 0, // not yet available from risk segments
      }));
  }, [isMia, miaJourneyLevel, selectedRoute]);

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
    navigationStartedRef.current = true;

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
        avoidHills: routeRequest.avoidHills,
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
    <View style={styles.metaRow}>
      <Badge
        variant={routePreview?.selectedMode === 'safe' ? 'risk-safe' : 'info'}
        size="md"
      >
        {routePreview?.selectedMode === 'safe' ? 'Safe routing' : 'Fast routing'}
      </Badge>
    </View>
  );

  if (!guardPassed) return null;

  return (
    <>
    <WeatherWarningModal
      warnings={weatherWarnings}
      visible={weatherWarnings.length > 0 && !weatherWarningDismissed}
      onDismiss={() => setWeatherWarningDismissed(true)}
    />
    <ShareOptionsModal
      visible={shareOptionsVisible}
      hideEndpoints={shareHideEndpoints}
      onHideEndpointsChange={setShareHideEndpoints}
      onConfirm={handleShareConfirm}
      onDismiss={() => setShareOptionsVisible(false)}
      shortRouteFallback={shareShortRouteFallback}
      distanceKm={((selectedRoute?.distanceMeters ?? 0) / 1000).toFixed(1)}
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
          a11yContext={{ mode: 'planning' }}
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
                Back
              </Button>
            </View>
            {selectedRoute ? (
              <ShareRouteButton
                variant="icon"
                onPress={handleSharePress}
                disabled={isSharingRoute}
                loading={isSharingRoute}
              />
            ) : null}
            {user ? (
              <Pressable
                style={styles.saveRouteButton}
                onPress={() => setSaveModalVisible(true)}
                accessibilityLabel="Save this route"
                accessibilityRole="button"
              >
                <Ionicons name="bookmark-outline" size={18} color={colors.accent} />
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
        <FadeSlideIn>
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
              <Text style={styles.statValue} numberOfLines={1}>
                ↑{selectedRoute.totalClimbMeters !== null
                  ? Math.round(selectedRoute.totalClimbMeters)
                  : '—'}
              </Text>
              {selectedRoute.totalClimbMeters !== null ? (
                <Text style={styles.statUnit}>m</Text>
              ) : null}
            </View>

          </View>
        </View>
        </FadeSlideIn>
      ) : null}

      {selectedRoute ? (
        <View style={styles.lifeRow}>
          <Ionicons name="heart-outline" size={14} color={colors.accent} />
          <Text style={[styles.statValue, { color: colors.accent }]}>
            +{Math.round(selectedRoute.distanceMeters / 1000 * 0.4 * 30)} min
          </Text>
          <Text style={styles.lifeLabel}>life earned</Text>
        </View>
      ) : null}

      {selectedRoute && selectedRoute.riskSegments.length > 0 ? (
        <RiskDistributionCard riskSegments={selectedRoute.riskSegments} />
      ) : null}

      {/* Mia "What to Expect" — moderate segments preview */}
      {isMia && miaJourneyLevel <= 3 ? (
        <MiaSegmentPreview segments={miaModerateSegments} />
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
              color={routePreview.comparisonLabel.includes('less safe') ? colors.caution : colors.safe}
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
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Switch to safe route"
            >
              {switchingToSafe ? (
                <>
                  <Spinner size={16} />
                  <Text style={styles.switchToSafeText}>Switching to safe route...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={16} color={colors.safe} />
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

      {/* Download for offline — only visible when online */}
      {selectedRoute && isOnline ? (
        <View style={styles.offlineDownloadCard}>
          {isRouteOfflineReady || offlineDownloadStatus === 'complete' ? (
            <View style={styles.offlineReadyRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.safe} />
              <Text style={styles.offlineReadyText}>Available offline</Text>
            </View>
          ) : offlineDownloadStatus === 'downloading' ? (
            <View style={styles.offlineDownloadingWrap}>
              <View style={styles.offlineDownloadingRow}>
                <Spinner size={16} />
                <Text style={styles.offlineDownloadingText}>
                  Downloading... {offlineDownloadProgress}%
                </Text>
              </View>
              <View style={styles.offlineProgressTrack}>
                <View
                  style={[
                    styles.offlineProgressFill,
                    { width: `${offlineDownloadProgress}%`, backgroundColor: colors.accent },
                  ]}
                />
              </View>
            </View>
          ) : offlineDownloadStatus === 'error' ? (
            <View style={styles.offlineErrorWrap}>
              <View style={styles.offlineErrorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.offlineErrorText}>
                  {offlineDownloadError ?? 'Download failed'}
                </Text>
              </View>
              <Pressable style={styles.offlineRetryButton} onPress={handleDownloadOffline}>
                <Ionicons name="refresh" size={14} color={colors.accent} />
                <Text style={styles.offlineRetryLabel}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.offlineDownloadButton}
              onPress={handleDownloadOffline}
              accessibilityRole="button"
              accessibilityLabel="Download route for offline use"
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
              <Text style={styles.offlineDownloadLabel}>Download for offline</Text>
            </Pressable>
          )}
        </View>
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
      <Pressable
      style={styles.modalOverlay}
      onPress={() => setSaveModalVisible(false)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel="Dismiss save route dialog"
    >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalAvoidingView}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
          <Text style={styles.modalTitle}>Save Route</Text>
          <TextInput
            style={styles.modalInput}
            value={saveRouteName}
            onChangeText={setSaveRouteName}
            placeholder="Route name (e.g. Morning commute)"
            placeholderTextColor={colors.textMuted}
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
        </KeyboardAvoidingView>
      </Pressable>
    ) : null}

    {/* Save toast */}
    {saveToast ? (
      <View style={styles.toastContainer}>
        <View style={styles.toastPill}>
          <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
          <Text style={styles.toastText}>{saveToast}</Text>
        </View>
      </View>
    ) : null}

    {/* Route-share feedback toast (offline / error) */}
    {shareToastMessage ? (
      <View style={styles.shareToastContainer}>
        <Toast
          message={shareToastMessage}
          variant="info"
          onDismiss={consumeShareToast}
        />
      </View>
    ) : null}
    </>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      color: colors.accent,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    topTitle: {
      ...text2xl,
      color: colors.textPrimary,
    },
    topSubtitle: {
      ...textSm,
      color: colors.textSecondary,
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
      color: colors.accent,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    sheetTitle: {
      ...text2xl,
      fontSize: 26,
      color: colors.textPrimary,
      letterSpacing: -0.7,
    },
    sheetSubtitle: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    summaryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderRadius: radii['2xl'],
      backgroundColor: colors.bgSecondary,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    statGroup: {
      flex: 1,
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space[2],
    },
    stat: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexShrink: 1,
      gap: 2,
    },
    statValue: {
      ...textDataSm,
      fontSize: 15,
      color: colors.textPrimary,
      fontFamily: fontFamily.mono.bold,
    },
    statUnit: {
      ...textXs,
      color: colors.textMuted,
      fontFamily: fontFamily.mono.medium,
    },
    statDivider: {
      ...textSm,
      color: colors.textMuted,
    },
    lifeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[2],
      paddingHorizontal: space[3],
      borderRadius: radii.lg,
      backgroundColor: colors.bgSecondary,
    },
    lifeLabel: {
      ...textSm,
      color: colors.textSecondary,
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
      backgroundColor: colors.cautionTint + '28', // ~16% opacity tint
      padding: space[3],
      gap: 6,
    },
    warningTitle: {
      ...textXs,
      color: colors.caution,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    warningBody: {
      ...textSm,
      fontSize: 13,
      color: colors.textPrimary,
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
      borderColor: colors.borderDefault,
    },
    saveRouteLabel: {
      fontSize: 14,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: surfaceTints.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: zIndex.modal,
    },
    modalAvoidingView: {
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalCard: {
      width: '85%',
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.xl,
      padding: space[5],
      gap: space[3],
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.borderDefault,
      borderRadius: radii.md,
      paddingVertical: space[2],
      paddingHorizontal: space[3],
      fontSize: 15,
      fontFamily: fontFamily.body.regular,
      color: colors.textPrimary,
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
      zIndex: zIndex.toast,
    },
    shareToastContainer: {
      position: 'absolute',
      bottom: 100,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: zIndex.toast,
    },
    toastPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.full,
      paddingVertical: space[2],
      paddingHorizontal: space[4],
      ...shadows.md,
    },
    toastText: {
      fontSize: 14,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    peekStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    peekStat: {
      ...textDataSm,
      fontSize: 16,
      color: colors.textPrimary,
      fontFamily: fontFamily.mono.bold,
    },
    peekDivider: {
      ...textSm,
      color: colors.textMuted,
    },
    peekSpacer: {
      flex: 1,
    },
    peekHint: {
      ...textXs,
      color: colors.textMuted,
      fontFamily: fontFamily.body.regular,
    },
    // -- Offline download --
    offlineDownloadCard: {
      borderRadius: radii.lg,
      backgroundColor: colors.bgSecondary,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    offlineDownloadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    offlineDownloadLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.accent,
    },
    offlineReadyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    offlineReadyText: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.safe,
    },
    offlineDownloadingWrap: {
      gap: space[2],
    },
    offlineDownloadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    offlineDownloadingText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
    },
    offlineProgressTrack: {
      height: 6,
      borderRadius: radii.full,
      backgroundColor: 'rgba(15, 23, 42, 0.12)',
      overflow: 'hidden',
    },
    offlineProgressFill: {
      height: '100%',
      borderRadius: radii.full,
    },
    offlineErrorWrap: {
      gap: space[2],
    },
    offlineErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    offlineErrorText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.danger,
      flex: 1,
    },
    offlineRetryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      alignSelf: 'flex-start',
    },
    offlineRetryLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.accent,
    },
  });
