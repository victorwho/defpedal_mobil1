import type { Coordinate, HazardType } from '@defensivepedal/core';
import {
  AUTO_REROUTE_DELAY_MS,
  HAZARD_TYPE_OPTIONS,
  buildRerouteRequest,
  calculateTrailDistanceMeters,
  getNavigationProgress,
  getPreviewOrigin,
  computeRemainingClimb,
  decodePolyline,
  haversineDistance,
  shouldTriggerAutomaticReroute,
} from '@defensivepedal/core';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useT } from '../src/hooks/useTranslation';
import { RouteMap } from '../src/components/map';
import { Screen } from '../src/components/Screen';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { useBicycleParking } from '../src/hooks/useBicycleParking';
// Bike lanes use Mapbox vector tiles directly
import { useBicycleRental } from '../src/hooks/useBicycleRental';
import { useBikeShops } from '../src/hooks/useBikeShops';
import { usePoiSearch } from '../src/hooks/usePoiSearch';
import { useNearbyHazards } from '../src/hooks/useNearbyHazards';
import { useForegroundNavigationLocation } from '../src/hooks/useForegroundNavigationLocation';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { telemetry } from '../src/lib/telemetry';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

// Design system imports
import { ManeuverCard, FooterCard } from '../src/design-system/organisms/NavigationHUD';

import { ElevationProgressCard } from '../src/design-system/organisms/ElevationProgressCard';
import { HazardAlert } from '../src/design-system/molecules/HazardAlert';
import { Toast } from '../src/design-system/molecules/Toast';
import { Modal } from '../src/design-system/organisms/Modal';
import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { IconButton } from '../src/design-system/atoms/IconButton';
import { useHaptics } from '../src/design-system/hooks/useHaptics';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { brandColors, darkTheme, safetyColors, gray } from '../src/design-system/tokens/colors';
import { fontFamily, textXs, textSm, textBase } from '../src/design-system/tokens/typography';

export default function NavigationScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { user } = useAuthSession();
  const guardPassed = useRouteGuard({
    requiredStates: ['NAVIGATING'],
    condition: () => Boolean(useAppStore.getState().navigationSession),
  });

  const routeRequest = useAppStore((state) => state.routeRequest);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const advanceNavigation = useAppStore((state) => state.advanceNavigation);
  const appendGpsBreadcrumb = useAppStore((state) => state.appendGpsBreadcrumb);
  const updateNavigationProgress = useAppStore((state) => state.updateNavigationProgress);
  const markPreAnnouncement = useAppStore((state) => state.markPreAnnouncement);
  const markApproachAnnouncement = useAppStore((state) => state.markApproachAnnouncement);
  const recordNavigationReroute = useAppStore((state) => state.recordNavigationReroute);
  const syncNavigationRoute = useAppStore((state) => state.syncNavigationRoute);
  const finishNavigation = useAppStore((state) => state.finishNavigation);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const setFollowing = useAppStore((state) => state.setFollowing);
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);
  const poiVisibility = useAppStore((state) => state.poiVisibility);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const activeTripClientId = useAppStore((state) => state.activeTripClientId);
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const shareTripsPublicly = useAppStore((state) => state.shareTripsPublicly);

  const t = useT();

  const locationState = useForegroundNavigationLocation(Boolean(navigationSession));
  const backgroundSnapshot = useBackgroundNavigationSnapshot();
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

  const selectedRoute =
    routePreview?.routes.find((route) => route.id === selectedRouteId) ?? routePreview?.routes[0];

  const routeCoordinates = useMemo(
    () => (selectedRoute ? decodePolyline(selectedRoute.geometryPolyline6) : []),
    [selectedRoute],
  );

  // Query hazards along the entire route, not just near the user
  const routeMidpoint = useMemo(() => {
    if (routeCoordinates.length === 0) return null;
    const mid = routeCoordinates[Math.floor(routeCoordinates.length / 2)];
    return { lat: mid[1], lon: mid[0] };
  }, [routeCoordinates]);

  // Use route midpoint as query center with radius covering the full route
  const hazardQueryCoordinate = routeMidpoint
    ?? locationState.sample?.coordinate
    ?? navigationSession?.lastKnownCoordinate
    ?? (routeRequest.origin.lat !== 0 ? routeRequest.origin : null);

  // Compute radius to cover full route (half the route distance, min 1km, max 10km)
  const hazardRadius = useMemo(() => {
    const routeDist = selectedRoute?.distanceMeters ?? 2000;
    return Math.max(1000, Math.min(10000, routeDist / 2));
  }, [selectedRoute]);

  const { hazards: nearbyHazards } = useNearbyHazards(
    hazardQueryCoordinate,
    Boolean(navigationSession),
    hazardRadius,
  );
  const introAnnouncementKeyRef = useRef<string | null>(null);
  const dismissedHazardIdsRef = useRef<Set<string>>(new Set());
  const [activeHazardAlert, setActiveHazardAlert] = useState<{
    hazard: import('@defensivepedal/core').NearbyHazard;
    distanceMeters: number;
  } | null>(null);

  const currentStep =
    selectedRoute && navigationSession
      ? selectedRoute.steps[navigationSession.currentStepIndex] ?? null
      : null;
  const nextStep =
    selectedRoute && navigationSession
      ? selectedRoute.steps[navigationSession.currentStepIndex + 1] ?? null
      : null;
  const totalSteps = selectedRoute?.steps.length ?? 0;

  const climbData = useMemo(() => {
    const profile = selectedRoute?.elevationProfile;
    if (!profile?.length || !selectedRoute || !navigationSession?.remainingDistanceMeters) {
      return { value: selectedRoute?.totalClimbMeters ?? null, isLive: false };
    }
    return {
      value: computeRemainingClimb(
        profile,
        selectedRoute.distanceMeters,
        navigationSession.remainingDistanceMeters,
      ),
      isLive: true,
    };
  }, [selectedRoute, navigationSession?.remainingDistanceMeters]);

  const totalDescentMeters = useMemo(() => {
    const profile = selectedRoute?.elevationProfile;
    if (!profile || profile.length < 2) return null;
    let descent = 0;
    for (let i = 1; i < profile.length; i++) {
      const diff = profile[i] - profile[i - 1];
      if (diff < 0) descent += Math.abs(diff);
    }
    return Math.round(descent);
  }, [selectedRoute?.elevationProfile]);

  const liveCoordinate =
    locationState.sample?.coordinate ??
    navigationSession?.lastKnownCoordinate ??
    getPreviewOrigin(routeRequest);
  const mapUserCoordinate =
    locationState.sample?.coordinate ?? navigationSession?.lastKnownCoordinate ?? null;
  const offRouteCountdownSeconds =
    navigationSession?.offRouteSince != null
      ? Math.max(
          0,
          Math.ceil(
            (AUTO_REROUTE_DELAY_MS - (Date.now() - Date.parse(navigationSession.offRouteSince))) /
              1000,
          ),
        )
      : null;
  const offRouteDetails =
    navigationSession?.rerouteEligible &&
    navigationSession.lastSnappedCoordinate &&
    mapUserCoordinate
      ? {
          user: mapUserCoordinate,
          snapped: navigationSession.lastSnappedCoordinate,
        }
      : null;
  const hasQueuedTripEnd = queuedMutations.some(
    (mutation) =>
      mutation.type === 'trip_end' &&
      (mutation.payload as { clientTripId?: string }).clientTripId === activeTripClientId,
  );
  const pendingQueueCount = queuedMutations.length;
  const [hazardBanner, setHazardBanner] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [hazardPickerOpen, setHazardPickerOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showElevationProgress, setShowElevationProgress] = useState(false);
  const hazardBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hazardTypeLabels = HAZARD_TYPE_OPTIONS.reduce<Record<HazardType, string>>(
    (accumulator, option) => {
      accumulator[option.value] = option.label;
      return accumulator;
    },
    {} as Record<HazardType, string>,
  );

  const showHazardBanner = (
    tone: 'success' | 'warning' | 'error',
    message: string,
  ) => {
    if (hazardBannerTimeoutRef.current) {
      clearTimeout(hazardBannerTimeoutRef.current);
    }

    setHazardBanner({
      tone,
      message,
    });

    hazardBannerTimeoutRef.current = setTimeout(() => {
      setHazardBanner(null);
      hazardBannerTimeoutRef.current = null;
    }, 3000);
  };

  const queueTripEnd = (reason: 'completed' | 'stopped') => {
    if (!activeTripClientId || hasQueuedTripEnd) {
      return;
    }

    const endedAt = new Date().toISOString();

    enqueueMutation('trip_end', {
      clientTripId: activeTripClientId,
      endedAt,
      reason,
    });

    // Queue GPS trail + route recording
    if (navigationSession && selectedRoute) {
      const store = useAppStore.getState();
      enqueueMutation('trip_track', {
        clientTripId: activeTripClientId,
        routingMode: (routePreview?.selectedMode as 'safe' | 'fast') ?? 'fast',
        plannedRoutePolyline6: selectedRoute.geometryPolyline6,
        plannedRouteDistanceMeters: selectedRoute.distanceMeters,
        gpsBreadcrumbs: navigationSession.gpsBreadcrumbs,
        endReason: reason,
        startedAt: navigationSession.startedAt,
        endedAt,
        bikeType: store.bikeType ?? undefined,
        aqiAtStart: null, // TODO: capture AQI at navigation start
      });
    }

    // Auto-share to community feed if enabled
    if (shareTripsPublicly && navigationSession && selectedRoute) {
      const durationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(navigationSession.startedAt).getTime()) / 1000,
      );
      const actualDistance = navigationSession.gpsBreadcrumbs.length >= 2
        ? calculateTrailDistanceMeters(navigationSession.gpsBreadcrumbs)
        : selectedRoute.distanceMeters;
      enqueueMutation('trip_share', {
        startLocationText: routeRequest.origin.lat.toFixed(4) + ', ' + routeRequest.origin.lon.toFixed(4),
        destinationText: routeRequest.destination.lat.toFixed(4) + ', ' + routeRequest.destination.lon.toFixed(4),
        distanceMeters: actualDistance,
        durationSeconds,
        elevationGainMeters: selectedRoute.totalClimbMeters,
        geometryPolyline6: selectedRoute.geometryPolyline6,
        safetyTags: [],
        startCoordinate: { lat: routeRequest.origin.lat, lon: routeRequest.origin.lon },
      });
    }

    telemetry.capture('trip_end_queued', {
      reason,
      signed_in: Boolean(user),
      breadcrumbs: navigationSession?.gpsBreadcrumbs.length ?? 0,
    });
  };

  const queueHazardReport = (hazardType: HazardType) => {
    if (!mapUserCoordinate) {
      showHazardBanner('error', 'Cannot report hazard because GPS is unavailable.');
      return;
    }

    haptics.medium();
    setHazardPickerOpen(false);
    enqueueMutation('hazard', {
      coordinate: mapUserCoordinate,
      reportedAt: new Date().toISOString(),
      source: 'in_ride',
      hazardType,
    });
    telemetry.capture('hazard_report_queued', {
      source: 'manual',
      hazard_type: hazardType,
      signed_in: Boolean(user),
    });
    showHazardBanner(
      user ? 'success' : 'warning',
      user
        ? `${hazardTypeLabels[hazardType]} recorded and will sync automatically.`
        : `${hazardTypeLabels[hazardType]} recorded. It will sync anonymously when the API is reachable.`,
    );
  };

  const openHazardPicker = () => {
    if (!mapUserCoordinate) {
      showHazardBanner('error', 'Cannot report hazard because GPS is unavailable.');
      return;
    }

    setHazardPickerOpen(true);
  };

  const speak = useCallback((message: string) => {
    if (!navigationSession || !voiceGuidanceEnabled || navigationSession.isMuted) {
      return;
    }

    void Speech.stop();
    Speech.speak(message, {
      language: routeRequest.locale,
    });
  }, [navigationSession, voiceGuidanceEnabled, routeRequest.locale]);

  const toggleVoiceGuidance = () => {
    const nextEnabled = !voiceGuidanceEnabled;
    setVoiceGuidanceEnabled(nextEnabled);

    if (!nextEnabled) {
      void Speech.stop();
      return;
    }

    if (currentStep) {
      Speech.speak(currentStep.instruction, {
        language: routeRequest.locale,
      });
    }
  };

  const rerouteMutation = useMutation({
    mutationFn: (origin: Coordinate) =>
      mobileApi.reroute(buildRerouteRequest(routeRequest, selectedRoute?.id, origin, routeCoordinates)),
    onMutate: () => {
      recordNavigationReroute();
      telemetry.capture('reroute_requested', {
        route_id: selectedRoute?.id ?? 'unknown',
        mode: routeRequest.mode,
      });
    },
    onSuccess: (response) => {
      const nextRouteId = response.routes[0]?.id ?? null;
      setRoutePreview(response, {
        preferredRouteId: nextRouteId,
      });

      if (nextRouteId) {
        syncNavigationRoute(nextRouteId);
      }

      telemetry.capture('reroute_succeeded', {
        mode: response.selectedMode,
        route_count: response.routes.length,
        next_route_id: nextRouteId ?? 'none',
      });
    },
    onError: (error) => {
      telemetry.capture('reroute_failed', {
        route_id: selectedRoute?.id ?? 'unknown',
        mode: routeRequest.mode,
      });
      telemetry.captureError(error, {
        feature: 'reroute',
        route_id: selectedRoute?.id ?? 'unknown',
        mode: routeRequest.mode,
      });
    },
  });

  useEffect(() => {
    return () => {
      if (hazardBannerTimeoutRef.current) {
        clearTimeout(hazardBannerTimeoutRef.current);
      }
      void Speech.stop();
    };
  }, []);

  // ── Hazard proximity detection ──
  useEffect(() => {
    const userCoord = locationState.sample?.coordinate;
    if (!userCoord || nearbyHazards.length === 0) return;

    const ALERT_RADIUS_M = 70;
    const DISMISS_RADIUS_M = 105;

    // Check if active alert should be dismissed (user passed it)
    if (activeHazardAlert) {
      const dist = haversineDistance(
        [userCoord.lat, userCoord.lon],
        [activeHazardAlert.hazard.lat, activeHazardAlert.hazard.lon],
      );
      if (dist > DISMISS_RADIUS_M) {
        // User passed without responding — queue 'pass'
        mobileApi.validateHazard(activeHazardAlert.hazard.id, 'pass').catch(() => {});
        dismissedHazardIdsRef.current.add(activeHazardAlert.hazard.id);
        setActiveHazardAlert(null);
      }
      return; // Don't check for new alerts while one is active
    }

    // Find closest non-dismissed hazard within alert radius
    for (const hazard of nearbyHazards) {
      if (dismissedHazardIdsRef.current.has(hazard.id)) continue;
      const dist = haversineDistance(
        [userCoord.lat, userCoord.lon],
        [hazard.lat, hazard.lon],
      );
      if (dist <= ALERT_RADIUS_M) {
        setActiveHazardAlert({ hazard, distanceMeters: Math.round(dist) });
        break;
      }
    }
  }, [locationState.sample, nearbyHazards, activeHazardAlert]);

  useEffect(() => {
    if (!navigationSession || !selectedRoute || navigationSession.isMuted) {
      return;
    }

    const firstStep = selectedRoute.steps[navigationSession.currentStepIndex] ?? null;

    if (!firstStep) {
      return;
    }

    const announcementKey = `${navigationSession.sessionId}:${selectedRoute.id}:${firstStep.id}`;

    if (introAnnouncementKeyRef.current === announcementKey) {
      return;
    }

    introAnnouncementKeyRef.current = announcementKey;
    speak(firstStep.instruction);
  }, [
    navigationSession?.sessionId,
    navigationSession?.isMuted,
    navigationSession?.currentStepIndex,
    selectedRoute?.id,
    speak,
  ]);

  useEffect(() => {
    if (!selectedRoute || !locationState.sample) {
      return;
    }

    const session = useAppStore.getState().navigationSession;

    if (!session) {
      return;
    }

    const progress = getNavigationProgress(
      selectedRoute,
      session,
      locationState.sample.coordinate,
      locationState.sample.accuracyMeters ?? 0,
    );

    updateNavigationProgress(locationState.sample, progress);
    appendGpsBreadcrumb(locationState.sample);

    const activeStep = selectedRoute.steps[progress.currentStepIndex] ?? null;

    if (progress.shouldPreAnnounce && activeStep) {
      markPreAnnouncement(activeStep.id);
      const dist = Math.round(progress.distanceToManeuverMeters ?? 200);
      speak(`In ${dist} meters, ${activeStep.instruction}`);
    }

    if (progress.shouldAnnounceApproach && activeStep) {
      markApproachAnnouncement(activeStep.id);
      speak(`In 50 meters, ${activeStep.instruction}`);
    }

    if (progress.shouldAdvanceStep && activeStep) {
      speak(activeStep.instruction);
      advanceNavigation(selectedRoute.steps.length);
    }

    if (progress.shouldCompleteNavigation) {
      queueTripEnd('completed');
      telemetry.capture('navigation_completed', {
        route_id: selectedRoute.id,
        session_id: navigationSession?.sessionId ?? 'unknown',
      });
      speak(t('nav.arrived'));
      finishNavigation();
      router.replace('/feedback');
    }
  }, [
    activeTripClientId,
    advanceNavigation,
    appendGpsBreadcrumb,
    enqueueMutation,
    finishNavigation,
    hasQueuedTripEnd,
    locationState.sample,
    markPreAnnouncement,
    markApproachAnnouncement,
    navigationSession?.sessionId,
    selectedRoute,
    speak,
    updateNavigationProgress,
  ]);

  // Announce ETA every 5 minutes
  useEffect(() => {
    if (!navigationSession || !voiceGuidanceEnabled || navigationSession.isMuted) return;

    const interval = setInterval(() => {
      const session = useAppStore.getState().navigationSession;
      if (!session || session.state !== 'navigating') return;
      const remaining = session.remainingDurationSeconds ?? 0;
      if (remaining <= 0) return;

      const mins = Math.round(remaining / 60);
      if (mins < 1) return;
      speak(mins === 1 ? t('nav.minutesRemaining_one') : t('nav.minutesRemaining_other', { count: mins }));
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [navigationSession?.sessionId, voiceGuidanceEnabled, navigationSession?.isMuted, speak]);

  useEffect(() => {
    if (
      !navigationSession ||
      !selectedRoute ||
      !locationState.sample ||
      rerouteMutation.isPending ||
      !shouldTriggerAutomaticReroute(navigationSession)
    ) {
      return;
    }

    rerouteMutation.mutate(locationState.sample.coordinate);
  }, [locationState.sample, navigationSession, rerouteMutation, selectedRoute]);

  if (!selectedRoute || !navigationSession) {
    return (
      <Screen
        title="Navigate"
        eyebrow="Active ride"
        subtitle="Start from route preview to enter the live turn-by-turn shell."
      >
        <View
          style={{
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: `${safetyColors.caution}59`,
            backgroundColor: `${safetyColors.cautionTint}18`,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text style={[textXs, { color: safetyColors.cautionText, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: fontFamily.body.bold }]}>
            No active navigation
          </Text>
          <Text style={[textBase, { color: darkTheme.textSecondary }]}>
            Start a route preview first so the navigation session has a selected route and steps.
          </Text>
        </View>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => {
            router.replace('/route-preview');
          }}
        >
          Return to preview
        </Button>
      </Screen>
    );
  }

  const gpsChipLabel =
    locationState.permissionStatus === 'granted'
      ? t('nav.gpsLive')
      : `GPS ${locationState.permissionStatus}`;
  const syncChipLabel = user ? `${t('nav.syncOn')} \u00b7 ${pendingQueueCount}` : t('nav.anonymousRide');
  const progressChipLabel = t('nav.step', { current: navigationSession.currentStepIndex + 1, total: Math.max(totalSteps, 1) });
  const bgChipLabel = `BG ${backgroundSnapshot.status.status}`;

  const warningMessage = locationState.error
    ? locationState.error
    : rerouteMutation.isError
      ? rerouteMutation.error.message
      : navigationSession.rerouteEligible
        ? rerouteMutation.isPending
          ? t('nav.rerouting')
          : offRouteCountdownSeconds !== null && offRouteCountdownSeconds > 0
            ? t('nav.offRouteCountdown', { seconds: offRouteCountdownSeconds })
            : t('nav.offRouteReady')
        : null;

  const warningAction = locationState.error
    ? { label: t('nav.retryGps'), handler: () => void locationState.refreshLocation() }
    : navigationSession.rerouteEligible &&
        !rerouteMutation.isPending &&
        mobileEnv.mobileApiUrl &&
        locationState.sample
      ? { label: t('nav.rerouteNow'), handler: () => rerouteMutation.mutate(locationState.sample!.coordinate) }
      : null;

  if (!guardPassed) return null;

  return (
    <View style={styles.screen}>
      <RouteMap
        routes={routePreview?.routes}
        selectedRouteId={selectedRouteId}
        origin={liveCoordinate}
        destination={routeRequest.destination}
        userLocation={mapUserCoordinate}
        followUser={navigationSession.isFollowing}
        offRouteDetails={offRouteDetails}
        fullBleed
        showRouteOverlay={false}
        bicycleParkingLocations={parkingLocations}
        bicycleRentalLocations={rentalLocations}
        bikeShopLocations={bikeShopLocations}
        searchedPois={searchedPois}
        showBicycleLanes
        poiVisibility={poiVisibility}
        nearbyHazards={nearbyHazards}
      />

      <View style={[styles.overlayRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]} pointerEvents="box-none">
        {/* ── Top: maneuver card only ── */}
        <View style={styles.topCluster} pointerEvents="box-none">
          <ManeuverCard
            currentStep={currentStep}
            distanceToManeuverMeters={navigationSession.distanceToManeuverMeters ?? null}
            onPress={() => { if (currentStep) speak(currentStep.instruction); }}
          />

          {warningMessage ? (
            <View style={[styles.warningBanner, shadows.md]}>
              <Text style={[textSm, styles.warningBannerText]}>{warningMessage}</Text>
              {warningAction ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={warningAction.handler}
                >
                  {warningAction.label}
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ── Floating control rail (right side) ── */}
        <View style={styles.floatingControlRail}>
          {/* Recenter / Free map — round gray button with GPS icon */}
          <View
            style={styles.roundButton}
            accessible
            accessibilityRole="button"
            accessibilityLabel={navigationSession.isFollowing ? 'Free map' : 'Recenter'}
          >
            <IconButton
              icon={
                <Ionicons
                  name={navigationSession.isFollowing ? 'navigate' : 'navigate-outline'}
                  size={22}
                  color={navigationSession.isFollowing ? darkTheme.accent : gray[300]}
                />
              }
              onPress={() => {
                setFollowing(!(navigationSession.isFollowing ?? true));
              }}
              accessibilityLabel={navigationSession.isFollowing ? 'Free map' : 'Recenter'}
              variant="secondary"
            />
          </View>

          <View style={styles.roundButton}>
            <VoiceGuidanceButton
              enabled={voiceGuidanceEnabled}
              onPress={toggleVoiceGuidance}
              compact
            />
          </View>

          <View style={styles.hazardFab}>
            <IconButton
              icon={<Ionicons name="warning" size={26} color={darkTheme.textInverse} />}
              onPress={openHazardPicker}
              accessibilityLabel="Report hazard"
              variant="accent"
            />
          </View>

          {/* Elevation progress toggle */}
          {selectedRoute?.elevationProfile?.length ? (
            <View style={styles.roundButton}>
              <IconButton
                icon={<Ionicons name={showElevationProgress ? 'analytics' : 'analytics-outline'} size={22} color={showElevationProgress ? brandColors.accent : gray[300]} />}
                onPress={() => setShowElevationProgress((prev) => !prev)}
                accessibilityLabel={showElevationProgress ? 'Hide elevation' : 'Show elevation'}
                variant="secondary"
              />
            </View>
          ) : null}

          {/* Menu toggle + expanded nav icons */}
          {showMenu ? (
            <>
              <View style={styles.roundButton}>
                <IconButton
                  icon={<Ionicons name="time-outline" size={22} color={gray[300]} />}
                  onPress={() => { setShowMenu(false); router.push('/history'); }}
                  accessibilityLabel="History"
                  variant="secondary"
                />
              </View>
              <View style={styles.roundButton}>
                <IconButton
                  icon={<Ionicons name="people-outline" size={22} color={gray[300]} />}
                  onPress={() => { setShowMenu(false); router.push('/community'); }}
                  accessibilityLabel="Community"
                  variant="secondary"
                />
              </View>
              <View style={styles.roundButton}>
                <IconButton
                  icon={<Ionicons name="person-outline" size={22} color={gray[300]} />}
                  onPress={() => { setShowMenu(false); router.push('/profile'); }}
                  accessibilityLabel="Profile"
                  variant="secondary"
                />
              </View>
            </>
          ) : null}
          <View style={styles.roundButton}>
            <IconButton
              icon={<Ionicons name={showMenu ? 'close' : 'menu'} size={22} color={gray[300]} />}
              onPress={() => setShowMenu((prev) => !prev)}
              accessibilityLabel={showMenu ? 'Hide menu' : 'Show menu'}
              variant="secondary"
            />
          </View>

          {/* End ride — round gray button with X icon */}
          <View style={styles.roundButton}>
            <IconButton
              icon={<Ionicons name="close" size={22} color={gray[300]} />}
              onPress={() => {
                queueTripEnd('stopped');
                telemetry.capture('navigation_stopped', {
                  route_id: selectedRoute.id,
                  session_id: navigationSession.sessionId,
                });
                finishNavigation();
                router.push('/feedback');
              }}
              accessibilityLabel={t('nav.endRide')}
              variant="secondary"
            />
          </View>
        </View>

        {/* ── Bottom: elevation progress + "then" strip + metrics ── */}
        <View style={styles.bottomCluster} pointerEvents="box-none">
          {showElevationProgress && selectedRoute?.elevationProfile?.length ? (
            <ElevationProgressCard
              elevationProfile={selectedRoute.elevationProfile}
              totalDistanceMeters={selectedRoute.distanceMeters}
              remainingDistanceMeters={
                navigationSession.remainingDistanceMeters ?? selectedRoute.distanceMeters
              }
              isOffRoute={offRouteDetails !== null}
            />
          ) : null}
          <FooterCard
            nextStep={nextStep}
            remainingDurationSeconds={Math.round(
              navigationSession.remainingDurationSeconds ?? selectedRoute.adjustedDurationSeconds,
            )}
            remainingDistanceMeters={
              navigationSession.remainingDistanceMeters ?? selectedRoute.distanceMeters
            }
            totalClimbMeters={climbData.value}
            totalDescentMeters={totalDescentMeters}
            isClimbLive={climbData.isLive}
            speedKmh={
              locationState.sample?.speedMetersPerSecond != null
                ? locationState.sample.speedMetersPerSecond * 3.6
                : null
            }
          />
        </View>
      </View>

      {/* Waze-style hazard proximity alert */}
      {activeHazardAlert ? (
        <HazardAlert
          hazard={activeHazardAlert.hazard}
          distanceMeters={activeHazardAlert.distanceMeters}
          onConfirm={() => {
            mobileApi.validateHazard(activeHazardAlert.hazard.id, 'confirm').catch(() => {});
            dismissedHazardIdsRef.current.add(activeHazardAlert.hazard.id);
            setActiveHazardAlert(null);
          }}
          onDeny={() => {
            mobileApi.validateHazard(activeHazardAlert.hazard.id, 'deny').catch(() => {});
            dismissedHazardIdsRef.current.add(activeHazardAlert.hazard.id);
            setActiveHazardAlert(null);
          }}
        />
      ) : null}

      {/* Hazard toast notification */}
      {hazardBanner ? (
        <View style={styles.toastContainer}>
          <Toast
            message={hazardBanner.message}
            variant={hazardBanner.tone}
            durationMs={3000}
            onDismiss={() => {
              setHazardBanner(null);
              if (hazardBannerTimeoutRef.current) {
                clearTimeout(hazardBannerTimeoutRef.current);
                hazardBannerTimeoutRef.current = null;
              }
            }}
          />
        </View>
      ) : null}

      {/* Hazard quick-pick grid overlay */}
      {hazardPickerOpen ? (
        <Pressable
          style={styles.hazardGridOverlay}
          onPress={() => setHazardPickerOpen(false)}
        >
          <Pressable style={styles.hazardGridCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.hazardGridTitle}>Report hazard</Text>
            <View style={styles.hazardGrid}>
              {([
                { value: 'illegally_parked_car' as HazardType, label: 'Parked car', icon: 'car-outline' as const },
                { value: 'blocked_bike_lane' as HazardType, label: 'Blocked lane', icon: 'remove-circle-outline' as const },
                { value: 'pothole' as HazardType, label: 'Pothole', icon: 'alert-circle-outline' as const },
                { value: 'construction' as HazardType, label: 'Construction', icon: 'construct-outline' as const },
                { value: 'aggressive_traffic' as HazardType, label: 'Aggro traffic', icon: 'speedometer-outline' as const },
                { value: 'other' as HazardType, label: 'Other', icon: 'ellipsis-horizontal' as const },
              ]).map((item) => (
                <Pressable
                  key={item.value}
                  style={({ pressed }) => [
                    styles.hazardGridItem,
                    pressed && styles.hazardGridItemPressed,
                  ]}
                  onPress={() => queueHazardReport(item.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${item.label}`}
                >
                  <Ionicons name={item.icon} size={24} color={brandColors.accent} />
                  <Text style={styles.hazardGridLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.hazardGridCancel}
              onPress={() => setHazardPickerOpen(false)}
            >
              <Text style={styles.hazardGridCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[4],
  },
  topCluster: {
    gap: space[3],
  },
  bottomCluster: {
    gap: space[3],
  },
  warningBanner: {
    borderRadius: radii.xl,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[3],
  },
  warningBannerText: {
    color: darkTheme.textPrimary,
    fontFamily: fontFamily.body.bold,
  },
  floatingControlRail: {
    position: 'absolute',
    right: space[3],
    top: '38%',
    transform: [{ translateY: -120 }],
    width: 80,
    gap: space[2],
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: space[8],
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hazardGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    paddingHorizontal: space[4],
    paddingBottom: space[8],
    zIndex: 50,
  },
  hazardGridCard: {
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii['2xl'],
    padding: space[4],
    gap: space[3],
    ...shadows.lg,
  },
  hazardGridTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.semiBold,
    color: darkTheme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
    textAlign: 'center',
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  hazardGridItem: {
    width: '31%' as unknown as number,
    alignItems: 'center',
    gap: space[1],
    backgroundColor: darkTheme.bgSecondary,
    borderRadius: radii.lg,
    paddingVertical: space[3],
    paddingHorizontal: space[1],
  },
  hazardGridItemPressed: {
    backgroundColor: darkTheme.bgTertiary,
  },
  hazardGridLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  hazardGridCancel: {
    alignItems: 'center',
    paddingVertical: space[2],
  },
  hazardGridCancelText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textMuted,
  },
  hazardFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: brandColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: gray[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
