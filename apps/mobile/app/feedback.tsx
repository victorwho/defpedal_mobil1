import type { ImpactDashboard, RideImpact } from '@defensivepedal/core';
import {
  calculateTrailDistanceMeters,
  getPreviewOrigin,
  calculatePersonalMicrolives,
  calculateCommunitySeconds,
  mapBikeTypeToVehicle,
} from '@defensivepedal/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
  getMilestoneShareText,
} from '../src/components/MilestoneShareCard';
import { Button } from '../src/design-system/atoms';
import { Modal } from '../src/design-system/organisms/Modal';
import { useTheme, type ThemeColors } from '../src/design-system';
import { gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, text2xl, textBase, textSm } from '../src/design-system/tokens/typography';
import { mobileApi } from '../src/lib/api';
import { useRouteGuard } from '../src/hooks/useRouteGuard';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useAuthSession } from '../src/providers/AuthSessionProvider';
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
  readonly styles: ThemedStyles;
};

const ImpactStep = ({ rideImpact, onContinue, styles }: ImpactStepProps) => {
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

      <ImpactSummaryCard rideImpact={rideImpact} newBadges={rideImpact.newBadges} />

      <View style={styles.impactActions}>
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
};

const RatingStep = ({ onDone, onCancel, styles, colors }: RatingStepProps) => {
  const t = useT();
  const { user } = useAuthSession();
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

    if (user && !feedbackQueued) {
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
  };

  if (submitted) {
    return (
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('feedback.thankYou')}</Text>
          <Text style={styles.subtitle}>
            {t('feedback.thankYouSub')}
          </Text>
          <Pressable
            style={[styles.button, styles.doneButton]}
            onPress={onDone}
          >
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.cardContainer}>
        <View style={styles.card}>
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
            placeholderTextColor="#9CA3AF"
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
        </View>
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
      newBadges: [],
      xpBreakdown: [],
      totalXpEarned: 0,
      currentTotalXp: 0,
      riderTier: 'kickstand' as const,
      tierPromotion: null,
    };
  }, []);

  const incrementRatingSkipCount = useAppStore((s) => s.incrementRatingSkipCount);
  const [step, setStep] = useState<FeedbackStep>('impact');
  const [rideImpact, setRideImpact] = useState<RideImpact>(initialImpact);
  const [dashboard, setDashboard] = useState<ImpactDashboard | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // Try to enhance impact data from server (non-blocking — local data already shown)
  useEffect(() => {
    const tripServerId = activeTripClientId
      ? tripServerIds[activeTripClientId]
      : null;

    let cancelled = false;

    const enhance = async () => {
      try {
        // Upgrade with server data if available
        if (tripServerId) {
          const result = await mobileApi.fetchRideImpact(tripServerId);
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

    addEarnedMilestone(pendingMilestone);
    const shareText = getMilestoneShareText(pendingMilestone);

    try {
      await Share.share({ message: shareText });
    } catch {
      // User cancelled share — that's fine
    }

    setPendingMilestone(null);
  };

  const handleDismissMilestone = () => {
    if (pendingMilestone) {
      addEarnedMilestone(pendingMilestone);
    }
    setPendingMilestone(null);
  };

  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const signupPromptShownRef = useRef(false);

  const navigateAway = () => {
    resetFlow();
    router.replace('/route-planning');
  };

  const handleDone = () => {
    // Show signup prompt for anonymous users (once per session)
    if (authCtx?.isAnonymous && !signupPromptShownRef.current) {
      signupPromptShownRef.current = true;
      setShowSignupPrompt(true);
      return;
    }
    navigateAway();
  };

  const handleCancel = () => {
    navigateAway();
  };

  const handleSignupGoogle = async () => {
    if (!authCtx) return;
    setSignupSubmitting(true);
    try {
      await authCtx.signInWithGoogle();
    } catch {
      // Ignore — user cancelled or error
    } finally {
      setSignupSubmitting(false);
      navigateAway();
    }
  };

  const handleSignupDismiss = () => {
    setShowSignupPrompt(false);
    navigateAway();
  };

  if (!guardPassed) return null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        {step === 'impact' ? (
          <ImpactStep
            rideImpact={rideImpact}
            onContinue={() => setStep('rating')}
            styles={styles}
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
          />
        )}
      </SafeAreaView>

      {/* Milestone share modal */}
      {pendingMilestone ? (
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

      {/* Anonymous signup prompt after ride */}
      {showSignupPrompt ? (
        <Modal
          visible
          onClose={handleSignupDismiss}
          title={t('feedback.saveProgress')}
          description={t('feedback.signUpKeepStreak')}
          footer={
            <View style={styles.signupPromptFooter}>
              <Pressable
                style={({ pressed }) => [
                  styles.signupGoogleButton,
                  pressed && { opacity: 0.8 },
                  signupSubmitting && { opacity: 0.4 },
                ]}
                onPress={() => void handleSignupGoogle()}
                disabled={signupSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
              >
                <View style={styles.signupGoogleIcon}>
                  <Text style={styles.signupGoogleG}>G</Text>
                </View>
                <Text style={styles.signupGoogleLabel}>{t('feedback.continueGoogle')}</Text>
              </Pressable>
              <Button variant="ghost" size="md" onPress={handleSignupDismiss}>
                {t('feedback.maybeLater')}
              </Button>
            </View>
          }
        />
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
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
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
    // Rating step (preserved — light-themed card hex values intentionally kept)
    keyboardView: {
      flex: 1,
    },
    cardContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: space[5],
    },
    card: {
      backgroundColor: '#FFFDF5',
      borderRadius: radii.xl,
      padding: space[6],
      gap: space[4],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: '#111827',
      textAlign: 'center',
    },
    subtitle: {
      ...textBase,
      color: '#6B7280',
      textAlign: 'center',
      marginTop: -space[2],
    },
    sectionLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: '#374151',
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
      backgroundColor: '#FFFFFF',
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: space[3],
      minHeight: 100,
      fontSize: 15,
      color: '#111827',
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
      backgroundColor: '#D1D5DB',
    },
    cancelButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: '#374151',
    },
    submitButton: {
      backgroundColor: '#6B7280',
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: '#FFFFFF',
    },
    submitButtonTextDisabled: {
      color: '#D1D5DB',
    },
    doneButton: {
      backgroundColor: '#FDD700',
      marginTop: space[2],
      paddingVertical: space[4],
      minHeight: 52,
    },
    doneButtonText: {
      fontSize: 16,
      fontFamily: fontFamily.body.bold,
      color: '#111827',
    },
    milestoneFooter: {
      gap: space[2],
      alignItems: 'center',
    },
    signupPromptFooter: {
      gap: space[3],
      alignItems: 'center',
    },
    signupGoogleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: 52,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      gap: space[3],
    },
    signupGoogleIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    signupGoogleG: {
      fontFamily: fontFamily.body.bold,
      fontSize: 14,
      color: '#4285F4',
      marginTop: -1,
    },
    signupGoogleLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.textPrimary,
    },
  });
