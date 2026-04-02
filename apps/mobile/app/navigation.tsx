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
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouteGuard } from '../src/hooks/useRouteGuard';
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
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { brandColors, darkTheme, safetyColors, gray } from '../src/design-system/tokens/colors';
import { fontFamily, textXs, textSm, textBase } from '../src/design-system/tokens/typography';

export default function NavigationScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
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

  // Query hazards along the entire route, not just near the user
  const routeMidpoint = useMemo(() => {
    if (!selectedRoute) return null;
    const coords = decodePolyline(selectedRoute.geometryPolyline6);
    if (coords.length === 0) return null;
    const mid = coords[Math.floor(coords.length / 2)];
    return { lat: mid[1], lon: mid[0] };
  }, [selectedRoute]);

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
      enqueueMutation('trip_track', {
        clientTripId: activeTripClientId,
        routingMode: (routePreview?.selectedMode as 'safe' | 'fast') ?? 'fast',
        plannedRoutePolyline6: selectedRoute.geometryPolyline6,
        plannedRouteDistanceMeters: selectedRoute.distanceMeters,
        gpsBreadcrumbs: navigationSession.gpsBreadcrumbs,
        endReason: reason,
        startedAt: navigationSession.startedAt,
        endedAt,
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

    setHazardPickerOpen(false);
    enqueueMutation('hazard', {
      coordinate: mapUserCoordinate,
      reportedAt: new Date().toISOString(),
      source: 'manual',
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

  const speak = (message: string) => {
    if (!navigationSession || !voiceGuidanceEnabled || navigationSession.isMuted) {
      return;
    }

    void Speech.stop();
    Speech.speak(message, {
      language: routeRequest.locale,
    });
  };

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
      mobileApi.reroute(buildRerouteRequest(routeRequest, selectedRoute?.id, origin)),
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

    const ALERT_RADIUS_M = 100;
    const DISMISS_RADIUS_M = 150;

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
      speak('You have arrived at your destination.');
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
    markApproachAnnouncement,
    navigationSession?.sessionId,
    selectedRoute,
    updateNavigationProgress,
  ]);

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
      ? 'GPS live'
      : `GPS ${locationState.permissionStatus}`;
  const syncChipLabel = user ? `Sync on \u00b7 ${pendingQueueCount}` : 'Anonymous ride';
  const progressChipLabel = `Step ${navigationSession.currentStepIndex + 1}/${Math.max(totalSteps, 1)}`;
  const bgChipLabel = `BG ${backgroundSnapshot.status.status}`;

  const warningMessage = locationState.error
    ? locationState.error
    : rerouteMutation.isError
      ? rerouteMutation.error.message
      : navigationSession.rerouteEligible
        ? rerouteMutation.isPending
          ? 'Requesting a new route from the rider\u2019s live GPS position.'
          : offRouteCountdownSeconds !== null && offRouteCountdownSeconds > 0
            ? `Off route. Automatic reroute will fire in ${offRouteCountdownSeconds}s.`
            : 'Off route. Manual reroute is ready.'
        : null;

  const warningAction = locationState.error
    ? { label: 'Retry GPS', handler: () => void locationState.refreshLocation() }
    : navigationSession.rerouteEligible &&
        !rerouteMutation.isPending &&
        mobileEnv.mobileApiUrl &&
        locationState.sample
      ? { label: 'Reroute now', handler: () => rerouteMutation.mutate(locationState.sample!.coordinate) }
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

          <View style={styles.roundButton}>
            <IconButton
              icon={<Ionicons name="warning" size={22} color={darkTheme.accent} />}
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
              accessibilityLabel="End ride"
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
            isClimbLive={climbData.isLive}
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

      {/* Hazard picker modal */}
      <Modal
        visible={hazardPickerOpen}
        onClose={() => {
          setHazardPickerOpen(false);
        }}
        title="What should we mark here?"
        description="This saves the hazard at your current rider location for later sync."
        footer={
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => {
              setHazardPickerOpen(false);
            }}
          >
            Cancel
          </Button>
        }
      >
        <View style={styles.hazardOptionList}>
          {HAZARD_TYPE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="secondary"
              size="md"
              fullWidth
              leftIcon={
                <View style={styles.hazardOptionIconWrap}>
                  <Ionicons
                    name={option.value === 'other' ? 'ellipsis-horizontal' : 'warning'}
                    size={18}
                    color={darkTheme.accent}
                  />
                </View>
              }
              onPress={() => {
                queueHazardReport(option.value);
              }}
            >
              {option.label}
            </Button>
          ))}
        </View>
      </Modal>

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
    right: space[4],
    top: '38%',
    transform: [{ translateY: -140 }],
    width: 92,
    gap: space[3],
    alignItems: 'center',
  },
  toastContainer: {
    position: 'absolute',
    bottom: space[8],
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hazardOptionList: {
    gap: space[3],
  },
  hazardOptionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: gray[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
