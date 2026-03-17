import type { Coordinate, HazardType } from '@defensivepedal/core';
import {
  AUTO_REROUTE_DELAY_MS,
  HAZARD_TYPE_OPTIONS,
  buildRerouteRequest,
  getNavigationProgress,
  getPreviewOrigin,
  shouldTriggerAutomaticReroute,
} from '@defensivepedal/core';
import { useKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '../src/components/BrandLogo';
import { NavigationFooterPanel, NavigationManeuverCard } from '../src/components/NavigationChrome';
import { RouteMap } from '../src/components/RouteMap';
import { Screen } from '../src/components/Screen';
import { StatusCard } from '../src/components/StatusCard';
import { VoiceGuidanceButton } from '../src/components/VoiceGuidanceButton';
import { useBackgroundNavigationSnapshot } from '../src/hooks/useBackgroundNavigationSnapshot';
import { useForegroundNavigationLocation } from '../src/hooks/useForegroundNavigationLocation';
import { mobileApi } from '../src/lib/api';
import { mobileEnv } from '../src/lib/env';
import { telemetry } from '../src/lib/telemetry';
import { mobileTheme } from '../src/lib/theme';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

export default function NavigationScreen() {
  useKeepAwake();
  const { user } = useAuthSession();

  const routeRequest = useAppStore((state) => state.routeRequest);
  const voiceGuidanceEnabled = useAppStore((state) => state.voiceGuidanceEnabled);
  const routePreview = useAppStore((state) => state.routePreview);
  const selectedRouteId = useAppStore((state) => state.selectedRouteId);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const advanceNavigation = useAppStore((state) => state.advanceNavigation);
  const updateNavigationProgress = useAppStore((state) => state.updateNavigationProgress);
  const markApproachAnnouncement = useAppStore((state) => state.markApproachAnnouncement);
  const recordNavigationReroute = useAppStore((state) => state.recordNavigationReroute);
  const syncNavigationRoute = useAppStore((state) => state.syncNavigationRoute);
  const finishNavigation = useAppStore((state) => state.finishNavigation);
  const setVoiceGuidanceEnabled = useAppStore((state) => state.setVoiceGuidanceEnabled);
  const setFollowing = useAppStore((state) => state.setFollowing);
  const setRoutePreview = useAppStore((state) => state.setRoutePreview);
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const activeTripClientId = useAppStore((state) => state.activeTripClientId);
  const queuedMutations = useAppStore((state) => state.queuedMutations);

  const locationState = useForegroundNavigationLocation(Boolean(navigationSession));
  const backgroundSnapshot = useBackgroundNavigationSnapshot();
  const introAnnouncementKeyRef = useRef<string | null>(null);

  const selectedRoute =
    routePreview?.routes.find((route) => route.id === selectedRouteId) ?? routePreview?.routes[0];
  const currentStep =
    selectedRoute && navigationSession
      ? selectedRoute.steps[navigationSession.currentStepIndex] ?? null
      : null;
  const nextStep =
    selectedRoute && navigationSession
      ? selectedRoute.steps[navigationSession.currentStepIndex + 1] ?? null
      : null;
  const totalSteps = selectedRoute?.steps.length ?? 0;
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

    enqueueMutation('trip_end', {
      clientTripId: activeTripClientId,
      endedAt: new Date().toISOString(),
      reason,
    });
    telemetry.capture('trip_end_queued', {
      reason,
      signed_in: Boolean(user),
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

    const progress = getNavigationProgress(selectedRoute, session, locationState.sample.coordinate);

    updateNavigationProgress(locationState.sample, progress);

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
        <StatusCard title="No active navigation" tone="warning">
          <Text style={styles.fallbackBodyText}>
            Start a route preview first so the navigation session has a selected route and steps.
          </Text>
        </StatusCard>
        <Pressable
          style={styles.fallbackPrimaryButton}
          onPress={() => {
            router.replace('/route-preview');
          }}
        >
          <Text style={styles.fallbackPrimaryLabel}>Return to preview</Text>
        </Pressable>
      </Screen>
    );
  }

  const gpsChipLabel =
    locationState.permissionStatus === 'granted'
      ? 'GPS live'
      : `GPS ${locationState.permissionStatus}`;
  const syncChipLabel = user ? `Sync on · ${pendingQueueCount}` : 'Anonymous ride';
  const progressChipLabel = `Step ${navigationSession.currentStepIndex + 1}/${Math.max(totalSteps, 1)}`;
  const bgChipLabel = `BG ${backgroundSnapshot.status.status}`;

  const warningMessage = locationState.error
    ? locationState.error
    : rerouteMutation.isError
      ? rerouteMutation.error.message
      : navigationSession.rerouteEligible
        ? rerouteMutation.isPending
          ? 'Requesting a new route from the rider’s live GPS position.'
          : offRouteCountdownSeconds !== null && offRouteCountdownSeconds > 0
            ? `Off route. Automatic reroute will fire in ${offRouteCountdownSeconds}s.`
            : 'Off route. Manual reroute is ready.'
        : null;

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
      />

      <SafeAreaView style={styles.overlayRoot}>
        <View style={styles.topCluster}>
          <View style={styles.topRow}>
            <View style={styles.brandBlock}>
              <BrandLogo size={42} />
              <View style={styles.brandCopy}>
                <Text style={styles.topEyebrow}>Defensive Pedal</Text>
                <Text style={styles.topTitle}>Live ride</Text>
              </View>
            </View>
            <View style={styles.chipRow}>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipLabel}>{gpsChipLabel}</Text>
              </View>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipLabel}>{bgChipLabel}</Text>
              </View>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipLabel}>{progressChipLabel}</Text>
              </View>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipLabel}>{syncChipLabel}</Text>
              </View>
            </View>
          </View>

          <NavigationManeuverCard
            currentStep={currentStep}
            nextStep={nextStep}
            distanceToManeuverMeters={navigationSession.distanceToManeuverMeters ?? null}
            gpsLabel={currentStep?.streetName || 'Live guidance from rider GPS'}
          />

          {warningMessage ? (
            <View style={styles.warningBanner}>
              <Text style={styles.warningBannerText}>{warningMessage}</Text>
              {locationState.error ? (
                <Pressable
                  style={styles.warningAction}
                  onPress={() => void locationState.refreshLocation()}
                >
                  <Text style={styles.warningActionLabel}>Retry GPS</Text>
                </Pressable>
              ) : navigationSession.rerouteEligible &&
                !rerouteMutation.isPending &&
                mobileEnv.mobileApiUrl &&
                locationState.sample ? (
                <Pressable
                  style={styles.warningAction}
                  onPress={() => rerouteMutation.mutate(locationState.sample!.coordinate)}
                >
                  <Text style={styles.warningActionLabel}>Reroute now</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {hazardBanner ? (
            <View
              style={[
                styles.hazardBanner,
                hazardBanner.tone === 'success'
                  ? styles.hazardBannerSuccess
                  : hazardBanner.tone === 'warning'
                    ? styles.hazardBannerWarning
                    : styles.hazardBannerError,
              ]}
            >
              <Text style={styles.hazardBannerText}>{hazardBanner.message}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.floatingControlRail}>
          <Pressable
            style={styles.railButton}
            onPress={() => {
              setFollowing(!(navigationSession.isFollowing ?? true));
            }}
          >
            <Text style={styles.railButtonLabel}>
              {navigationSession.isFollowing ? 'Free map' : 'Recenter'}
            </Text>
          </Pressable>

          <VoiceGuidanceButton
            enabled={voiceGuidanceEnabled}
            onPress={toggleVoiceGuidance}
            compact
          />

          <Pressable style={styles.railButton} onPress={openHazardPicker}>
            <Ionicons name="warning" size={22} color={mobileTheme.colors.textOnDark} />
            <Text style={styles.railButtonLabel}>Hazard</Text>
          </Pressable>

          <Pressable
            style={[styles.railButton, styles.railButtonDanger]}
            onPress={() => {
              queueTripEnd('stopped');
              telemetry.capture('navigation_stopped', {
                route_id: selectedRoute.id,
                session_id: navigationSession.sessionId,
              });
              finishNavigation();
              router.push('/feedback');
            }}
          >
            <Text style={styles.railButtonLabel}>End ride</Text>
          </Pressable>
        </View>

        <View style={styles.bottomCluster}>
          <NavigationFooterPanel
            remainingDurationSeconds={Math.round(
              navigationSession.remainingDurationSeconds ?? selectedRoute.adjustedDurationSeconds,
            )}
            remainingDistanceMeters={
              navigationSession.remainingDistanceMeters ?? selectedRoute.distanceMeters
            }
            currentSpeedMetersPerSecond={locationState.sample?.speedMetersPerSecond ?? null}
            routeGapMeters={Math.round(navigationSession.distanceToRouteMeters ?? 0)}
            offRouteCountdownSeconds={offRouteCountdownSeconds}
            reroutePending={rerouteMutation.isPending}
          />
        </View>
      </SafeAreaView>

      {hazardPickerOpen ? (
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setHazardPickerOpen(false);
            }}
          />
          <View style={styles.hazardPickerCard}>
            <View style={styles.hazardPickerHeader}>
              <Text style={styles.hazardPickerEyebrow}>Hazard report</Text>
              <Text style={styles.hazardPickerTitle}>What should we mark here?</Text>
              <Text style={styles.hazardPickerSubtitle}>
                This saves the hazard at your current rider location for later sync.
              </Text>
            </View>

            <View style={styles.hazardOptionList}>
              {HAZARD_TYPE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={styles.hazardOptionButton}
                  onPress={() => {
                    queueHazardReport(option.value);
                  }}
                >
                  <View style={styles.hazardOptionIconWrap}>
                    <Ionicons
                      name={option.value === 'other' ? 'ellipsis-horizontal' : 'warning'}
                      size={18}
                      color={mobileTheme.colors.brand}
                    />
                  </View>
                  <Text style={styles.hazardOptionLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.hazardPickerDismissButton}
              onPress={() => {
                setHazardPickerOpen(false);
              }}
            >
              <Text style={styles.hazardPickerDismissLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  overlayRoot: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
  },
  topCluster: {
    gap: 10,
  },
  topRow: {
    gap: 10,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandCopy: {
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
    letterSpacing: -0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.84)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusChipLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
  },
  warningBanner: {
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  warningBannerText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  hazardBanner: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hazardBannerSuccess: {
    backgroundColor: 'rgba(15, 118, 110, 0.22)',
  },
  hazardBannerWarning: {
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
  },
  hazardBannerError: {
    backgroundColor: 'rgba(153, 27, 27, 0.28)',
  },
  hazardBannerText: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.48)',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  hazardPickerCard: {
    borderRadius: 28,
    backgroundColor: 'rgba(11, 16, 32, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.18)',
    padding: 18,
    gap: 16,
  },
  hazardPickerHeader: {
    gap: 6,
  },
  hazardPickerEyebrow: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  hazardPickerTitle: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  hazardPickerSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  hazardOptionList: {
    gap: 10,
  },
  hazardOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hazardOptionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
  },
  hazardOptionLabel: {
    flex: 1,
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
  hazardPickerDismissButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  hazardPickerDismissLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 15,
    fontWeight: '800',
  },
  warningAction: {
    alignSelf: 'flex-start',
    borderRadius: mobileTheme.radii.pill,
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningActionLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  bottomCluster: {
    gap: 12,
  },
  floatingControlRail: {
    position: 'absolute',
    right: 14,
    top: '48%',
    transform: [{ translateY: -140 }],
    width: 92,
    gap: 10,
  },
  railButton: {
    borderRadius: 20,
    backgroundColor: 'rgba(11, 16, 32, 0.84)',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 58,
  },
  railButtonDanger: {
    backgroundColor: 'rgba(153, 27, 27, 0.82)',
    borderColor: 'rgba(252, 165, 165, 0.18)',
  },
  railButtonDisabled: {
    opacity: 0.55,
  },
  railButtonLabel: {
    color: mobileTheme.colors.textOnDark,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
  },
  fallbackBodyText: {
    color: mobileTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  fallbackPrimaryButton: {
    borderRadius: 22,
    backgroundColor: mobileTheme.colors.brand,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fallbackPrimaryLabel: {
    color: mobileTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
});
