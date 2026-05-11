import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button, Mascot } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { gray } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import { brandTints } from '../../src/design-system/tokens/tints';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useT } from '../../src/hooks/useTranslation';
import { mobileApi } from '../../src/lib/api';
import { PRIVACY_URL, TERMS_URL } from '../../src/lib/legal-urls';
import { navigateAfterOnboarding } from '../../src/lib/post-onboarding-nav';
import { useAuthSessionOptional } from '../../src/providers/AuthSessionProvider';
import { useAppStore } from '../../src/store/appStore';

// ---------------------------------------------------------------------------
// Progress steps
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = [
  { label: 'Location enabled', completed: true },
  { label: 'Safety score viewed', completed: true },
  { label: 'Goal selected', completed: true },
  { label: 'First route explored', completed: false },
  { label: 'Account created', completed: false },
] as const;

const COMPLETED_COUNT = PROGRESS_STEPS.filter((s) => s.completed).length;
const PROGRESS_PERCENT = Math.round((COMPLETED_COUNT / PROGRESS_STEPS.length) * 100);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingSignupPromptScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const authCtx = useAuthSessionOptional();
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);
  const resetAnonymousOpenCount = useAppStore((s) => s.resetAnonymousOpenCount);
  const params = useLocalSearchParams<{ mandatory?: string }>();
  const isMandatory = params.mandatory === 'true';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const finishOnboarding = () => {
    // Only reset the open-count on the *initial* onboarding completion (the
    // user is finishing the 5-screen onboarding flow for the first time).
    // When this screen is shown as a count-based re-prompt (`anonymousOpenCount >= 2`
    // with `onboardingCompleted` already true), dismissing with "Maybe later"
    // must NOT reset the count — otherwise the user loops at count 0↔2 forever
    // and never reaches the count >= 3 mandatory gate.
    const wasInitialOnboarding = useAppStore.getState().onboardingCompleted === false;
    setOnboardingCompleted(true);
    if (wasInitialOnboarding) {
      resetAnonymousOpenCount();
    }
    // If /onboarding/first-route generated a demo route this session, land on
    // /route-preview so the user sees the safe route their onboarding just
    // produced. Otherwise the helper resets and goes to a clean planner.
    navigateAfterOnboarding();
  };

  const handleGoogleSignIn = async () => {
    if (!authCtx) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await authCtx.signInWithGoogle();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setOnboardingCompleted(true);
      resetAnonymousOpenCount();

      // Returning users keep their existing username; only first-time sign-ups
      // (profile.username === null) need the choose-username step.
      let alreadyHasUsername = false;
      try {
        const profile = await mobileApi.getProfile();
        alreadyHasUsername = profile.username != null && profile.username.length > 0;
      } catch {
        // Network/profile fetch failure: fall back to the prompt rather than
        // dropping the user into the app with a half-known account state.
      }

      if (alreadyHasUsername) {
        // Preserve the demo circuit route from /onboarding/first-route so the
        // user lands on /route-preview with the safe route they just saw being
        // calculated — a concrete value moment, not an empty planner.
        navigateAfterOnboarding();
      } else {
        router.replace('/onboarding/choose-username');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignUp = () => {
    setOnboardingCompleted(true);
    router.replace('/auth');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4] }]}>
      <View style={styles.glowTop} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!isMandatory ? (
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
        ) : <View style={styles.backButton} />}

        <View style={styles.headerSection}>
          <View style={styles.mascotRow}>
            <Mascot pose="point" size="md" />
          </View>
          <Text style={styles.eyebrow}>Almost there</Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            {isMandatory
              ? 'Create an account to continue using Defensive Pedal. Your data will be preserved.'
              : 'Sync your rides, earn streaks, and join the community. You can always do this later.'}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${PROGRESS_PERCENT}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{PROGRESS_PERCENT}% complete</Text>

          <View style={styles.stepList}>
            {PROGRESS_STEPS.map((step) => (
              <View key={step.label} style={styles.stepRow}>
                <Ionicons
                  name={step.completed ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={step.completed ? colors.accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.stepLabel,
                    step.completed && styles.stepLabelCompleted,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sign-up card */}
        <View style={styles.card}>
          {/* Google */}
          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pressed && { opacity: 0.8 },
              isSubmitting && { opacity: 0.4 },
            ]}
            onPress={() => void handleGoogleSignIn()}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            <View style={styles.googleIconWrap}>
              <Text style={styles.googleG}>G</Text>
            </View>
            <Text style={styles.googleLabel}>Continue with Google</Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          <Button variant="secondary" size="lg" fullWidth onPress={handleEmailSignUp}>
            Sign up with email
          </Button>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>

        {/* Legal footer — quietly discloses ToS + Privacy acceptance. */}
        <View style={styles.legalFooter}>
          <Text style={styles.legalText}>
            {t('legal.signupAgreePrefix')}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(TERMS_URL)}
              accessibilityRole="link"
            >
              {t('legal.termsOfService')}
            </Text>
            {t('legal.signupAgreeAnd')}
            <Text
              style={styles.legalLink}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
              accessibilityRole="link"
            >
              {t('legal.privacyPolicy')}
            </Text>
            {t('legal.signupAgreeSuffix')}
          </Text>
        </View>
      </ScrollView>

      {/* Dismiss — pinned outside the scroll so it stays clear of the system nav bar. */}
      {!isMandatory ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
          <Pressable
            onPress={finishOnboarding}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Skip account creation for now"
          >
            <Text style={styles.dismissText}>Maybe later</Text>
          </Pressable>
        </View>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: space[5],
      paddingBottom: space[4],
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    glowTop: {
      position: 'absolute',
      top: -80,
      right: -20,
      width: 220,
      height: 220,
      borderRadius: 9999,
      backgroundColor: brandTints.accentMedium,
      opacity: 0.6,
    },
    headerSection: {
      gap: space[2],
    },
    mascotRow: {
      alignItems: 'center',
      paddingBottom: space[2],
    },
    eyebrow: {
      ...textXs,
      fontFamily: fontFamily.heading.extraBold,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      color: colors.accent,
    },
    title: {
      ...text2xl,
      fontFamily: fontFamily.heading.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },
    subtitle: {
      ...textBase,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    progressSection: {
      gap: space[3],
      paddingTop: space[4],
    },
    progressBarBg: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.bgSecondary,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    progressLabel: {
      ...textXs,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
    stepList: {
      gap: space[2],
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    stepLabel: {
      ...textSm,
      color: colors.textMuted,
    },
    stepLabelCompleted: {
      color: colors.textPrimary,
    },
    card: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[5],
      gap: space[4],
      marginTop: space[4],
      ...shadows.lg,
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      gap: space[3],
    },
    googleIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: gray[50],
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleG: {
      fontFamily: fontFamily.body.bold,
      fontSize: 14,
      // eslint-disable-next-line no-restricted-syntax -- Google brand identity colour; required by Google sign-in branding guidelines.
      color: '#4285F4',
      marginTop: -1,
    },
    googleLabel: {
      ...textSm,
      fontFamily: fontFamily.body.bold,
      color: colors.textPrimary,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.borderDefault,
    },
    dividerText: {
      ...textXs,
      color: gray[500],
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
      lineHeight: 20,
    },
    footer: {
      alignItems: 'center',
      paddingTop: space[4],
      paddingHorizontal: space[5],
      backgroundColor: colors.bgDeep,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderDefault,
    },
    dismissText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
    legalFooter: {
      paddingHorizontal: space[4],
      paddingTop: space[3],
    },
    legalText: {
      ...textXs,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 16,
    },
    legalLink: {
      ...textXs,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
  });
