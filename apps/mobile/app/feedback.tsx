import type { ImpactDashboard, ReviewTrigger, RideImpact } from '@defensivepedal/core';
import {
  calculateCaloriesBurned,
  calculateTrailDistanceMeters,
  evaluateReviewEligibility,
  getPreviewOrigin,
  calculatePersonalMicrolives,
  calculateCommunitySeconds,
  mapBikeTypeToVehicle,
} from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImpactSummaryCard } from '../src/components/ImpactSummaryCard';
import {
  type MilestoneKey,
  MilestoneShareCard,
  MILESTONE_CONFIGS,
  detectNewMilestones,
} from '../src/components/MilestoneShareCard';
import { Button, Surface } from '../src/design-system/atoms';
import { Toast } from '../src/design-system/molecules/Toast';
import { Modal } from '../src/design-system/organisms/Modal';
import { AnalyticsOptInCard } from '../src/design-system/organisms/AnalyticsOptInCard';
import { ReviewPromptCard } from '../src/design-system/organisms/ReviewPromptCard';
import { SaveRideCard } from '../src/design-system/organisms/SaveRideCard';
import { useCelebrationStage } from '../src/design-system/hooks/useCelebrationStage';
import { mascotPoses } from '../src/design-system/tokens/mascotPoses';
import { useConnectivity } from '../src/providers/ConnectivityMonitor';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { shadows } from '../src/design-system/tokens/shadows';
import { fontFamily, text2xl, textBase, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import {
  isPostSecondRideTriggered,
  shouldShowAnalyticsPrompt,
  type AnalyticsPromptId,
} from '../src/lib/analytics-optin';
import { claimPromptSlot } from '../src/lib/prompt-arbitration';
import { shouldShowSaveRidePrompt } from '../src/lib/save-ride-prompt';
import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useShareCard } from '../src/hooks/useShareCard';
import { useShareRide } from '../src/hooks/useShareRide';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';
import { useT } from '../src/hooks/useTranslation';
import { useConfirmation } from '../src/hooks/useConfirmation';

// ---------------------------------------------------------------------------
// Star rating (preserved from original)
// ---------------------------------------------------------------------------

const STAR_SIZE = 40;
const STAR_COLOR_INACTIVE = gray[300];

const formatCoordinateLabel = (lat: number, lon: number) =>
  `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

type ThemedStyles = ReturnType<typeof createThemedStyles>;

function StarRow({
  rating,
  onSelect,
  styles,
  accentColor,
}: {
  rating: number;
  onSelect: (value: number) => void;
  styles: ThemedStyles;
  accentColor: string;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${value} star${value > 1 ? 's' : ''}`}
        >
          <Text
            style={[
              styles.starIcon,
              { color: rating >= value ? accentColor : STAR_COLOR_INACTIVE },
            ]}
          >
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Impact summary
// ---------------------------------------------------------------------------

type ImpactStepProps = {
  readonly rideImpact: RideImpact;
  readonly onContinue: () => void;
  readonly onShare: () => void;
  readonly isSharing: boolean;
  readonly styles: ThemedStyles;
  readonly colors: ThemeColors;
  /** Current streak count post-save. Drives the +1 celebration animation. */
  readonly streakCount?: number;
  /**
   * Save-ride signup card slot (anonymous users, gated by
   * shouldShowSaveRidePrompt in the parent) — rendered after the XP/badges
   * summary, before the action buttons.
   */
  readonly saveRideSlot?: ReactNode;
  /**
   * Analytics opt-in card slot (prompts 1/2, gated + arbitrated in the
   * parent — mutually exclusive with saveRideSlot by arbitration). Same
   * slot family, same position.
   */
  readonly analyticsOptInSlot?: ReactNode;
};

const ImpactStep = ({ rideImpact, onContinue, onShare, isSharing, styles, colors, streakCount, saveRideSlot, analyticsOptInSlot }: ImpactStepProps) => {
  const t = useT();
  return (
    <ScrollView
      contentContainerStyle={styles.impactScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.impactHeadline}>{t('feedback.greatRide')}</Text>
      <Text style={styles.impactSubtext}>
        {t('feedback.positiveImpact')}
      </Text>

      <ImpactSummaryCard
        rideImpact={rideImpact}
        newBadges={rideImpact.newBadges}
        streakCount={streakCount}
      />

      {saveRideSlot}
      {analyticsOptInSlot}

      <View style={styles.impactActions}>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onPress={onShare}
          loading={isSharing}
          disabled={isSharing}
          leftIcon={
            isSharing ? null : (
              <Ionicons name="share-social-outline" size={20} color={colors.textPrimary} />
            )
          }
          accessibilityLabel={t('share.shareRide')}
        >
          {t('share.shareRide')}
        </Button>
        <Button variant="primary" size="lg" fullWidth onPress={onContinue}>
          {t('feedback.continue')}
        </Button>
      </View>
    </ScrollView>
  );
};

// ---------------------------------------------------------------------------
// Step 2: Star rating + comment (preserved logic)
// ---------------------------------------------------------------------------

type RatingStepProps = {
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly styles: ThemedStyles;
  readonly colors: ThemeColors;
  /**
   * Inferred review-prompt trigger label, derived in the parent from this
   * ride's signal (tier promotion > badge unlock > milestone > positive
   * feedback). Forwarded straight to the eligibility helper for telemetry.
   */
  readonly reviewTrigger: ReviewTrigger;
};

const RatingStep = ({ onDone, onCancel, styles, colors, reviewTrigger }: RatingStepProps) => {
  const t = useT();
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const routeRequest = useAppStore((s) => s.routeRequest);
  const routePreview = useAppStore((s) => s.routePreview);
  const selectedRouteId = useAppStore((s) => s.selectedRouteId);
  const navigationSession = useAppStore((s) => s.navigationSession);
  const activeTripClientId = useAppStore((s) => s.activeTripClientId);
  const tripServerIds = useAppStore((s) => s.tripServerIds);
  const queuedMutations = useAppStore((s) => s.queuedMutations);
  const enqueueMutation = useAppStore((s) => s.enqueueMutation);

  // ── Play Store review prompt (Stage 1 eligibility) ─────────────────────
  const reviewPromptState = useAppStore((s) => s.reviewPromptState);
  const completedRideCount = useAppStore((s) => s.completedRideCount);
  const { isOnline } = useConnectivity();
  const [showReviewCard, setShowReviewCard] = useState(false);

  const selectedRoute =
    routePreview?.routes.find((r) => r.id === selectedRouteId) ??
    routePreview?.routes[0] ??
    null;

  const feedbackQueued = queuedMutations.some(
    (m) =>
      m.type === 'feedback' &&
      (m.payload as { clientTripId?: string }).clientTripId === activeTripClientId,
  );

  const submitDisabled = rating === 0 || feedbackQueued;

  const handleSubmit = () => {
    if (!navigationSession) return;

    // Enqueue regardless of immediate session state — the offline queue is the
    // durable layer, and the drain attaches the bearer token at request time.
    // If no session is ever recovered, the queue's permanent-error path
    // (isPermanentError on 4xx) kills the mutation cleanly after the first
    // 401 instead of retrying forever.
    if (!feedbackQueued) {
      enqueueMutation('feedback', {
        clientTripId: activeTripClientId ?? undefined,
        tripId: activeTripClientId ? tripServerIds[activeTripClientId] : undefined,
        sessionId: navigationSession.sessionId,
        startLocationText: formatCoordinateLabel(
          getPreviewOrigin(routeRequest).lat,
          getPreviewOrigin(routeRequest).lon,
        ),
        destinationText: formatCoordinateLabel(
          routeRequest.destination.lat,
          routeRequest.destination.lon,
        ),
        distanceMeters: selectedRoute?.distanceMeters ?? 0,
        durationSeconds: selectedRoute?.adjustedDurationSeconds ?? 0,
        rating,
        feedbackText: comments,
        submittedAt: new Date().toISOString(),
      });
    }

    setSubmitted(true);

    // Stage 1 eligibility for the Play Store review prompt. Only consider
    // showing the card when the user just gave a positive rating (4-5 stars)
    // — we never want to ask after a meh ride. The card itself handles the
    // second-stage sentiment funnel; this check is just the gate.
    const sessionHadReroute = navigationSession?.lastRerouteAt != null;
    const decision = evaluateReviewEligibility(reviewPromptState, {
      nowIso: new Date().toISOString(),
      completedRideCount,
      trigger: reviewTrigger,
      suppress: {
        // `lastErrorAt` is stamped by ErrorBoundary.componentDidCatch; the
        // helper cross-checks that timestamp against its 24h window, so we
        // don't need a separate live error flag here.
        hasRecentError: false,
        isOffline: !isOnline,
        // We're on AWAITING_FEEDBACK by route guard, never NAVIGATING.
        isNavigating: false,
        hadRerouteOnLastRide: sessionHadReroute,
        lastRideDiscarded: false,
        lastFeedbackNegative: rating < 4,
      },
    });
    // Session arbitration (analytics-optin plan): the review card yields if
    // an analytics opt-in card already showed this session — never two asks
    // in one session. SaveRide + review coexisting is unchanged behavior.
    if (decision !== null && claimPromptSlot('review')) {
      setShowReviewCard(true);
    }
  };

  if (submitted) {
    return (
      <View style={styles.cardContainer}>
        <Surface variant="form" style={styles.card}>
          <Text style={styles.title}>{t('feedback.thankYou')}</Text>
          <Text style={styles.subtitle}>
            {t('feedback.thankYouSub')}
          </Text>
          {showReviewCard ? (
            <View style={styles.reviewPromptSlot}>
              <ReviewPromptCard
                onNegativeFeedback={() => {
                  // Negative path: user already opened the in-app feedback
                  // (us). Just hide the card and let them tap Done.
                  setShowReviewCard(false);
                }}
                onDismiss={() => setShowReviewCard(false)}
              />
            </View>
          ) : null}
          <Pressable
            style={[styles.button, styles.doneButton]}
            onPress={onDone}
          >
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </Pressable>
        </Surface>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cardContainer}>
        <Surface variant="form" style={styles.card}>
          <Text style={styles.title}>{t('feedback.howSafe')}</Text>
          <Text style={styles.subtitle}>
            {t('feedback.safetyHelps')}
          </Text>

          <Text style={styles.sectionLabel}>{t('feedback.perceivedSafety')}</Text>
          <StarRow rating={rating} onSelect={setRating} styles={styles} accentColor={colors.accent} />

          <Text style={styles.sectionLabel}>{t('feedback.commentsOptional')}</Text>
          <TextInput
            style={styles.commentInput}
            multiline
            numberOfLines={4}
            placeholder={t('feedback.commentsPlaceholder')}
            placeholderTextColor={gray[400]}
            value={comments}
            onChangeText={setComments}
            textAlignVertical="top"
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.submitButton,
                submitDisabled && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              <Text
                style={[
                  styles.submitButtonText,
                  submitDisabled && styles.submitButtonTextDisabled,
                ]}
              >
                {t('feedback.submit')}
              </Text>
            </Pressable>
          </View>
        </Surface>
      </View>
    </KeyboardAvoidingView>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type FeedbackStep = 'impact' | 'rating';

export default function FeedbackScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const guardPassed = useRouteGuard({
    requiredStates: ['AWAITING_FEEDBACK'],
  });
  const authCtx = useAuthSessionOptional();

  const t = useT();
  const confirm = useConfirmation();
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const activeTripClientId = useAppStore((s) => s.activeTripClientId);
  const tripServerIds = useAppStore((s) => s.tripServerIds);
  const earnedMilestones = useAppStore((s) => s.earnedMilestones);
  const addEarnedMilestone = useAppStore((s) => s.addEarnedMilestone);
  const enqueueBadgeUnlocks = useAppStore((s) => s.enqueueBadgeUnlocks);
  const setTierPromotion = useAppStore((s) => s.setTierPromotion);
  const resetFlow = useAppStore((s) => s.resetFlow);

  // Compute impact synchronously on mount from store data
  const initialImpact = useMemo<RideImpact>(() => {
    const store = useAppStore.getState();
    const session = store.navigationSession;
    const preview = store.routePreview;
    const route = preview?.routes.find((r) => r.id === store.selectedRouteId) ?? preview?.routes[0] ?? null;
    const breadcrumbs = session?.gpsBreadcrumbs ?? [];
    const trailDist = breadcrumbs.length >= 2
      ? calculateTrailDistanceMeters(breadcrumbs)
      : 0;
    // Use actual GPS trail distance only — never fall back to planned route
    // distance, which inflates stats when the rider didn't actually move.
    const distMeters = trailDist;
    const distKm = distMeters / 1000;
    const co2 = distKm * 0.12;
    const money = distKm * 0.35;
    const vehicle = mapBikeTypeToVehicle(store.bikeType);
    const weightKg = store.weightKg;
    const durationSeconds = session?.startedAt
      ? Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000))
      : 0;
    return {
      tripId: store.activeTripClientId ?? 'local',
      co2SavedKg: co2,
      moneySavedEur: money,
      hazardsWarnedCount: 0,
      distanceMeters: distMeters,
      equivalentText: co2 >= 0.5 ? 'Planting a small tree seedling'
        : co2 >= 0.1 ? 'Charging a smartphone 12 times'
        : null,
      personalMicrolives: calculatePersonalMicrolives(distKm, vehicle, null),
      communitySeconds: calculateCommunitySeconds(distKm, vehicle),
      caloriesBurned: calculateCaloriesBurned(distMeters, durationSeconds, vehicle, weightKg),
      newBadges: [],
      xpBreakdown: [],
      totalXpEarned: 0,
      currentTotalXp: 0,
      riderTier: 'kickstand' as const,
      tierPromotion: null,
    };
  }, []);

  const incrementRatingSkipCount = useAppStore((s) => s.incrementRatingSkipCount);
  const seedReviewInstallAtIfMissing = useAppStore((s) => s.seedReviewInstallAtIfMissing);

  // Seed the review-prompt install timestamp on the first AWAITING_FEEDBACK
  // entry. Idempotent — subsequent calls are no-ops. Reaching the feedback
  // screen is a stronger "user is engaged" signal than first app open, so we
  // start the 7-day install gate from here.
  useEffect(() => {
    seedReviewInstallAtIfMissing();
  }, [seedReviewInstallAtIfMissing]);

  const [step, setStep] = useState<FeedbackStep>('impact');
  const [rideImpact, setRideImpact] = useState<RideImpact>(initialImpact);
  const [dashboard, setDashboard] = useState<ImpactDashboard | null>(null);

  // Ride share (image-based, Surface A)
  const shareRide = useShareRide();

  // Milestone card share (image-based, Surface F)
  const shareCard = useShareCard();
  const handleShareRide = async () => {
    const store = useAppStore.getState();
    const session = store.navigationSession;
    const breadcrumbs = session?.gpsBreadcrumbs ?? [];
    // [lon, lat] order required by the share hook — DO NOT swap.
    const coords: [number, number][] = breadcrumbs.map((pt) => [pt.lon, pt.lat]);
    if (coords.length < 2) {
      // Without a GPS trail we can't render a map background — let the hook
      // fail gracefully; it will surface an error message via toastMessage.
    }

    const distanceKm = rideImpact.distanceMeters / 1000;
    const startedAt = session?.startedAt ?? new Date().toISOString();
    const endedAt = new Date().toISOString();
    const durationMinutes = Math.max(
      1,
      Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
    );

    const preview = store.routePreview;
    const selectedRoute =
      preview?.routes.find((r) => r.id === store.selectedRouteId) ?? preview?.routes[0] ?? null;
    // Only forward LineString risk segments — MultiLineString is rare and not
    // worth expanding for the static map background.
    const riskSegments = selectedRoute?.riskSegments
      ?.filter((seg) => seg.geometry.type === 'LineString')
      .map((seg) => ({
        coords: (seg.geometry as { type: 'LineString'; coordinates: [number, number][] }).coordinates,
        color: seg.color,
      }));

    await shareRide.share({
      coords,
      riskSegments,
      distanceKm,
      durationMinutes,
      co2SavedKg: rideImpact.co2SavedKg,
      microlivesGained: rideImpact.personalMicrolives > 0 ? rideImpact.personalMicrolives : undefined,
      dateIso: endedAt,
    });
  };

  // Try to enhance impact data from server (non-blocking — local data already shown)
  useEffect(() => {
    const tripServerId = activeTripClientId
      ? tripServerIds[activeTripClientId]
      : null;

    let cancelled = false;

    const enhance = async () => {
      try {
        // Award XP and fetch server-enriched impact data
        if (tripServerId) {
          // Derive hadDestination from route request (non-zero destination)
          const storeState = useAppStore.getState();
          const dest = storeState.routeRequest.destination;
          const hadDestination = dest.lat !== 0 || dest.lon !== 0;

          // POST first to award XP, then use the response
          let result: RideImpact;
          try {
            result = await mobileApi.recordRideImpact(
              tripServerId,
              initialImpact.distanceMeters,
              { hadDestination, weightKg: useAppStore.getState().weightKg },
            );
          } catch {
            // POST may 409 (already recorded) — fall back to GET
            result = await mobileApi.fetchRideImpact(tripServerId);
          }
          if (!cancelled) {
            // Merge server data with local values, preserving whichever
            // source has richer data (e.g. local microlives vs server CO2)
            setRideImpact((prev) => {
              const useServerCore = result.distanceMeters > 0 || prev.distanceMeters === 0;
              return {
                ...(useServerCore ? result : prev),
                // Prefer whichever source has non-zero microlives/communitySeconds
                personalMicrolives: result.personalMicrolives > 0
                  ? result.personalMicrolives
                  : prev.personalMicrolives,
                communitySeconds: result.communitySeconds > 0
                  ? result.communitySeconds
                  : prev.communitySeconds,
                newBadges: result.newBadges.length > 0 ? result.newBadges : prev.newBadges,
                equivalentText: result.equivalentText ?? prev.equivalentText,
              };
            });
            if (result.newBadges.length > 0) {
              enqueueBadgeUnlocks(result.newBadges);
            }
            // Queue tier promotion overlay (shows after badge overlays)
            if (result.tierPromotion?.promoted) {
              setTierPromotion(result.tierPromotion);
            }
          }
        }
        // Fetch dashboard for milestone detection
        const dash = await mobileApi.fetchImpactDashboard(
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        if (!cancelled) {
            setDashboard(dash);
            // Backfill tier info from dashboard when ride-specific XP wasn't computed
            setRideImpact((prev) => prev.currentTotalXp > 0 ? prev : {
              ...prev,
              currentTotalXp: dash.totalXp,
              riderTier: dash.riderTier ?? prev.riderTier,
            });
          }
      } catch { /* server enhancement is optional */ }
    };

    void enhance();
    return () => { cancelled = true; };
  }, [activeTripClientId, tripServerIds]);

  // Milestone detection
  const [pendingMilestone, setPendingMilestone] = useState<MilestoneKey | null>(null);
  // Audit 2026-07-05 UX-12: register the milestone modal with the celebration
  // coordinator so it can't render its backdrop UNDER the root-level badge /
  // rank-up overlays. It's lowest priority, so those pop first; this modal
  // only shows once it holds the stage.
  const canShowMilestone = useCelebrationStage('milestone', pendingMilestone != null);

  useEffect(() => {
    if (!dashboard) return;

    const newMilestones = detectNewMilestones({
      streakDays: dashboard.streak.currentStreak,
      totalDistanceKm: (dashboard.totalCo2SavedKg / 0.12), // reverse from CO2 to approximate km
      totalRides: dashboard.thisWeek.rides, // approximate — full total not in dashboard
      totalCo2Kg: dashboard.totalCo2SavedKg,
      earnedMilestones,
    });

    if (newMilestones.length > 0) {
      setPendingMilestone(newMilestones[0]);
    }
  }, [dashboard, earnedMilestones]);

  const handleShareMilestone = async () => {
    if (!pendingMilestone) return;
    const milestoneKey = pendingMilestone;
    const config = MILESTONE_CONFIGS[milestoneKey];

    // Mark earned up-front so the modal can close immediately if the user
    // cancels the share sheet — the milestone shouldn't reappear next session.
    addEarnedMilestone(milestoneKey);

    await shareCard.share({
      type: 'milestone',
      milestoneTitle: config.title,
      milestoneValue: config.statLabel,
      card: <MilestoneShareCard variant="capture" milestoneKey={milestoneKey} />,
    });

    setPendingMilestone(null);
  };

  const handleDismissMilestone = () => {
    if (pendingMilestone) {
      addEarnedMilestone(pendingMilestone);
    }
    setPendingMilestone(null);
  };

  // ── Save-ride signup card (anonymous users, impact step) ──
  // Replaces the old end-of-flow signup Modal: one ask surface, inline at the
  // natural pause point right under the XP/badge results, on the capped ride
  // schedule (1, 3, +5 — see src/lib/save-ride-prompt.ts). Never a blocking
  // modal, never a second ask in the same session.
  const saveRidePromptState = useAppStore((s) => s.saveRidePrompt);
  const completedRideCountForPrompt = useAppStore((s) => s.completedRideCount);
  const appStateForPrompt = useAppStore((s) => s.appState);
  const [saveRideVisible, setSaveRideVisible] = useState(false);
  const [saveRideToast, setSaveRideToast] = useState<string | null>(null);
  // Analytics opt-in prompts 1 (post-second-ride) + 2 (post-first-hazard,
  // deferred here from route-planning — see the plan's implementer's-choice
  // note). At most one can latch per visit.
  const [analyticsPromptId, setAnalyticsPromptId] = useState<AnalyticsPromptId | null>(null);
  const [analyticsToast, setAnalyticsToast] = useState<string | null>(null);
  const saveRideEvaluatedRef = useRef(false);

  // Evaluate eligibility ONCE per screen visit, after auth settles. The cards
  // record "shown" on mount, which would immediately re-fail a live-computed
  // check — so the verdict is latched into state (same pattern as
  // showReviewCard on the rating step). Order encodes the arbitration
  // priority: SaveRideCard claims its session slot FIRST; the analytics
  // prompts only claim when the save-ride card didn't (claimPromptSlot also
  // blocks analytics when a review/save-ride card showed earlier this
  // session, and vice versa — spec: never in the same session).
  useEffect(() => {
    if (saveRideEvaluatedRef.current) return;
    if (!authCtx || authCtx.isLoading) return;
    saveRideEvaluatedRef.current = true;

    if (
      shouldShowSaveRidePrompt({
        isAnonymous: authCtx.isAnonymous,
        completedRideCount: completedRideCountForPrompt,
        state: saveRidePromptState,
        isNavigating: appStateForPrompt === 'NAVIGATING',
      }) &&
      claimPromptSlot('save_ride')
    ) {
      setSaveRideVisible(true);
      return;
    }

    const store = useAppStore.getState();
    const analyticsGate = {
      posthogEnabled: store.analyticsConsent.posthog,
      state: store.analyticsPrompt,
      now: new Date(),
    };
    const candidate: AnalyticsPromptId | null = isPostSecondRideTriggered(
      completedRideCountForPrompt,
    )
      ? 'post_second_ride'
      : store.analyticsPrompt.hasReportedHazard
        ? 'post_first_hazard'
        : null;
    if (
      candidate !== null &&
      appStateForPrompt !== 'NAVIGATING' &&
      shouldShowAnalyticsPrompt(candidate, analyticsGate) &&
      claimPromptSlot('analytics')
    ) {
      setAnalyticsPromptId(candidate);
    }
  }, [authCtx, completedRideCountForPrompt, saveRidePromptState, appStateForPrompt]);

  const navigateAway = () => {
    resetFlow();
    router.replace('/route-planning');
  };

  const handleDone = () => {
    navigateAway();
  };

  const handleCancel = () => {
    navigateAway();
  };

  // Derive the review-prompt trigger label from the strongest signal this
  // ride produced. Telemetry-only — does not change which card surfaces.
  // Ladder (highest → lowest signal):
  //   tier_promotion → badge_unlocked → co2_milestone → positive_feedback
  // Recomputed on every render; cheap (handful of boolean checks).
  const inferredReviewTrigger: ReviewTrigger =
    rideImpact.tierPromotion?.promoted
      ? 'tier_promotion'
      : rideImpact.newBadges.length > 0
        ? 'badge_unlocked'
        : pendingMilestone != null
          ? 'co2_milestone'
          : 'positive_feedback';

  if (!guardPassed) return null;

  return (
    <View style={styles.root}>
      {/*
        Warm the mascot bitmap cache during the impact step so the
        ReviewPromptCard's <Image> has zero decode latency when it mounts
        post-submit. Rendered off-screen (1×1, opacity 0) — RN's Image
        component still decodes and caches it.
      */}
      <Image
        source={mascotPoses['high-five'].source}
        style={styles.mascotPreload}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <SafeAreaView style={styles.safeArea}>
        {step === 'impact' ? (
          <ImpactStep
            rideImpact={rideImpact}
            onContinue={() => setStep('rating')}
            onShare={() => void handleShareRide()}
            isSharing={shareRide.isSharing}
            styles={styles}
            colors={colors}
            streakCount={dashboard?.streak.currentStreak}
            saveRideSlot={
              saveRideVisible ? (
                <View style={styles.saveRideSlot}>
                  <SaveRideCard
                    onSuccess={() => {
                      setSaveRideVisible(false);
                      setSaveRideToast(t('saveRide.successToast'));
                    }}
                    onDismiss={() => setSaveRideVisible(false)}
                  />
                </View>
              ) : null
            }
            analyticsOptInSlot={
              analyticsPromptId !== null ? (
                <AnalyticsOptInCard
                  promptId={analyticsPromptId}
                  onConverted={() => {
                    setAnalyticsPromptId(null);
                    setAnalyticsToast(t('analyticsOptIn.successToast'));
                  }}
                  onDismiss={() => setAnalyticsPromptId(null)}
                />
              ) : null
            }
          />
        ) : (
          <RatingStep
            onDone={handleDone}
            onCancel={() => {
              confirm({
                title: t('feedback.skipConfirmTitle'),
                message: t('feedback.skipConfirmMessage'),
                confirmLabel: t('feedback.skipConfirmButton'),
                onConfirm: () => {
                  incrementRatingSkipCount();
                  handleCancel();
                },
              });
            }}
            styles={styles}
            colors={colors}
            reviewTrigger={inferredReviewTrigger}
          />
        )}
      </SafeAreaView>

      {/* Ride share toast (offline / error states) */}
      {shareRide.toastMessage ? (
        <View style={styles.shareToastContainer} pointerEvents="box-none">
          <Toast
            message={shareRide.toastMessage}
            variant="warning"
            onDismiss={shareRide.consumeToast}
          />
        </View>
      ) : null}

      {/* Save-ride sign-in success toast */}
      {saveRideToast ? (
        <View style={styles.shareToastContainer} pointerEvents="box-none">
          <Toast
            message={saveRideToast}
            variant="success"
            onDismiss={() => setSaveRideToast(null)}
          />
        </View>
      ) : null}

      {/* Analytics opt-in success toast */}
      {analyticsToast ? (
        <View style={styles.shareToastContainer} pointerEvents="box-none">
          <Toast
            message={analyticsToast}
            variant="success"
            onDismiss={() => setAnalyticsToast(null)}
          />
        </View>
      ) : null}

      {/* Milestone share modal */}
      {pendingMilestone && canShowMilestone ? (
        <Modal
          visible
          onClose={handleDismissMilestone}
          title={t('feedback.milestone')}
          description={MILESTONE_CONFIGS[pendingMilestone].subtitle}
          footer={
            <View style={styles.milestoneFooter}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => void handleShareMilestone()}
                loading={shareCard.isSharing}
                disabled={shareCard.isSharing}
              >
                {t('feedback.shareAchievement')}
              </Button>
              <Button
                variant="ghost"
                size="md"
                onPress={handleDismissMilestone}
              >
                {t('feedback.maybeLater')}
              </Button>
            </View>
          }
        >
          <MilestoneShareCard milestoneKey={pendingMilestone} />
        </Modal>
      ) : null}

    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    safeArea: {
      flex: 1,
    },
    // Impact step
    impactScrollContent: {
      paddingHorizontal: space[5],
      paddingVertical: space[6],
      gap: space[4],
    },
    impactHeadline: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    impactSubtext: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: -space[2],
    },
    impactActions: {
      gap: space[3],
      paddingTop: space[2],
    },
    // Rating step — "warm paper" form card. bgForm is theme-aware (cream on dark,
    // white on light); text always renders dark gray so the card stays readable in
    // both themes regardless of the surrounding bgDeep.
    keyboardView: {
      flex: 1,
    },
    cardContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: space[5],
    },
    card: {
      padding: space[6],
      gap: space[4],
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: gray[900],
      textAlign: 'center',
    },
    subtitle: {
      ...textBase,
      color: gray[500],
      textAlign: 'center',
      marginTop: -space[2],
    },
    sectionLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: gray[700],
      textAlign: 'center',
    },
    starRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: space[3],
    },
    starIcon: {
      fontSize: STAR_SIZE,
      lineHeight: STAR_SIZE + 8,
    },
    commentInput: {
      backgroundColor: gray[50],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: gray[200],
      padding: space[3],
      minHeight: 100,
      fontSize: 15,
      color: gray[900],
      fontFamily: fontFamily.body.regular,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: space[3],
      marginTop: space[2],
    },
    button: {
      flex: 1,
      paddingVertical: space[4],
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: gray[300],
    },
    cancelButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: gray[700],
    },
    submitButton: {
      backgroundColor: gray[500],
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: gray[50],
    },
    submitButtonTextDisabled: {
      color: gray[300],
    },
    doneButton: {
      backgroundColor: colors.accent,
      marginTop: space[2],
      paddingVertical: space[4],
      minHeight: 52,
    },
    reviewPromptSlot: {
      marginTop: space[3],
    },
    mascotPreload: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
    },
    doneButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: gray[900],
    },
    milestoneFooter: {
      gap: space[2],
      alignItems: 'center',
    },
    shareToastContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: space[6],
      alignItems: 'center',
    },
    // Save-ride card slot — the scroll content's own gap handles top spacing;
    // no extra chrome, the card owns its surface.
    saveRideSlot: {
      // Placeholder for future spacing tweaks; kept so the slot has a stable
      // style hook in the JSX.
    },
  });
