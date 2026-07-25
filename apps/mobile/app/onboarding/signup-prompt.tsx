import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppleSignInButton } from '../../src/components/AppleSignInButton';
import { GoogleSignInButton } from '../../src/components/GoogleSignInButton';
import { Mascot } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
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

// Mirrors the REAL onboarding flow: location permission (index) → country
// check (region-check) → account (this screen). The old safety-score / goal /
// first-route steps were cut in 592b751 (2026-07-04) and the consent screen
// was removed 2026-07-16 — listing steps the user never saw lied to them.
const PROGRESS_STEPS = [
  { labelKey: 'onboarding.locationEnabled', completed: true },
  { labelKey: 'onboarding.regionConfirmed', completed: true },
  { labelKey: 'onboarding.accountCreated', completed: false },
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shared post-sign-in bookkeeping for every provider (Google, Apple).
  const completeSignup = async () => {
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
  };

  const handleGoogleSignIn = async () => {
    if (!authCtx) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error, cancelled } = await authCtx.signInWithGoogle();

      if (cancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      await completeSignup();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // The Apple button owns its native sheet + Supabase session; this runs after
  // the session exists. Cancelling the sheet fires no callback, so isSubmitting
  // is only raised here — never on sheet-open — to avoid a stuck disabled UI.
  const handleAppleSignInSuccess = async () => {
    setIsSubmitting(true);
    try {
      await completeSignup();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignUp = () => {
    // `email=1` pre-opens the (now collapsed-by-default) email form on /auth,
    // so the demoted link still lands the user directly on the form.
    router.replace('/auth?email=1');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4] }]}>
      <View style={styles.glowTop} />

      <ScrollView
        style={styles.scroll}
        // Bottom inset folded in here now that the pinned guest-path footer
        // (which used to own it) is gone — keeps the legal links clear of the
        // system nav bar.
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + space[4] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* No back button: registration is mandatory (2026-07-24). The region
            gate behind this screen forwards straight back here anyway, and the
            root-layout gate walls every other escape route. */}
        <View style={styles.backButton} />

        <View style={styles.headerSection}>
          <View style={styles.mascotRow}>
            <Mascot pose="point" size="md" />
          </View>
          <Text style={styles.eyebrow}>{t('onboarding.almostThere')}</Text>
          {/* Community-framed headline + the honest "why we require this"
              (2026-07-24, mandatory registration): trustworthy hazard/safety
              data needs real riders, and the account saves their progress.
              The anonymous→account merge is live (merge_anonymous_account +
              AnonMergeManager), so the copy can promise continuity. */}
          <Text style={styles.title}>{t('onboarding.signupPromptTitle')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.signupSubMandatory')}</Text>
        </View>

        {/* Primary actions — directly under the benefit copy so they sit above
            the fold on a 6.1" screen. */}
        <View style={styles.ctaSection}>
          {/* Sign in with Apple — iOS only (renders null on Android/web).
              Required by App Store Guideline 4.8 because Google sign-in is
              offered, and this screen is now the mandatory registration wall —
              the first surface every iOS reviewer sees. Equal prominence,
              above Google, matching auth.tsx. */}
          <AppleSignInButton
            onStart={() => setErrorMessage(null)}
            onSuccess={() => void handleAppleSignInSuccess()}
            onError={(message) => setErrorMessage(message)}
          />
          <GoogleSignInButton
            label={t('onboarding.continueWithGoogle')}
            onPress={() => void handleGoogleSignIn()}
            disabled={isSubmitting}
            accessibilityLabel={t('onboarding.a11yGoogle')}
          />
          <Text style={styles.trustLine}>{t('onboarding.trustMicroline')}</Text>
          <Pressable
            onPress={handleEmailSignUp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.useEmailInstead')}
            style={styles.emailLinkRow}
          >
            <Text style={styles.emailLink}>{t('onboarding.useEmailInstead')}</Text>
          </Pressable>
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>

        {/* Endowed progress — kept per research; now below the CTA. */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${PROGRESS_PERCENT}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{t('onboarding.percentComplete', { percent: PROGRESS_PERCENT })}</Text>

          <View style={styles.stepList}>
            {PROGRESS_STEPS.map((step) => (
              <View key={step.labelKey} style={styles.stepRow}>
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
                  {t(step.labelKey)}
                </Text>
              </View>
            ))}
          </View>
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
    ctaSection: {
      paddingTop: space[5],
      gap: space[3],
    },
    trustLine: {
      ...textXs,
      color: colors.textMuted,
      textAlign: 'center',
    },
    emailLinkRow: {
      alignSelf: 'center',
      paddingVertical: space[1],
    },
    emailLink: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
      lineHeight: 20,
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
