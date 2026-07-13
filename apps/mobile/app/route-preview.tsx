import type { RiskSegment } from '@defensivepedal/core';
import { getPreviewOrigin, hasStartOverride } from '@defensivepedal/core';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';

import { useBicycleParking } from '../src/hooks/useBicycleParking';
// Bike lanes use Mapbox vector tiles directly
import { useBicycleRental } from '../src/hooks/useBicycleRental';
import { useBikeShops } from '../src/hooks/useBikeShops';
import { usePoiSearch } from '../src/hooks/usePoiSearch';
import { useLockOrientation } from '../src/hooks/useLockOrientation';
import { useResolvedCountry } from '../src/hooks/useResolvedCountry';
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
import { withErrorBoundary } from '../src/design-system/organisms/ErrorBoundary';
import { RiskDistributionCard } from '../src/design-system/organisms/RiskDistributionCard';
import { WeatherWarningModal } from '../src/design-system/molecules/WeatherWarningModal';
import { ShareOptionsModal } from '../src/design-system/molecules/ShareOptionsModal';
import { Toast } from '../src/design-system/molecules/Toast';
import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { Spinner } from '../src/design-system/atoms/Spinner';
import { FadeSlideIn } from '../src/design-system/atoms/FadeSlideIn';
import { PressableScale } from '../src/design-system/atoms/PressableScale';
import { ShareRouteButton } from '../src/design-system/atoms/ShareRouteButton';
import { useShareRoute } from '../src/hooks/useShareRoute';
import { useT } from '../src/hooks/useTranslation';
import { useTheme, type ThemeColors } from '../src/design-system';
import { safetyTints, surfaceTints } from '../src/design-system/tokens/tints';
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

const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};
const formatCoordinateLabel = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

function RoutePreviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { user } = useAuthSession();
  const t = useT();
  // Allow IDLE (initial load), ROUTE_PREVIEW (routes loaded), and NAVIGATING
  // (brief transitional state while router.push('/navigation') is in flight).
  // Without NAVIGATING here, the guard fires router.replace('/route-planning')
  // before the push to /navigation completes, winning the race.
  const guardPassed = useRouteGuard({
    requiredStates: ['IDLE', 'ROUTE_PREVIEW', 'NAVIGATING'],
  });
  useLockOrientation();
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
  const setRoutingMode = useAppStore((state) => state.setRoutingMode);
  const setAvoidHills = useAppStore((state) => state.setAvoidHills);
  const resolvedCountry = useResolvedCountry();

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
  const appState = useAppStore((state) => state.appState);

  // Re-arm the one-shot start lock whenever this screen regains focus
  // (error-log #36 pattern). Expo Router keeps route-preview mounted under
  // the pushed /navigation screen, so without this an iOS swipe-back (or any
  // pop) landed on a preview whose Start button was permanently dead — the
  // ref stayed true from the first start (review 2026-06-12, P1 #2).
  useFocusEffect(
    useCallback(() => {
      navigationStartedRef.current = false;
    }, []),
  );

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
  const weatherWarningSeenThisSession = useAppStore((state) => state.weatherWarningSeenThisSession);
  const markWeatherWarningSeen = useAppStore((state) => state.markWeatherWarningSeen);
  // Snapshot the session flag at mount so marking it seen (below) doesn't
  // retroactively hide the modal that's currently up. If the warning was
  // already shown earlier this session, this screen instance never presents
  // it — so it appears once per session, not on every route calculation
  // (route-preview remounts per calc, which is why the old screen-local
  // dismissed flag re-showed it every time).
  const weatherWarningAllowedRef = useRef(!weatherWarningSeenThisSession);
  const [switchingToSafe, setSwitchingToSafe] = useState(false);
  const isFocused = useIsFocused();
  const previewSuccessRef = useRef<number>(0);
  const previewErrorRef = useRef<number>(0);

  const showWeatherWarning =
    isFocused &&
    weatherWarnings.length > 0 &&
    weatherWarningAllowedRef.current &&
    !weatherWarningDismissed;

  // Mark the warning seen the first time it actually appears this session, so
  // a later route calculation (a fresh route-preview mount) won't re-show it —
  // even if the user leaves without tapping "Start anyway".
  useEffect(() => {
    if (showWeatherWarning) markWeatherWarningSeen();
  }, [showWeatherWarning, markWeatherWarningSeen]);

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
    // A ride is already running — the rider backed out of /navigation (system
    // back / swipe-back) onto this still-mounted preview. Don't enqueue a
    // second trip_start; just return to the HUD (review 2026-06-12, P1 #2).
    if (appState === 'NAVIGATING') {
      router.push('/navigation');
      return;
    }
    // Double-tap guard. A second tap before React re-renders would otherwise
    // enqueue a duplicate trip_start with a fresh clientTripId, orphaning the
    // first one (server-side idempotency keys on user_id+client_trip_id, so
    // distinct clientTripIds = distinct trips even though the rider perceives
    // a single ride). This ref is set before any side effect below.
    if (navigationStartedRef.current) {
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

  // ── Tap-to-cycle routing mode (Safe → Fast → Flat → Safe) ──
  // Mirrors the 3-way ModeTogglePill row on route-planning so the user can
  // switch profiles directly from the preview without going back. Changing
  // `routeRequest.mode` and/or `avoidHills` invalidates the previewQuery key
  // (`effectiveRequest`), which triggers an automatic refetch.
  type RoutingDisplay = 'safe' | 'fast' | 'flat';
  const currentDisplayMode: RoutingDisplay =
    routeRequest.mode === 'fast' ? 'fast' : avoidHills ? 'flat' : 'safe';

  const modeDisplay: Record<
    RoutingDisplay,
    {
      label: string;
      variant: 'risk-safe' | 'info' | 'accent';
      next: RoutingDisplay;
    }
  > = {
    safe: { label: t('planning.safe'), variant: 'risk-safe', next: 'fast' },
    fast: { label: t('planning.fast'), variant: 'info', next: 'flat' },
    flat: { label: t('planning.flat'), variant: 'accent', next: 'safe' },
  };

  const cycleRoutingMode = useCallback(() => {
    // Cancel any speech triggered by an earlier mode preview before switching.
    void Speech.stop();
    if (currentDisplayMode === 'safe') {
      setAvoidHills(false);
      setRoutingMode('fast');
    } else if (currentDisplayMode === 'fast') {
      setAvoidHills(true);
      setRoutingMode('safe');
    } else {
      setAvoidHills(false);
      setRoutingMode('safe');
    }
  }, [currentDisplayMode, setAvoidHills, setRoutingMode]);

  const isCyclingMode = previewQuery.isFetching;
  // Outside the covered countries (EU-27 + EEA + CH) we only have Mapbox
  // fast routing — the cycle pill becomes a passive label so taps don't kick
  // the request through unavailable Safe/Flat profiles. The route-planning
  // gate already forced mode to fast.
  const modeCycleDisabled = isCyclingMode || !resolvedCountry.routeSupported;
  const currentMode = modeDisplay[currentDisplayMode];
  const nextMode = modeDisplay[currentMode.next];

  // Single source of truth for the tappable badge — reused in 3 placements
  // (top overlay, collapsed peek strip, expanded summary strip). hitSlop
  // brings the ~28pt Badge surface up to the 44pt minimum touch target.
  const renderModeCyclePill = (longLabel: boolean) => (
    <PressableScale
      onPress={cycleRoutingMode}
      accessibilityRole="button"
      accessibilityLabel={t('preview.modeCycleA11y', { current: currentMode.label, next: nextMode.label })}
      accessibilityHint={t('preview.modeCycleHint')}
      hapticOnPress="snap"
      hitSlop={8}
      disabled={modeCycleDisabled}
    >
      <Badge
        variant={currentMode.variant}
        size="md"
        icon={
          isCyclingMode ? (
            <Spinner size={16} accessibilityLabel={t('preview.recomputingA11y')} />
          ) : (
            <Ionicons
              name="swap-horizontal"
              size={12}
              color={colors.textPrimary}
            />
          )
        }
      >
        {longLabel ? t('preview.modeRoutingLong', { mode: currentMode.label }) : currentMode.label}
      </Badge>
    </PressableScale>
  );

  const topOverlay = <View style={styles.metaRow}>{renderModeCyclePill(true)}</View>;

  if (!guardPassed) return null;

  return (
    <>
    <WeatherWarningModal
      warnings={weatherWarnings}
      visible={showWeatherWarning}
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
          {renderModeCyclePill(false)}
          <Text style={styles.peekStat}>
            {(selectedRoute.distanceMeters / 1000).toFixed(1)} km
          </Text>
          <Text style={styles.peekDivider}>·</Text>
          <Text style={styles.peekStat}>
            {formatDuration(selectedRoute.adjustedDurationSeconds)}
          </Text>
          <View style={styles.peekSpacer} />
          <Text style={styles.peekHint}>{t('preview.peekSwipeUp')}</Text>
        </View>
      ) : null}
      map={
        <RouteMap
          routes={routePreview?.routes}
          selectedRouteId={selectedRouteId}
          origin={previewOrigin}
          destination={routeRequest.destination}
          waypoints={routeRequest.waypoints}
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
            {appState === 'NAVIGATING'
              ? t('preview.returnToNavigation')
              : selectedRoute
                ? t('preview.startNavigation')
                : t('preview.noRouteSelected')}
          </Button>
          <View style={styles.footerSecondaryRow}>
            <View style={styles.footerSecondaryButton}>
              <Button variant="secondary" size="md" fullWidth onPress={returnToPlanning}>
                {t('common.back')}
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
                accessibilityLabel={t('preview.saveRouteA11y')}
                accessibilityRole="button"
              >
                <Ionicons name="bookmark-outline" size={18} color={colors.accent} />
                <Text style={styles.saveRouteLabel}>{t('common.save')}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      }
    >
      {previewQuery.isPending ? (
        <View style={styles.sheetHero}>
          <Spinner size={32} />
          <Text style={styles.sheetEyebrow}>{t('preview.previewLoading')}</Text>
        </View>
      ) : null}

      {previewQuery.isError ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>{t('preview.previewFailed')}</Text>
          {/* Audit 2026-07-05 UX-4: localized copy, not the raw
              Mapbox/OSRM error string. Raw message already goes to Sentry via
              the query layer. */}
          <Text style={styles.warningBody}>{t('preview.previewFailedBody')}</Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              void previewQuery.refetch();
            }}
          >
            {t('preview.retryPreview')}
          </Button>
        </View>
      ) : null}

      {selectedRoute ? (
        <FadeSlideIn>
        <View style={styles.summaryStrip}>
          {renderModeCyclePill(false)}

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
          <Text style={styles.lifeLabel}>{t('preview.lifeEarnedShort')}</Text>
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
              accessibilityLabel={t('preview.switchToSafe')}
            >
              {switchingToSafe ? (
                <>
                  <Spinner size={16} />
                  <Text style={styles.switchToSafeText}>{t('preview.switchingToSafe')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={16} color={colors.safe} />
                  <Text style={styles.switchToSafeText}>{t('preview.switchToSafe')}</Text>
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
              <Text style={styles.offlineReadyText}>{t('preview.availableOffline')}</Text>
            </View>
          ) : offlineDownloadStatus === 'downloading' ? (
            <View style={styles.offlineDownloadingWrap}>
              <View style={styles.offlineDownloadingRow}>
                <Spinner size={16} />
                <Text style={styles.offlineDownloadingText}>
                  {t('preview.downloadingPct', { percent: offlineDownloadProgress })}
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
                  {offlineDownloadError ?? t('preview.downloadFailed')}
                </Text>
              </View>
              <Pressable style={styles.offlineRetryButton} onPress={handleDownloadOffline}>
                <Ionicons name="refresh" size={14} color={colors.accent} />
                <Text style={styles.offlineRetryLabel}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.offlineDownloadButton}
              onPress={handleDownloadOffline}
              accessibilityRole="button"
              accessibilityLabel={t('preview.downloadForOfflineA11y')}
            >
              <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
              <Text style={styles.offlineDownloadLabel}>{t('preview.downloadForOffline')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {isMissingApi ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>{t('preview.missingConfigTitle')}</Text>
          <Text style={styles.warningBody}>{t('preview.missingConfigBody')}</Text>
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>{t('preview.noRoutes')}</Text>
          <Text style={styles.warningBody}>
            {routePreview?.coverage.message ?? t('preview.noRoutesBody')}
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
      accessibilityLabel={t('preview.dismissSaveRouteA11y')}
    >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalAvoidingView}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} accessible={false}>
          <Text style={styles.modalTitle}>{t('preview.saveRouteTitle')}</Text>
          <TextInput
            style={styles.modalInput}
            value={saveRouteName}
            onChangeText={setSaveRouteName}
            placeholder={t('preview.routeName')}
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={100}
          />
          <View style={styles.modalButtonRow}>
            <Button variant="ghost" size="md" onPress={() => setSaveModalVisible(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!saveRouteName.trim() || savingRoute}
              onPress={handleSaveRoute}
            >
              {savingRoute ? t('preview.saving') : t('common.save')}
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
      borderColor: safetyTints.safeBorder,
      backgroundColor: safetyTints.safeLight,
    },
    comparisonText: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.safe,
    },
    comparisonBadgeWarning: {
      borderColor: safetyTints.cautionBorder,
      backgroundColor: safetyTints.cautionLight,
    },
    comparisonTextWarning: {
      color: colors.caution,
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
      borderColor: safetyTints.safeBorderStrong,
      backgroundColor: safetyTints.safeLight,
    },
    switchToSafeText: {
      ...textSm,
      fontFamily: fontFamily.heading.bold,
      color: colors.safe,
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
      backgroundColor: surfaceTints.trackDim,
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

export default withErrorBoundary('route-preview', RoutePreviewScreen);
