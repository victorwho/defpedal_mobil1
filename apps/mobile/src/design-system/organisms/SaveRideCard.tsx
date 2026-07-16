/**
 * SaveRideCard — contextual signup ask on the post-ride impact screen,
 * anonymous users only. The rider has just seen their CO2/XP/badge results —
 * the highest-motivation conversion moment.
 *
 * Modeled structurally on ReviewPromptCard:
 *   - Inline card at a natural pause point; NEVER a blocking modal.
 *   - Never stacked over a celebration overlay (it lives in the impact
 *     step's scroll content; badge/rank overlays render above at root level).
 *   - Small ✕ + a tertiary "keep riding as guest" link; both are EXPLICIT
 *     dismissals (recorded — 2 of them stop the card forever). A soft
 *     unmount (user just taps Continue) is not counted.
 *
 * Sign-in reuses the signup-prompt flow: `authCtx.signInWithGoogle()` — the
 * anonymous-data merge rides along automatically (`captureAnonForMerge`
 * inside signInWithGoogle stores the anon access token; `AnonMergeManager`
 * calls POST /v1/account/merge-anonymous once the real session lands, so the
 * ride history / XP / badges of the anon account re-parent to the new one).
 * Deliberate deviation from signup-prompt: NO choose-username redirect on
 * success — the user stays in the post-ride flow (username can be set later
 * from Profile); the parent shows a success toast instead.
 *
 * Gating lives in src/lib/save-ride-prompt.ts — callers evaluate
 * `shouldShowSaveRidePrompt` ONCE into local state before rendering this
 * (the card records "shown" on mount, which would immediately re-fail a
 * live-computed eligibility check).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { useT } from '../../hooks/useTranslation';
import { useAuthSessionOptional } from '../../providers/AuthSessionProvider';
import { useAppStore } from '../../store/appStore';
import { Card } from '../atoms/Card';
import { Mascot } from '../atoms/Mascot';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textLg, textSm } from '../tokens/typography';

export interface SaveRideCardProps {
  /** Sign-in landed — parent hides the card and shows the success toast. */
  readonly onSuccess?: () => void;
  /** Explicit dismissal (✕ or guest link) — parent hides the card. */
  readonly onDismiss?: () => void;
  /** testID passthrough for E2E. */
  readonly testID?: string;
}

export function SaveRideCard({ onSuccess, onDismiss, testID }: SaveRideCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const authCtx = useAuthSessionOptional();

  const markShown = useAppStore((s) => s.markSaveRidePromptShown);
  const recordDismiss = useAppStore((s) => s.recordSaveRidePromptDismiss);
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);
  const resetAnonymousOpenCount = useAppStore((s) => s.resetAnonymousOpenCount);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Record "shown for this ride" exactly once on mount (mirrors
  // ReviewPromptCard's bookkeeping pattern). Empty deps — Zustand setters
  // are stable references.
  useEffect(() => {
    markShown(useAppStore.getState().completedRideCount);
  }, []);

  const handleGoogle = async () => {
    if (!authCtx) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { error, cancelled } = await authCtx.signInWithGoogle();
      if (cancelled) return;
      if (error) {
        setErrorMessage(t('saveRide.error'));
        return;
      }
      // Same post-signin bookkeeping as signup-prompt's Google path; the
      // anonymous open-count gate is moot once a real session exists.
      setOnboardingCompleted(true);
      resetAnonymousOpenCount();
      onSuccess?.();
    } catch {
      setErrorMessage(t('saveRide.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    recordDismiss();
    onDismiss?.();
  };

  return (
    <View testID={testID}>
      <Card variant="solid" elevation="md" style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('saveRide.dismissA11y')}
          onPress={handleDismiss}
          hitSlop={12}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={styles.body}>
          {/* Mascot atom already carries the NAVIGATING/showMascot quarantine. */}
          <View style={styles.mascotSlot}>
            <Mascot pose="point" size="md" />
          </View>

          <Text style={styles.title}>{t('saveRide.title')}</Text>
          <Text style={styles.bodyText}>{t('saveRide.body')}</Text>

          <GoogleSignInButton
            label={t('onboarding.continueWithGoogle')}
            onPress={() => void handleGoogle()}
            disabled={isSubmitting}
            accessibilityLabel={t('onboarding.a11yGoogle')}
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('saveRide.keepGuest')}
            style={styles.guestLinkRow}
          >
            <Text style={styles.guestLink}>{t('saveRide.keepGuest')}</Text>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.xl,
    },
    closeButton: {
      position: 'absolute',
      top: space[2],
      right: space[2],
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    body: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: space[3],
    },
    mascotSlot: {
      alignItems: 'center',
      marginTop: space[1],
    },
    title: {
      ...textLg,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    bodyText: {
      ...textSm,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      ...textSm,
      color: colors.danger,
      textAlign: 'center',
    },
    guestLinkRow: {
      alignSelf: 'center',
      paddingVertical: space[1],
    },
    guestLink: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
  });
