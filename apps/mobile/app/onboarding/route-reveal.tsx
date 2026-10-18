import {
  decodePolyline,
  describeBusyRoadSaving,
  formatDistance,
  isRiskDataAvailable,
  resolveCountryFromCoord,
  type Coordinate,
  type RouteOption,
} from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RouteMap } from '../../src/components/map';
import { Button, FadeSlideIn, Spinner } from '../../src/design-system/atoms';
import { PedalSays } from '../../src/design-system/molecules/PedalSays';
import { Coachmark, type CoachmarkStep } from '../../src/design-system/organisms/Coachmark';
import { RiskDistributionCard } from '../../src/design-system/organisms/RiskDistributionCard';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { radii } from '../../src/design-system/tokens/radii';
import { space } from '../../src/design-system/tokens/spacing';
import { safetyTints } from '../../src/design-system/tokens/tints';
import { fontFamily, text2xl, textBase, textSm } from '../../src/design-system/tokens/typography';
import { useCurrentLocation } from '../../src/hooks/useCurrentLocation';
import { usePremium } from '../../src/hooks/usePremium';
import { useT } from '../../src/hooks/useTranslation';
import { useUnits } from '../../src/hooks/useUnits';
import { mobileApi } from '../../src/lib/api';
import { searchLoops, type GeneratedLoop } from '../../src/lib/loop-generator';
import { searchLoopsRemote } from '../../src/lib/loop-generator-remote';
import { isLoopServerEnabled } from '../../src/lib/loopServerFlag';
import { hasShownOnboardingTour, markOnboardingTourShown } from '../../src/lib/onboardingTour';
import { describeRouteComparison } from '../../src/lib/routeComparisonCopy';
import {
  HAZARD_COUNT_TIMEOUT_MS,
  HAZARD_QUERY_RADIUS_METERS,
  countHazardsFromBatches,
  hazardQueryCentres,
} from '../../src/lib/routeHazards';
import { telemetry } from '../../src/lib/telemetry';
import { useAppStore } from '../../src/store/appStore';
import type { RideIntent } from './ride-intent';

/** Target for the "short, easy ride" branch [D3]. */
const ONBOARDING_LOOP_METERS = 5000;

type LoopState =
  | { kind: 'searching' }
  | { kind: 'found'; loop: GeneratedLoop }
  | { kind: 'failed' };

/**
 * Loop branch: run the normal generator around the rider, but stop at the
 * FIRST measured candidate. The full search is several seconds of OSRM
 * fan-out, which is too long for a first impression [D3]; a measured
 * candidate already carries its risk segments and has passed the
 * generator's own filters.
 */
const useOnboardingLoop = (enabled: boolean) => {
  const { location } = useCurrentLocation();
  const [state, setState] = useState<LoopState>({ kind: 'searching' });
  // Pin the FIRST fix. The shared location source republishes, and a search
  // keyed on the live object would be aborted by every update.
  const [start, setStart] = useState<Coordinate | null>(null);
  useEffect(() => {
    if (!start && location) setStart(location);
  }, [location, start]);

  useEffect(() => {
    if (!enabled || !start) return;
    const controller = new AbortController();
    let found: GeneratedLoop | null = null;
    const { locale, loopServerEnabled } = useAppStore.getState();

    const request = {
      start,
      targetDistanceMeters: ONBOARDING_LOOP_METERS,
      terrain: 'flat' as const,
      surface: 'paved' as const,
      heading: 'any' as const,
      placement: 'around_here' as const,
      urbanEdgeMeters: null,
      locale,
    };
    const callbacks = {
      signal: controller.signal,
      onCandidate: (loop: GeneratedLoop) => {
        if (found || !loop.measured) return;
        found = loop;
        setState({ kind: 'found', loop });
        controller.abort();
      },
    };

    const run = async () => {
      try {
        const outcome = isLoopServerEnabled(loopServerEnabled)
          ? await searchLoopsRemote(request, callbacks)
          : await searchLoops(request, callbacks);
        // Aborted by unmount (not by finding one): say nothing.
        if (found || controller.signal.aborted) return;
        if (outcome.status === 'ok' && outcome.loops[0]) {
          setState({ kind: 'found', loop: outcome.loops[0] });
        } else {
          setState({ kind: 'failed' });
        }
      } catch {
        if (!found && !controller.signal.aborted) setState({ kind: 'failed' });
      }
    };
    void run();

    return () => controller.abort();
  }, [enabled, start]);

  return state;
};

/**
 * Onboarding step 5 — the rider's own route, painted by risk, before any ask
 * (docs/plans/onboarding-first-ride.md [D2], [D4]).
 *
 * Lives under `/onboarding/*` because the signup gate walls every other path
 * for an anonymous session. It composes the SAME pieces `/route-preview`
 * uses (RouteMap, RiskDistributionCard, the shared comparison copy) so the
 * rider is learning the screen they will use every day.
 *
 * A-to-B routes land in `routePreview` (appState ROUTE_PREVIEW), which the
 * anonymous → account upgrade deliberately preserves (UserCacheResetBridge);
 * `finishPostSignupSteps` then opens `/route-preview` with it. Loops never go
 * through `routePreview`, so the loop is handed over in the store instead.
 */
export default function OnboardingRouteRevealScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const units = useUnits();
  const premium = usePremium();
  const params = useLocalSearchParams<{ intent?: RideIntent }>();
  const isLoop = params.intent === 'loop';
  const { location } = useCurrentLocation();

  const routeRequest = useAppStore((s) => s.routeRequest);
  const avoidUnpaved = useAppStore((s) => s.avoidUnpaved);
  const isEbike = useAppStore((s) => s.isEbike);
  const setRoutePreview = useAppStore((s) => s.setRoutePreview);
  const shownAtRef = useRef(Date.now());
  const reportedRef = useRef(false);

  // Same entitlement masking as /route-preview: a rider who chose e-bike
  // without Plus is routed on Safe, never shown a paywall here [D10].
  const effectiveRequest = useMemo(
    () => ({
      ...routeRequest,
      avoidUnpaved,
      avoidHills: false,
      avoidHeat: false,
      isEbike: isEbike && !premium.blockEbikeRouting(),
      showRouteComparison: true,
    }),
    [routeRequest, avoidUnpaved, isEbike, premium],
  );

  const previewQuery = useQuery({
    queryKey: ['route-preview', effectiveRequest],
    queryFn: () => mobileApi.previewRoute(effectiveRequest),
    enabled: !isLoop,
    // One quiet retry, then say so [D9].
    retry: 1,
  });

  useEffect(() => {
    if (previewQuery.data) setRoutePreview(previewQuery.data);
  }, [previewQuery.data, setRoutePreview]);

  const loopState = useOnboardingLoop(isLoop);

  const route: RouteOption | null = isLoop
    ? loopState.kind === 'found'
      ? loopState.loop.route
      : null
    : previewQuery.data?.routes[0] ?? null;
  const failed = isLoop ? loopState.kind === 'failed' : previewQuery.isError;
  // Gate on the place being ridden, like /route-preview (destination for
  // A-to-B, the start for a loop) through the single core predicate.
  const ridePoint = isLoop ? location : routeRequest.destination;
  const riskAvailable = ridePoint
    ? isRiskDataAvailable(resolveCountryFromCoord(ridePoint))
    : false;
  const hasRiskSegments = (route?.riskSegments.length ?? 0) > 0;

  const comparison = useMemo(
    () => (isLoop ? null : describeRouteComparison(previewQuery.data, t, units)),
    [isLoop, previewQuery.data, t, units],
  );

  // ── Hazards on the route (coachmark 3) ──
  // Covered by up to four nearby-hazard reads along the line; a route too long
  // to cover gets no hazard claim at all, rather than a "none" we did not check.
  const routePoints = useMemo(
    () => (route?.geometryPolyline6 ? decodePolyline(route.geometryPolyline6) : []),
    [route],
  );
  const hazardCentres = useMemo(() => hazardQueryCentres(routePoints), [routePoints]);
  const hazardsQuery = useQuery({
    queryKey: ['onboarding-route-hazards', route?.id],
    // Null (no claim) when a read was truncated or slow — see routeHazards.ts.
    queryFn: async (): Promise<number | null> => {
      const reads = Promise.all(
        (hazardCentres ?? []).map((c) =>
          mobileApi.getNearbyHazards(c.lat, c.lon, HAZARD_QUERY_RADIUS_METERS),
        ),
      ).then((batches) => countHazardsFromBatches(batches, routePoints));
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), HAZARD_COUNT_TIMEOUT_MS));
      return Promise.race([reads, timeout]);
    },
    enabled: Boolean(route) && hazardCentres !== null,
    retry: false,
  });
  const hazardCount = hazardCentres === null ? null : (hazardsQuery.data ?? null);
  const hazardsSettled = hazardCentres === null || !hazardsQuery.isLoading;

  // ── Coachmarks [D4] ──
  const mapRef = useRef<View>(null);
  const comparisonRef = useRef<View>(null);
  const hazardRowRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const [tourDone, setTourDone] = useState(hasShownOnboardingTour);

  const compareCoachText = useMemo(() => {
    const raw = previewQuery.data?.comparison;
    if (raw?.against === 'fast' && raw.verdict === 'safer') {
      if (!raw.extraMinutes) return t('onboardingRide.coachCompareFree');
      const saving = raw.busyRoadMeters
        ? describeBusyRoadSaving(raw.busyRoadMeters.current, raw.busyRoadMeters.comparison)
        : { kind: 'none' as const };
      if (saving.kind === 'saves') {
        return t('onboardingRide.coachCompareCost', { minutes: raw.extraMinutes });
      }
    }
    return t('onboardingRide.coachCompareGeneric');
  }, [previewQuery.data?.comparison, t]);

  const coachSteps = useMemo<CoachmarkStep[]>(() => {
    const steps: CoachmarkStep[] = [];
    // Outside risk coverage the colour and comparison steps have nothing true
    // to say [D9]; only the hazard step remains.
    if (riskAvailable && hasRiskSegments) {
      steps.push({ key: 'risk', text: t('onboardingRide.coachRisk'), targetRef: mapRef });
    }
    if (comparison && riskAvailable) {
      steps.push({ key: 'compare', text: compareCoachText, targetRef: comparisonRef });
    }
    if (hazardCount !== null) {
      steps.push({
        key: 'hazards',
        text: t(hazardCount > 0 ? 'onboardingRide.coachHazardsSome' : 'onboardingRide.coachHazardsNone'),
        targetRef: hazardRowRef,
      });
    }
    return steps;
  }, [riskAvailable, hasRiskSegments, comparison, compareCoachText, hazardCount, t]);

  const showTour = Boolean(route) && hazardsSettled && !tourDone && coachSteps.length > 0;

  const scrollTargetIntoView = useCallback(async (key: string) => {
    const target = key === 'compare' ? comparisonRef.current : key === 'hazards' ? hazardRowRef.current : null;
    if (!target || !contentRef.current || !scrollRef.current) return;
    await new Promise<void>((resolve) => {
      target.measureLayout(
        contentRef.current as never,
        (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - space[6]), animated: false });
          resolve();
        },
        () => resolve(),
      );
    });
  }, []);

  const finishTour = useCallback(() => {
    markOnboardingTourShown();
    setTourDone(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  useEffect(() => {
    if (reportedRef.current) return;
    if (route) {
      reportedRef.current = true;
      telemetry.capture('onb_route_shown', {
        mode: isLoop ? 'loop' : (previewQuery.data?.selectedMode ?? 'safe'),
        riskAvailable,
        isLoop,
        ms: Date.now() - shownAtRef.current,
      });
    } else if (failed) {
      reportedRef.current = true;
      telemetry.capture('onb_route_failed', { reason: isLoop ? 'loop_none' : 'preview_error' });
    }
  }, [route, failed, isLoop, riskAvailable, previewQuery.data?.selectedMode]);

  const handleSave = () => {
    if (!route) return;
    useAppStore.getState().setOnboardingRideHandoff({
      fresh: !isLoop,
      loop: isLoop && loopState.kind === 'found' ? loopState.loop : null,
    });
    telemetry.capture('onb_cta_save_tapped', { isLoop });
    router.push('/onboarding/signup-prompt' as never);
  };

  const handleSkip = () => {
    telemetry.capture('onb_route_skipped', { reason: 'route_failed' });
    router.replace('/onboarding/signup-prompt' as never);
  };

  // A loop starts and ends where the rider stands; mark that one point.
  const mapOrigin = isLoop ? location ?? undefined : routeRequest.origin;

  return (
    <View style={styles.root}>
      <View
        ref={mapRef}
        collapsable={false}
        importantForAccessibility={showTour ? 'no-hide-descendants' : 'auto'}
        style={[styles.mapWrap, { paddingTop: insets.top }]}
      >
        {route ? (
          <RouteMap
            routes={[route]}
            selectedRouteId={route.id}
            origin={mapOrigin}
            destination={isLoop ? undefined : routeRequest.destination}
            showRouteOverlay={false}
            containerStyle={styles.map}
            a11yContext={{ mode: 'planning' }}
          />
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        importantForAccessibility={showTour ? 'no-hide-descendants' : 'auto'}
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: space[4] }]}
      >
        <View ref={contentRef} collapsable={false} style={styles.sheetInner}>
        {!route && !failed ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <PedalSays
              pose="binoculars"
              line={t(isLoop ? 'onboardingRide.loadingLoop' : 'onboardingRide.loadingRoute')}
            />
            <Spinner />
          </View>
        ) : null}

        {failed ? (
          <View style={styles.group} accessibilityLiveRegion="polite">
            <PedalSays
              pose="sad"
              line={t(isLoop ? 'onboardingRide.loopFailed' : 'onboardingRide.routeFailed')}
            />
          </View>
        ) : null}

        {route ? (
          <FadeSlideIn>
            <View style={styles.group}>
              <Text style={styles.title} accessibilityRole="header">
                {t(isLoop ? 'onboardingRide.revealLoopTitle' : 'onboardingRide.revealTitle')}
              </Text>
              <Text style={styles.summary}>
                {t('onboardingRide.summary', {
                  distance: formatDistance(route.distanceMeters, units),
                  minutes: Math.max(1, Math.round(route.durationSeconds / 60)),
                })}
              </Text>

              {riskAvailable && hasRiskSegments ? (
                <PedalSays pose="point" line={t('onboardingRide.revealPedal')} />
              ) : (
                <PedalSays pose="binoculars" line={t('onboardingRide.noCoverage')} />
              )}

              {comparison && riskAvailable ? (
                <View
                  ref={comparisonRef}
                  collapsable={false}
                  style={[styles.comparison, comparison.isWarning && styles.comparisonWarning]}
                >
                  <Ionicons
                    name={comparison.isWarning ? 'warning' : 'shield-checkmark'}
                    size={20}
                    color={colors.textPrimary}
                  />
                  <View style={styles.comparisonText}>
                    <Text style={styles.comparisonTitle}>{comparison.title}</Text>
                    {comparison.subtitle ? (
                      <Text style={styles.comparisonSub}>{comparison.subtitle}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {hazardCount !== null ? (
                <View ref={hazardRowRef} collapsable={false} style={styles.hazardRow}>
                  <Ionicons
                    name={hazardCount > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.hazardText}>
                    {hazardCount === 0
                      ? t('onboardingRide.hazardRowNone')
                      : hazardCount === 1
                        ? t('onboardingRide.hazardRowOne')
                        : t('onboardingRide.hazardRowMany', { count: hazardCount })}
                  </Text>
                </View>
              ) : null}

              {hasRiskSegments ? <RiskDistributionCard riskSegments={route.riskSegments} /> : null}
            </View>
          </FadeSlideIn>
        ) : null}
        </View>
      </ScrollView>

      <View
        importantForAccessibility={showTour ? 'no-hide-descendants' : 'auto'}
        style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}
      >
        {failed ? (
          <>
            <Button variant="primary" size="lg" fullWidth onPress={() => router.back()}>
              {t('onboardingRide.tryAnother')}
            </Button>
            <Pressable onPress={handleSkip} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>{t('onboardingRide.skip')}</Text>
            </Pressable>
          </>
        ) : (
          <Button variant="primary" size="lg" fullWidth disabled={!route} onPress={handleSave}>
            {t('onboardingRide.saveCta')}
          </Button>
        )}
      </View>

      {showTour ? (
        <Coachmark
          steps={coachSteps}
          labels={{
            next: t('onboardingRide.coachNext'),
            done: t('onboardingRide.coachDone'),
            skip: t('onboardingRide.coachSkip'),
            progress: (current, total) => t('onboardingRide.coachProgress', { current, total }),
          }}
          onBeforeStep={scrollTargetIntoView}
          onAction={(step, action) => telemetry.capture('onb_coachmark', { step, action })}
          onFinish={finishTour}
        />
      ) : null}
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    mapWrap: {
      height: '45%',
    },
    map: {
      flex: 1,
    },
    mapPlaceholder: {
      backgroundColor: colors.bgSecondary,
    },
    sheet: {
      flex: 1,
    },
    sheetContent: {
      paddingHorizontal: space[5],
      paddingTop: space[4],
    },
    sheetInner: {
      gap: space[4],
    },
    hazardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[1],
    },
    hazardText: {
      ...textSm,
      color: colors.textSecondary,
    },
    loading: {
      gap: space[4],
      alignItems: 'stretch',
    },
    group: {
      gap: space[3],
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    summary: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
    comparison: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[3],
      padding: space[4],
      borderRadius: radii.xl,
      backgroundColor: safetyTints.safeLight,
    },
    comparisonWarning: {
      backgroundColor: safetyTints.cautionLight,
    },
    comparisonText: {
      flex: 1,
      gap: 2,
    },
    comparisonTitle: {
      ...textBase,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    comparisonSub: {
      ...textSm,
      color: colors.textSecondary,
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingHorizontal: space[5],
      paddingTop: space[3],
    },
    link: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
  });
