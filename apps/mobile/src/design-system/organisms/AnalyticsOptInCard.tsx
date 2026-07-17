/**
 * AnalyticsOptInCard — contextual PostHog opt-in ask.
 *
 * Spec: docs/plans/analytics-optin-prompts.md (shared component spec). Three
 * prompts share this one organism, differing only in mascot pose + copy:
 *   post_second_ride  — impact summary, exactly ride 2 (mascot: study)
 *   post_first_hazard — after the first hazard report (mascot: cheer)
 *   impact_dashboard  — 3rd+ dashboard visit (mascot: binoculars)
 *
 * Render contract (same discipline as ReviewPromptCard / SaveRideCard):
 *   - Inline card, never a blocking modal, never over celebration overlays.
 *   - Callers must pass BOTH gates before rendering: the pure
 *     `shouldShowAnalyticsPrompt` (caps/spacing/retirement) AND
 *     `claimPromptSlot('analytics')` (session arbitration vs SaveRideCard /
 *     ReviewPromptCard) — then LATCH the verdict into local state, because
 *     this card records "shown" on mount which would re-fail a live check.
 *   - Copy stays honest: analytics is optional, anonymous, no GPS — the copy
 *     never implies features depend on it.
 *
 * Opt-in = the affirmative act: sets `posthog: true` via setAnalyticsConsent
 * (which stamps `capturedAt`, the consent record) and records which prompt
 * converted (`analyticsPrompt.convertedBy`). Dismissal (✕ or "No thanks")
 * counts toward the 2-dismissals-forever cap. The card animates out on
 * conversion (reverse fade/slide, skipped under reduced motion); the parent
 * shows the success Toast via `onConverted`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../../hooks/useTranslation';
import type { AnalyticsPromptId } from '../../lib/analytics-optin';
import { useAppStore } from '../../store/appStore';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Mascot } from '../atoms/Mascot';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme, type ThemeColors } from '../ThemeContext';
import { duration, EXIT_RATIO } from '../tokens/motion';
import type { MascotPose } from '../tokens/mascotPoses';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Per-prompt config (mascot pose + i18n key prefix)
// ---------------------------------------------------------------------------

const PROMPT_CONFIG: Record<
  AnalyticsPromptId,
  { pose: MascotPose; keyPrefix: string }
> = {
  post_second_ride: { pose: 'study', keyPrefix: 'analyticsOptIn.p1' },
  post_first_hazard: { pose: 'cheer', keyPrefix: 'analyticsOptIn.p2' },
  impact_dashboard: { pose: 'binoculars', keyPrefix: 'analyticsOptIn.p3' },
};

export interface AnalyticsOptInCardProps {
  readonly promptId: AnalyticsPromptId;
  /** PostHog is now on — parent hides the card slot and shows the success Toast. */
  readonly onConverted?: () => void;
  /** Explicit dismissal (✕ or "No thanks") — parent hides the card slot. */
  readonly onDismiss?: () => void;
  readonly testID?: string;
}

export function AnalyticsOptInCard({
  promptId,
  onConverted,
  onDismiss,
  testID,
}: AnalyticsOptInCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const reducedMotion = useReducedMotion();

  const markShown = useAppStore((s) => s.markAnalyticsPromptShown);
  const recordDismiss = useAppStore((s) => s.recordAnalyticsPromptDismiss);
  const markConverted = useAppStore((s) => s.markAnalyticsPromptConverted);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);

  const [isLeaving, setIsLeaving] = useState(false);
  const exitAnim = useRef(new Animated.Value(1)).current;

  const { pose, keyPrefix } = PROMPT_CONFIG[promptId];

  // Record "shown" exactly once on mount (mirrors ReviewPromptCard's
  // bookkeeping — Zustand setters are stable, empty deps intentional).
  useEffect(() => {
    markShown(promptId);
  }, []);

  const handleOptIn = () => {
    if (isLeaving) return;
    // The affirmative act: flips PostHog on (setAnalyticsConsent stamps
    // capturedAt — the consent record) + records the converting prompt.
    // Sentry keeps its current value untouched.
    const currentSentry = useAppStore.getState().analyticsConsent.sentry;
    setAnalyticsConsent({ sentry: currentSentry, posthog: true });
    markConverted(promptId);

    // Reverse fade/slide out, then hand off to the parent (Toast + unmount).
    setIsLeaving(true);
    if (reducedMotion) {
      onConverted?.();
      return;
    }
    Animated.timing(exitAnim, {
      toValue: 0,
      duration: Math.round(duration.normal * EXIT_RATIO),
      useNativeDriver: true,
    }).start(() => onConverted?.());
  };

  const handleDismiss = () => {
    if (isLeaving) return;
    recordDismiss();
    onDismiss?.();
  };

  return (
    <Animated.View
      testID={testID}
      style={{
        opacity: exitAnim,
        transform: [
          {
            translateY: exitAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            }),
          },
        ],
      }}
    >
      <Card variant="solid" elevation="md" style={styles.card}>
        {/* ✕ — 32pt visual + hitSlop 6 = 44pt hit area per spec. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('analyticsOptIn.dismissA11y')}
          onPress={handleDismiss}
          hitSlop={6}
          style={styles.closeButton}
        >
          <Ionicons name="close-outline" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={styles.row}>
          {/* Mascot atom carries the NAVIGATING/showMascot quarantine. */}
          <View style={styles.mascotSlot}>
            <Mascot pose={pose} width={56} />
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{t(`${keyPrefix}Title`)}</Text>
            <Text style={styles.body} numberOfLines={3}>
              {t(`${keyPrefix}Body`)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button variant="primary" size="sm" onPress={handleOptIn} disabled={isLeaving}>
            {t(`${keyPrefix}Cta`)}
          </Button>
          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('analyticsOptIn.noThanks')}
            style={styles.noThanksRow}
          >
            <Text style={styles.noThanks}>{t('analyticsOptIn.noThanks')}</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>{t('analyticsOptIn.footer')}</Text>
      </Card>
    </Animated.View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radii.lg,
      padding: space[4],
      gap: space[3],
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      // Clearance from the absolute ✕ so the title never runs under it.
      paddingRight: space[6],
    },
    mascotSlot: {
      // Mascot returns null under quarantine — keep the text block stable.
      minWidth: 0,
    },
    content: {
      flex: 1,
      gap: space[1],
    },
    title: {
      ...textBase,
      fontFamily: fontFamily.body.bold,
      color: colors.textPrimary,
    },
    body: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
    },
    noThanksRow: {
      paddingVertical: space[1],
    },
    noThanks: {
      ...textSm,
      color: colors.textSecondary,
    },
    footer: {
      ...textXs,
      color: colors.textMuted,
      lineHeight: 15,
    },
  });
