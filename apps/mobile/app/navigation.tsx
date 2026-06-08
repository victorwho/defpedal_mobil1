import type { Coordinate, EarlyEndReason, HazardType } from '@defensivepedal/core';
import {
  AUTO_REROUTE_DELAY_MS,
  buildRerouteRequest,
  calculateTrailDistanceMeters,
  getNavigationProgress,
  getPreviewOrigin,
  computeNextStopProgress,
  computeRemainingClimb,
  computeRemainingDescent,
  computeCurrentGrade,
  decodePolyline,
  haversineDistance,
  shouldTriggerAutomaticReroute,
} from '@defensivepedal/core';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLockOrientation } from '../src/hooks/useLockOrientation';
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
import { useHazardVote } from '../src/hooks/useHazardVote';
import { useForegroundNavigationLocation } from '../src/hooks/useForegroundNavigationLocation';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { cacheActiveRoute, clearCachedRoute, type CachedRouteData } from '../src/lib/offlineRouteCache';
import { telemetry } from '../src/lib/telemetry';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useConnectivity } from '../src/providers/ConnectivityMonitor';
import { useAppStore } from '../src/store/appStore';
import { useShallow } from 'zustand/shallow';

// Design system imports
import { ManeuverCard, FooterCard, SteepGradeIndicator, type FooterNextStop } from '../src/design-system/organisms/NavigationHUD';

import { ElevationProgressCard } from '../src/design-system/organisms/ElevationProgressCard';
import { withErrorBoundary } from '../src/design-system/organisms/ErrorBoundary';
import { HazardAlert } from '../src/design-system/molecules/HazardAlert';
import { RouteFeatureAlertStack } from '../src/design-system/organisms/RouteFeatureAlertStack';
import { Toast } from '../src/design-system/molecules/Toast';
import { Modal } from '../src/design-system/organisms/Modal';
import {
  EarlyEndReasonModal,
  type EarlyEndReasonOption,
} from '../src/design-system/organisms/EarlyEndReasonModal';
import { Button } from '../src/design-system/atoms/Button';
import { Badge } from '../src/design-system/atoms/Badge';
import { Surface } from '../src/design-system/atoms/Card';
import { IconButton } from '../src/design-system/atoms/IconButton';
import { useHaptics } from '../src/design-system/hooks/useHaptics';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { gray, safetyColors } from '../src/design-system/tokens/colors';
import { fontFamily, textXs, textSm, textBase } from '../src/design-system/tokens/typography';
import { safetyTints, surfaceTints } from '../src/design-system/tokens/tints';
import { zIndex } from '../src/design-system/tokens/zIndex';
import { useTheme, type ThemeColors } from '../src/design-system';

// Stable tag for the screen-keep-awake lock so the activate/deactivate pair
// can't drift across renders or accidentally collide with anyone else's lock.
const KEEP_AWAKE_TAG = 'defensivepedal-navigation';

function NavigationScreen() {
  // Keep the screen on during the entire ride. Replaces the previous
  // useKeepAwake() hook with an explicit activate/deactivate pair so the
  // activation is observably tied to NavigationScreen mount and any native
  // failure surfaces in logs instead of silently letting the screen sleep.
  // Tag is stable per-screen so duplicate activations are deduped at the
  // expo-keep-awake layer.
  useEffect(() => {
    let active = true;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((error: unknown) => {
      // Native module not bound, or activation rejected. Log so the dev
      // overlay shows it; the screen will fall back to OS timeout settings.
      // This is the same defensive pattern we use for other native modules
      // (error-log #21, #23) — we surface the failure rather than fail soft.
      console.warn('[navigation] activateKeepAwake failed', error);
      active = false;
    });
    return () => {
      if (!active) return;
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // Already deactivated or native module gone — nothing to do.
      }
    };
  }, []);

  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const { user } = useAuthSession();
  const guardPassed = useRouteGuard({
    requiredStates: ['NAVIGATING'],
    condition: () => Boolean(useAppStore.getState().navigationSession),
  });
  useLockOrientation();

  const {
    routeRequest,
    voiceGuidanceEnabled,
    routePreview,
    selectedRouteId,
    navigationSession,
    poiVisibility,
    activeTripClientId,
    queuedMutations,
    shareTripsPublicly,
    avoidHills,
    avoidUnpaved,
  } = useAppStore(useShallow((state) => ({
    routeRequest: state.routeRequest,
    voiceGuidanceEnabled: state.voiceGuidanceEnabled,
    routePreview: state.routePreview,
    selectedRouteId: state.selectedRouteId,
    navigationSession: state.navigationSession,
    poiVisibility: state.poiVisibility,
    activeTripClientId: state.activeTripClientId,
    queuedMutations: state.queuedMutations,
    shareTripsPublicly: state.shareTripsPublicly,
    avoidHills: state.avoidHills,
    avoidUnpaved: state.avoidUnpaved,
  })));

  const advanceNavigation = useAppStore((state) => state.advanceNavigation);
  const removeWaypoint = useAppStore((state) => state.removeWaypoint);
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
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);

  const { isOnline } = useConnectivity();
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
    isOnline && Boolean(navigationSession),
    hazardRadius,
  );

  const hazardVote = useHazardVote();

  const introAnnouncementKeyRef = useRef<string | null>(null);
  const offRouteAnnouncedRef = useRef(false);
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
    const isOffRoute = navigationSession?.offRouteSince != null;
    if (isOffRoute) {
      return { value: null, isLive: false };
    }
    const profile = selectedRoute?.elevationProfile;
    if (!profile?.length || !selectedRoute || navigationSession?.remainingDistanceMeters == null) {
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
  }, [selectedRoute, navigationSession?.remainingDistanceMeters, navigationSession?.offRouteSince]);

  const descentData = useMemo(() => {
    const isOffRoute = navigationSession?.offRouteSince != null;
    if (isOffRoute) {
      return null;
    }
    const profile = selectedRoute?.elevationProfile;
    if (!profile || profile.length < 2 || !selectedRoute) return null;
    if (navigationSession?.remainingDistanceMeters == null) {
      // No live progress yet — compute total descent from the full profile
      let descent = 0;
      for (let i = 1; i < profile.length; i++) {
        const diff = profile[i] - profile[i - 1];
        if (diff < 0) descent += Math.abs(diff);
      }
      return Math.round(descent);
    }
    return computeRemainingDescent(
      profile,
      selectedRoute.distanceMeters,
      navigationSession.remainingDistanceMeters,
    );
  }, [selectedRoute, navigationSession?.remainingDistanceMeters, navigationSession?.offRouteSince]);

  const currentGrade = useMemo(() => {
    if (navigationSession?.offRouteSince != null) return null;
    const profile = selectedRoute?.elevationProfile;
    if (!profile || profile.length < 2 || !selectedRoute) return null;
    if (navigationSession?.remainingDistanceMeters == null) return null;
    return computeCurrentGrade(
      profile,
      selectedRoute.distanceMeters,
      navigationSession.remainingDistanceMeters,
    );
  }, [selectedRoute, navigationSession?.remainingDistanceMeters, navigationSession?.offRouteSince]);

  const liveCoordinate =
    locationState.sample?.coordinate ??
    navigationSession?.lastKnownCoordinate ??
    getPreviewOrigin(routeRequest);
  const mapUserCoordinate =
    locationState.sample?.coordinate ?? navigationSession?.lastKnownCoordinate ?? null;

  // Multi-stop: distance/ETA/climb to the NEXT intermediate stop (rather than
  // the final destination). Returns hasNextStop=false for no-stop routes or
  // once every stop is behind, in which case the HUD falls back to totals.
  const nextStopProgress = useMemo(() => {
    if (!selectedRoute || routeCoordinates.length < 2) return null;
    const waypoints = routeRequest.waypoints ?? [];
    if (waypoints.length === 0) return null;
    const loc = mapUserCoordinate;
    if (!loc) return null;
    return computeNextStopProgress(
      {
        distanceMeters: selectedRoute.distanceMeters,
        durationSeconds: selectedRoute.adjustedDurationSeconds ?? selectedRoute.durationSeconds,
        elevationProfile: selectedRoute.elevationProfile,
      },
      routeCoordinates,
      waypoints,
      loc,
    );
  }, [selectedRoute, routeCoordinates, routeRequest.waypoints, mapUserCoordinate]);

  const footerNextStop: FooterNextStop | null =
    nextStopProgress?.hasNextStop
      ? {
          stopIndex: nextStopProgress.stopIndex,
          stopCount: nextStopProgress.stopCount,
          distanceMeters: nextStopProgress.distanceToNextStopMeters,
          durationSeconds: nextStopProgress.durationToNextStopSeconds,
          climbMeters: nextStopProgress.climbToNextStopMeters,
        }
      : null;

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
  const pendingQueueCount = queuedMutations.length;
  const [hazardBanner, setHazardBanner] = useState<{
    tone: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [hazardPickerOpen, setHazardPickerOpen] = useState(false);
  const [hazardDescribeMode, setHazardDescribeMode] = useState(false);
  const [hazardDescription, setHazardDescription] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showElevationProgress, setShowElevationProgress] = useState(false);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);
  // Open when the rider chose "Save" from the End Ride dialog while ending the
  // route early — collects an optional early-end reason before finishing.
  const [earlyEndPromptOpen, setEarlyEndPromptOpen] = useState(false);
  // Tracks which End Ride action the rider chose before the reason modal —
  // saved rides go to /feedback (XP/badges), discarded rides skip feedback
  // and trip_track but still record the reason on the trip itself.
  const [endActionPending, setEndActionPending] = useState<'save' | 'discard' | null>(null);
  const hazardBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const queueTripEnd = useCallback((
    reason: 'completed' | 'stopped',
    options?: {
      readonly discard?: boolean;
      readonly earlyEndReason?: EarlyEndReason | null;
      readonly earlyEndReasonNote?: string | null;
    },
  ) => {
    const discard = options?.discard === true;
    const earlyEndReason = options?.earlyEndReason ?? null;
    const earlyEndReasonNote = options?.earlyEndReasonNote ?? null;
    const store = useAppStore.getState();
    const currentActiveTripClientId = store.activeTripClientId;
    const currentSession = store.navigationSession;
    const currentSharePublicly = store.shareTripsPublicly;
    const currentRouteRequest = store.routeRequest;
    const currentRoutePreview = store.routePreview;

    // Read the queue directly from the live store (not a closure-captured
    // derived value) so two callers in the same render tick — e.g. the
    // auto-completion effect and an unmount cleanup firing back-to-back —
    // both observe the first call's enqueue and bail. A React-state-derived
    // boolean would still be `false` for both because the re-render that
    // would flip it hasn't run yet.
    const alreadyQueuedTripEnd = store.queuedMutations.some(
      (mutation) =>
        mutation.type === 'trip_end' &&
        (mutation.payload as { clientTripId?: string }).clientTripId ===
          currentActiveTripClientId,
    );

    if (!currentActiveTripClientId || alreadyQueuedTripEnd) {
      return;
    }

    const endedAt = new Date().toISOString();

    enqueueMutation('trip_end', {
      clientTripId: currentActiveTripClientId,
      endedAt,
      reason,
      earlyEndReason,
      earlyEndReasonNote,
    });

    // Discarded rides skip the trip_track + trip_share writes. The trip lifecycle
    // is closed server-side (above), but with no trip_tracks row the ride never
    // surfaces in History or in the per-period stats dashboard, and nothing is
    // posted to the community feed. /feedback is also skipped by the caller, so
    // no XP / badges / microlives are awarded.
    if (discard) {
      telemetry.capture('trip_end_queued', {
        reason,
        signed_in: Boolean(user),
        breadcrumbs: currentSession?.gpsBreadcrumbs.length ?? 0,
        discarded: true,
      });
      return;
    }

    // Queue GPS trail + route recording
    if (currentSession && selectedRoute) {
      enqueueMutation('trip_track', {
        clientTripId: currentActiveTripClientId,
        routingMode: (currentRoutePreview?.selectedMode as 'safe' | 'fast') ?? 'fast',
        plannedRoutePolyline6: selectedRoute.geometryPolyline6,
        plannedRouteDistanceMeters: selectedRoute.distanceMeters,
        gpsBreadcrumbs: currentSession.gpsBreadcrumbs,
        endReason: reason,
        startedAt: currentSession.startedAt,
        endedAt,
        bikeType: store.bikeType ?? undefined,
        aqiAtStart: null, // TODO: capture AQI at navigation start
        earlyEndReason,
        earlyEndReasonNote,
      });
    }

    // Auto-share to community feed if enabled
    if (currentSharePublicly && currentSession && selectedRoute) {
      const durationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(currentSession.startedAt).getTime()) / 1000,
      );
      const actualDistance = currentSession.gpsBreadcrumbs.length >= 2
        ? calculateTrailDistanceMeters(currentSession.gpsBreadcrumbs)
        : selectedRoute.distanceMeters;
      enqueueMutation('trip_share', {
        startLocationText: currentRouteRequest.origin.lat.toFixed(4) + ', ' + currentRouteRequest.origin.lon.toFixed(4),
        destinationText: currentRouteRequest.destination.lat.toFixed(4) + ', ' + currentRouteRequest.destination.lon.toFixed(4),
        distanceMeters: actualDistance,
        durationSeconds,
        elevationGainMeters: selectedRoute.totalClimbMeters,
        geometryPolyline6: selectedRoute.geometryPolyline6,
        safetyTags: [],
        startCoordinate: { lat: currentRouteRequest.origin.lat, lon: currentRouteRequest.origin.lon },
      });
    }

    telemetry.capture('trip_end_queued', {
      reason,
      signed_in: Boolean(user),
      breadcrumbs: currentSession?.gpsBreadcrumbs.length ?? 0,
    });
  }, [enqueueMutation, selectedRoute, user]);

  // Completes the End Ride flow after the rider answered (or skipped) the
  // reason question. Branches on endActionPending: 'save' goes to /feedback
  // (XP/badges/trip_track written); 'discard' routes back to /route-planning
  // and skips trip_track + feedback. In both cases the reason is recorded on
  // the trip via the trip_end payload so analytics covers both outcomes.
  const finalizeEarlyEnd = useCallback((
    earlyEndReason: EarlyEndReason | null,
    earlyEndReasonNote: string | null,
  ) => {
    setEarlyEndPromptOpen(false);
    const action = endActionPending;
    setEndActionPending(null);

    const isDiscard = action === 'discard';
    queueTripEnd('stopped', { discard: isDiscard, earlyEndReason, earlyEndReasonNote });
    telemetry.capture('navigation_stopped', {
      route_id: selectedRoute?.id ?? 'unknown',
      session_id: navigationSession?.sessionId ?? 'unknown',
      outcome: isDiscard ? 'discarded' : 'saved',
      early_end_reason: earlyEndReason ?? 'skipped',
    });
    void clearCachedRoute();
    finishNavigation();
    router.replace(isDiscard ? '/route-planning' : '/feedback');
  }, [endActionPending, queueTripEnd, selectedRoute, navigationSession, finishNavigation]);

  const earlyEndReasonOptions: ReadonlyArray<EarlyEndReasonOption> = [
    { value: 'reached_destination', label: t('nav.earlyEndReachedDestination') },
    { value: 'found_better_route', label: t('nav.earlyEndFoundBetterRoute') },
    { value: 'felt_unsafe', label: t('nav.earlyEndFeltUnsafe') },
    { value: 'no_longer_needed', label: t('nav.earlyEndNoLongerNeeded') },
    { value: 'other', label: t('nav.earlyEndOther') },
  ];

  const queueHazardReport = (hazardType: HazardType, description?: string) => {
    if (!mapUserCoordinate) {
      showHazardBanner('error', t('nav.hazardGpsUnavailable'));
      return;
    }

    const trimmed = description?.trim().slice(0, 280);
    // Non-safety haptic — suppressed during NAVIGATING (see docs/haptic-map.md).
    // The visual "Hazard reported" banner provides confirmation during a ride.
    haptics.confirm();
    setHazardPickerOpen(false);
    setHazardDescribeMode(false);
    setHazardDescription('');
    enqueueMutation('hazard', {
      coordinate: mapUserCoordinate,
      reportedAt: new Date().toISOString(),
      source: 'in_ride',
      hazardType,
      ...(trimmed && trimmed.length > 0 ? { description: trimmed } : {}),
    });
    telemetry.capture('hazard_report_queued', {
      source: 'manual',
      hazard_type: hazardType,
      has_description: Boolean(trimmed && trimmed.length > 0),
      signed_in: Boolean(user),
    });
    const hazardLabel = t(`hazard.types.${hazardType}`);
    showHazardBanner(
      user ? 'success' : 'warning',
      user
        ? t('nav.hazardRecordedSync', { label: hazardLabel })
        : t('nav.hazardRecordedAnon', { label: hazardLabel }),
    );
  };

  const handleHazardGridItemPress = (hazardType: HazardType) => {
    if (hazardType === 'other') {
      setHazardDescribeMode(true);
      return;
    }
    queueHazardReport(hazardType);
  };

  const openHazardPicker = () => {
    if (!mapUserCoordinate) {
      showHazardBanner('error', t('nav.hazardGpsUnavailable'));
      return;
    }

    setHazardPickerOpen(true);
  };

  const speak = useCallback((message: string) => {
    const currentState = useAppStore.getState();
    const session = currentState.navigationSession;
    if (
      !session ||
      !voiceGuidanceEnabled ||
      session.isMuted ||
      currentState.appState !== 'NAVIGATING'
    ) {
      return;
    }

    void Speech.stop();
    Speech.speak(message, {
      language: routeRequest.locale,
    });
  }, [voiceGuidanceEnabled, routeRequest.locale]);

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

  // Build the effective request for rerouting, matching the original routing profile:
  //   Safe  → reroute as Safe
  //   Fast  → reroute as Fast
  //   Flat  → reroute as Fast  (flat OSRM is slow; fast Mapbox is better for reroute)
  const effectiveRouteRequest = useMemo(() => {
    const isFlat = routeRequest.mode === 'safe' && avoidHills;
    return {
      ...routeRequest,
      avoidUnpaved,
      // Flat mode reroutes as Fast (Mapbox) for speed; otherwise preserve original profile
      mode: isFlat ? 'fast' as const : routeRequest.mode,
      avoidHills: isFlat ? false : avoidHills,
    };
  }, [routeRequest, avoidHills, avoidUnpaved]);

  const rerouteMutation = useMutation({
    mutationFn: (origin: Coordinate) => {
      // Read fresh store state at execution time so a just-skipped waypoint
      // (removeWaypoint runs synchronously, but this component's memoized
      // effectiveRouteRequest hasn't re-rendered yet) is excluded from the
      // reroute. Mirrors the effectiveRouteRequest profile transform.
      const s = useAppStore.getState();
      const base = s.routeRequest;
      const isFlat = base.mode === 'safe' && s.avoidHills;
      const freshRequest = {
        ...base,
        avoidUnpaved: s.avoidUnpaved,
        mode: isFlat ? ('fast' as const) : base.mode,
        avoidHills: isFlat ? false : s.avoidHills,
      };
      return mobileApi.reroute(
        buildRerouteRequest(freshRequest, selectedRoute?.id, origin, routeCoordinates),
      );
    },
    onMutate: () => {
      recordNavigationReroute();
      telemetry.capture('reroute_requested', {
        route_id: selectedRoute?.id ?? 'unknown',
        mode: effectiveRouteRequest.mode,
        avoid_hills: effectiveRouteRequest.avoidHills,
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
        mode: effectiveRouteRequest.mode,
        avoid_hills: effectiveRouteRequest.avoidHills,
      });
      telemetry.captureError(error, {
        feature: 'reroute',
        route_id: selectedRoute?.id ?? 'unknown',
        mode: effectiveRouteRequest.mode,
      });
    },
  });

  useEffect(() => {
    return () => {
      if (hazardBannerTimeoutRef.current) {
        clearTimeout(hazardBannerTimeoutRef.current);
      }
      dismissedHazardIdsRef.current.clear();
      void Speech.stop();
    };
  }, []);

  // ── Cache active route for offline recovery ──
  useEffect(() => {
    if (!selectedRoute || !navigationSession) return;

    const routingMode: CachedRouteData['routingMode'] =
      routeRequest.mode === 'safe' && avoidHills ? 'flat' : routeRequest.mode;

    const cachedData: CachedRouteData = {
      routeId: selectedRoute.id,
      geometry: selectedRoute.geometryPolyline6,
      steps: selectedRoute.steps,
      distanceMeters: selectedRoute.distanceMeters,
      durationSeconds: selectedRoute.durationSeconds,
      originLabel: `${routeRequest.origin.lat.toFixed(4)}, ${routeRequest.origin.lon.toFixed(4)}`,
      destinationLabel: `${routeRequest.destination.lat.toFixed(4)}, ${routeRequest.destination.lon.toFixed(4)}`,
      routingMode,
      waypoints: (routeRequest.waypoints ?? []).map((wp) => ({
        lat: wp.lat,
        lon: wp.lon,
        label: `${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}`,
      })),
      cachedAt: new Date().toISOString(),
    };

    void cacheActiveRoute(cachedData);
  }, [selectedRoute?.id, navigationSession?.sessionId, routeRequest.mode, avoidHills]);

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
      speak(t('nav.inMeters', { distance: dist, instruction: activeStep.instruction }));
    }

    if (progress.shouldAnnounceApproach && activeStep) {
      markApproachAnnouncement(activeStep.id);
      speak(t('nav.inMeters', { distance: 50, instruction: activeStep.instruction }));
    }

    if (progress.shouldAdvanceStep && activeStep) {
      speak(activeStep.instruction);
      advanceNavigation(selectedRoute.steps.length);
    }

    // Announce off-route once when transitioning from on-route to off-route
    if (progress.isOffRoute && !offRouteAnnouncedRef.current) {
      offRouteAnnouncedRef.current = true;
      speak(t('nav.offRoute'));
    } else if (!progress.isOffRoute) {
      offRouteAnnouncedRef.current = false;
    }

    if (progress.shouldCompleteNavigation) {
      queueTripEnd('completed');
      telemetry.capture('navigation_completed', {
        route_id: selectedRoute.id,
        session_id: navigationSession?.sessionId ?? 'unknown',
      });
      speak(t('nav.arrived'));
      void clearCachedRoute();
      finishNavigation();
      router.replace('/feedback');
    }
  }, [
    advanceNavigation,
    appendGpsBreadcrumb,
    finishNavigation,
    locationState.sample,
    markPreAnnouncement,
    markApproachAnnouncement,
    navigationSession?.sessionId,
    queueTripEnd,
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

  const rerouteMutateRef = useRef(rerouteMutation.mutate);
  rerouteMutateRef.current = rerouteMutation.mutate;
  const isReroutePending = rerouteMutation.isPending;

  // Skip the next intermediate stop: confirm, drop that waypoint, and reroute
  // from the rider's current position to the following stop (or the final
  // destination if it was the last one). The reroute's mutationFn re-reads the
  // store, so the just-removed waypoint is excluded.
  const handleSkipStop = useCallback(() => {
    if (!nextStopProgress?.hasNextStop || nextStopProgress.nextWaypointIndex == null) return;
    if (!isOnline) return; // reroute needs the network; the button is also disabled
    const waypointIndex = nextStopProgress.nextWaypointIndex;
    const stopLabel = nextStopProgress.stopIndex;
    Alert.alert(
      t('nav.skipStopConfirmTitle'),
      t('nav.skipStopConfirmBody', { index: stopLabel }),
      [
        { text: t('nav.skipStopCancel'), style: 'cancel' },
        {
          text: t('nav.skipStop'),
          style: 'destructive',
          onPress: () => {
            removeWaypoint(waypointIndex);
            const coord = locationState.sample?.coordinate;
            if (coord) rerouteMutateRef.current(coord);
          },
        },
      ],
    );
  }, [nextStopProgress, isOnline, t, removeWaypoint, locationState.sample]);

  useEffect(() => {
    if (
      !navigationSession ||
      !selectedRoute ||
      !locationState.sample ||
      isReroutePending ||
      !isOnline ||
      !shouldTriggerAutomaticReroute(navigationSession)
    ) {
      return;
    }

    rerouteMutateRef.current(locationState.sample.coordinate);
  }, [locationState.sample, navigationSession, isReroutePending, selectedRoute, isOnline]);

  // Reset offline banner dismissed state when coming back online
  useEffect(() => {
    if (isOnline) {
      setOfflineBannerDismissed(false);
    }
  }, [isOnline]);

  if (!selectedRoute || !navigationSession) {
    return (
      <Screen
        title={t('nav.guardTitle')}
        eyebrow={t('nav.guardEyebrow')}
        subtitle={t('nav.guardSubtitle')}
      >
        <View
          style={{
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: `${colors.caution}59`,
            backgroundColor: `${colors.cautionTint}18`,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text style={[textXs, { color: colors.cautionText, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: fontFamily.body.bold }]}>
            No active navigation
          </Text>
          <Text style={[textBase, { color: colors.textSecondary }]}>
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

  // Diagnostic chip labels removed from user UI — available in diagnostics.tsx

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
        isOnline &&
        mobileEnv.mobileApiUrl &&
        locationState.sample
      ? { label: t('nav.rerouteNow'), handler: () => rerouteMutation.mutate(locationState.sample!.coordinate) }
      : null;

  if (!guardPassed) return null;

  // Screen-reader map summary context. HazardAlert is assertive and announces
  // hazards within 70 m; this polite summary widens the window to 200 m so
  // blind riders get earlier warning, and suppresses itself when HazardAlert
  // is already speaking to avoid duplicate announcements.
  const approachingHazard = (() => {
    const userCoord = locationState.sample?.coordinate;
    if (!userCoord || nearbyHazards.length === 0) return null;
    let closest: { id: string; hazardType: HazardType; distanceMeters: number } | null =
      null;
    for (const hazard of nearbyHazards) {
      const dist = haversineDistance(
        [userCoord.lat, userCoord.lon],
        [hazard.lat, hazard.lon],
      );
      if (dist > 200) continue;
      if (!closest || dist < closest.distanceMeters) {
        closest = {
          id: hazard.id,
          hazardType: hazard.hazardType,
          distanceMeters: dist,
        };
      }
    }
    return closest;
  })();

  return (
    <View style={styles.screen}>
      <RouteMap
        routes={routePreview?.routes}
        selectedRouteId={selectedRouteId}
        origin={liveCoordinate}
        destination={routeRequest.destination}
        waypoints={routeRequest.waypoints}
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
        a11yContext={{
          mode: 'navigating',
          isOffRoute: offRouteDetails != null,
          remainingDistanceMeters:
            navigationSession.remainingDistanceMeters ?? selectedRoute?.distanceMeters,
          hazardsOnRoute: nearbyHazards.length,
          nearestApproachingHazard: approachingHazard,
          suppressHazardLive: activeHazardAlert != null,
        }}
      />

      <View style={[styles.overlayRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]} pointerEvents="box-none">
        {/* ── Top: maneuver card only ── */}
        <View style={styles.topCluster} pointerEvents="box-none">
          <ManeuverCard
            currentStep={currentStep}
            distanceToManeuverMeters={navigationSession.distanceToManeuverMeters ?? null}
            gpsAccuracyMeters={locationState.sample?.accuracyMeters}
            isOffline={!isOnline}
            onPress={() => {
              if (currentStep) {
                const dist = Math.round(navigationSession.distanceToManeuverMeters ?? 0);
                speak(t('nav.inMeters', { distance: dist, instruction: currentStep.instruction }));
              }
            }}
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

          {/* Offline + off-route banner */}
          {!isOnline && navigationSession.rerouteEligible && !offlineBannerDismissed ? (
            <View style={[styles.warningBanner, shadows.md]}>
              <Text style={[textSm, styles.warningBannerText]}>
                {t('nav.offlineFollowRoute')}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setOfflineBannerDismissed(true)}
              >
                Dismiss
              </Button>
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
            accessibilityLabel={navigationSession.isFollowing ? t('nav.freeMap') : t('nav.recenter')}
          >
            <IconButton
              icon={
                <Ionicons
                  name={navigationSession.isFollowing ? 'navigate' : 'navigate-outline'}
                  size={22}
                  color={navigationSession.isFollowing ? colors.accent : gray[300]}
                />
              }
              onPress={() => {
                setFollowing(!(navigationSession.isFollowing ?? true));
              }}
              accessibilityLabel={navigationSession.isFollowing ? t('nav.freeMap') : t('nav.recenter')}
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
              icon={<Ionicons name="warning" size={26} color={colors.textInverse} />}
              onPress={openHazardPicker}
              accessibilityLabel={t('nav.reportHazard')}
              variant="accent"
            />
          </View>

          {/* Elevation progress toggle */}
          {selectedRoute?.elevationProfile?.length ? (
            <View style={styles.roundButton}>
              <IconButton
                icon={<Ionicons name={showElevationProgress ? 'analytics' : 'analytics-outline'} size={22} color={showElevationProgress ? colors.accent : gray[300]} />}
                onPress={() => setShowElevationProgress((prev) => !prev)}
                accessibilityLabel={showElevationProgress ? t('nav.hideElevation') : t('nav.showElevation')}
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
                  accessibilityLabel={t('tabs.history')}
                  variant="secondary"
                />
              </View>
              <View style={styles.roundButton}>
                <IconButton
                  icon={<Ionicons name="people-outline" size={22} color={gray[300]} />}
                  onPress={() => { setShowMenu(false); router.push('/community'); }}
                  accessibilityLabel={t('tabs.community')}
                  variant="secondary"
                />
              </View>
              <View style={styles.roundButton}>
                <IconButton
                  icon={<Ionicons name="person-outline" size={22} color={gray[300]} />}
                  onPress={() => { setShowMenu(false); router.push('/profile'); }}
                  accessibilityLabel={t('tabs.profile')}
                  variant="secondary"
                />
              </View>
            </>
          ) : null}
          <View style={styles.roundButton}>
            <IconButton
              icon={<Ionicons name={showMenu ? 'close' : 'menu'} size={22} color={gray[300]} />}
              onPress={() => setShowMenu((prev) => !prev)}
              accessibilityLabel={showMenu ? t('nav.hideMenu') : t('nav.showMenu')}
              variant="secondary"
            />
          </View>

          {/* End ride — distinct danger-styled stop button */}
          <View style={styles.endRideButton}>
            <IconButton
              icon={<Ionicons name="stop-circle" size={24} color={gray[50]} />}
              onPress={() => {
                // Both Save and Discard route through finalizeEarlyEnd via
                // the reason modal; endActionPending tells finalize which
                // outcome to apply. This lets us capture the reason even
                // when the rider discards (the trip_track is skipped but
                // trip_end still writes the reason onto the trips row).
                const saveAndEnd = () => {
                  setEndActionPending('save');
                  setEarlyEndPromptOpen(true);
                };
                const discardAndEnd = () => {
                  setEndActionPending('discard');
                  setEarlyEndPromptOpen(true);
                };
                Alert.alert(
                  t('nav.endRideSaveTitle'),
                  t('nav.endRideSaveMessage'),
                  [
                    {
                      text: t('nav.endRideDiscard'),
                      style: 'destructive',
                      onPress: discardAndEnd,
                    },
                    {
                      text: t('nav.endRideSave'),
                      style: 'default',
                      onPress: saveAndEnd,
                    },
                  ],
                  // Android: tapping outside / system-back dismisses the dialog
                  // and we treat that as "save by default" per product spec.
                  // iOS: Alert.alert can't be dismissed without tapping a button.
                  { cancelable: true, onDismiss: saveAndEnd },
                );
              }}
              accessibilityLabel={t('nav.endRide')}
              variant="danger"
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
          <SteepGradeIndicator gradePercent={currentGrade} />
          <FooterCard
            nextStep={nextStep}
            remainingDurationSeconds={Math.round(
              navigationSession.remainingDurationSeconds ?? selectedRoute.adjustedDurationSeconds,
            )}
            remainingDistanceMeters={
              navigationSession.remainingDistanceMeters ?? selectedRoute.distanceMeters
            }
            totalClimbMeters={climbData.value}
            totalDescentMeters={descentData}
            isClimbLive={climbData.isLive}
            speedKmh={
              locationState.sample?.speedMetersPerSecond != null
                ? locationState.sample.speedMetersPerSecond * 3.6
                : null
            }
            nextStop={footerNextStop}
            onSkipStop={handleSkipStop}
            skipDisabled={!isOnline}
          />
        </View>
      </View>

      {/* Route-feature proximity alerts (bottom-right column) */}
      <RouteFeatureAlertStack />

      {/* Waze-style hazard proximity alert */}
      {activeHazardAlert ? (
        <HazardAlert
          hazard={activeHazardAlert.hazard}
          distanceMeters={activeHazardAlert.distanceMeters}
          userVote={activeHazardAlert.hazard.userVote}
          voteState={hazardVote.isVoting ? 'pending' : 'idle'}
          onUpvote={() => {
            hazardVote.upvote(activeHazardAlert.hazard.id).catch(() => {});
            dismissedHazardIdsRef.current.add(activeHazardAlert.hazard.id);
            setActiveHazardAlert(null);
          }}
          onDownvote={() => {
            hazardVote.downvote(activeHazardAlert.hazard.id).catch(() => {});
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
          onPress={() => {
            setHazardPickerOpen(false);
            setHazardDescribeMode(false);
            setHazardDescription('');
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={t('hazard.dismissPickerA11y')}
        >
          <Surface
            variant="panel"
            radius="2xl"
            elevation="lg"
            onPress={(e) => e.stopPropagation()}
            accessible={false}
            style={styles.hazardGridCard}
          >
            {hazardDescribeMode ? (
              <>
                <Text style={styles.hazardGridTitle}>{t('hazard.describeTitle')}</Text>
                <Text style={styles.hazardGridSubtitle}>{t('hazard.describeSubtitle')}</Text>
                <TextInput
                  style={styles.hazardDescribeInput}
                  value={hazardDescription}
                  onChangeText={setHazardDescription}
                  placeholder={t('hazard.describePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={280}
                  autoFocus
                  accessibilityLabel={t('hazard.describeA11y')}
                  accessibilityHint={t('hazard.describeA11yHint')}
                />
                <Text style={styles.hazardDescribeCounter}>{hazardDescription.length}/280</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.hazardDescribeSubmit,
                    pressed && styles.hazardDescribeSubmitPressed,
                  ]}
                  onPress={() => queueHazardReport('other', hazardDescription)}
                  accessibilityRole="button"
                  accessibilityLabel={t('hazard.title')}
                >
                  <Text style={styles.hazardDescribeSubmitText}>{t('hazard.reportShort')}</Text>
                </Pressable>
                <Pressable
                  style={styles.hazardGridCancel}
                  onPress={() => {
                    setHazardDescribeMode(false);
                    setHazardDescription('');
                  }}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={t('hazard.backToTypesA11y')}
                >
                  <Text style={styles.hazardGridCancelText}>{t('hazard.backToTypes')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.hazardGridTitle}>{t('hazard.title')}</Text>
                <View style={styles.hazardGrid}>
                  {([
                    { value: 'illegally_parked_car' as HazardType, label: t('hazard.types.illegally_parked_car'), icon: 'car-outline' as const },
                    { value: 'blocked_bike_lane' as HazardType, label: t('hazard.types.blocked_bike_lane'), icon: 'remove-circle-outline' as const },
                    { value: 'pothole' as HazardType, label: t('hazard.types.pothole'), icon: 'alert-circle-outline' as const },
                    { value: 'aggro_dogs' as HazardType, label: t('hazard.types.aggro_dogs'), icon: 'paw-outline' as const },
                    { value: 'aggressive_traffic' as HazardType, label: t('hazard.types.aggressive_traffic'), icon: 'speedometer-outline' as const },
                    { value: 'other' as HazardType, label: t('hazard.other'), icon: 'ellipsis-horizontal' as const },
                  ]).map((item) => (
                    <Pressable
                      key={item.value}
                      style={({ pressed }) => [
                        styles.hazardGridItem,
                        pressed && styles.hazardGridItemPressed,
                      ]}
                      onPress={() => handleHazardGridItemPress(item.value)}
                      accessibilityRole="button"
                      accessibilityLabel={t('hazard.reportItemA11y', { label: item.label })}
                    >
                      <Ionicons name={item.icon} size={24} color={colors.accent} />
                      <Text style={styles.hazardGridLabel}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={styles.hazardGridCancel}
                  onPress={() => setHazardPickerOpen(false)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={t('hazard.cancelReportA11y')}
                >
                  <Text style={styles.hazardGridCancelText}>{t('common.cancel')}</Text>
                </Pressable>
              </>
            )}
          </Surface>
        </Pressable>
      ) : null}

      {/* Early-end reason — shown after the rider chose Save or Discard */}
      <EarlyEndReasonModal
        visible={earlyEndPromptOpen}
        title={t('nav.earlyEndTitle')}
        options={earlyEndReasonOptions}
        saveLabel={t(endActionPending === 'discard' ? 'nav.earlyEndDiscard' : 'nav.earlyEndSave')}
        skipLabel={t('nav.earlyEndSkip')}
        otherPlaceholder={t('nav.earlyEndOtherPlaceholder')}
        onSubmit={finalizeEarlyEnd}
      />

    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bgDeep,
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
      backgroundColor: safetyTints.cautionMedium,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      gap: space[3],
    },
    warningBannerText: {
      color: colors.textPrimary,
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
      backgroundColor: surfaceTints.overlay,
      justifyContent: 'flex-end',
      paddingHorizontal: space[4],
      paddingBottom: space[8],
      zIndex: zIndex.sticky,
    },
    hazardGridCard: {
      padding: space[4],
      gap: space[3],
    },
    hazardGridTitle: {
      ...textSm,
      fontFamily: fontFamily.heading.semiBold,
      color: colors.textMuted,
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
      backgroundColor: colors.bgSecondary,
      borderRadius: radii.lg,
      paddingVertical: space[3],
      paddingHorizontal: space[1],
    },
    hazardGridItemPressed: {
      backgroundColor: colors.bgTertiary,
    },
    hazardGridLabel: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    hazardGridCancel: {
      alignItems: 'center',
      paddingVertical: space[2],
    },
    hazardGridCancelText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
    hazardGridSubtitle: {
      ...textXs,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: -space[1],
      marginBottom: space[2],
    },
    hazardDescribeInput: {
      backgroundColor: colors.bgSecondary,
      color: colors.textPrimary,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
      minHeight: 96,
      textAlignVertical: 'top',
      fontFamily: fontFamily.body.regular,
      fontSize: 15,
    },
    hazardDescribeCounter: {
      ...textXs,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: space[1],
    },
    hazardDescribeSubmit: {
      backgroundColor: colors.accent,
      borderRadius: radii.lg,
      paddingVertical: space[3],
      alignItems: 'center',
      marginTop: space[2],
    },
    hazardDescribeSubmitPressed: {
      opacity: 0.85,
    },
    hazardDescribeSubmitText: {
      ...textSm,
      fontFamily: fontFamily.heading.semiBold,
      color: colors.bgDeep,
      letterSpacing: 0.5,
    },
    hazardFab: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent,
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
    endRideButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: safetyColors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default withErrorBoundary('navigation', NavigationScreen);
