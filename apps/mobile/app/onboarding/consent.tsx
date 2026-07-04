import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Button } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { SettingRow } from '../../src/design-system/molecules/SettingRow';
import { radii } from '../../src/design-system/tokens/radii';
import { space } from '../../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useAppStore } from '../../src/store/appStore';
import { useSkipOnboarding } from '../../src/hooks/useSkipOnboarding';
import { navigateAfterOnboarding } from '../../src/lib/post-onboarding-nav';
import { useT } from '../../src/hooks/useTranslation';
import {
  posthogConfigured,
  sentryConfigured,
} from '../../src/lib/telemetry';

/**
 * Item 8 of the compliance plan + P0.1 (2026-05-25): split consent.
 *
 * Pre-collection consent screen shown during onboarding before any analytics
 * events fire. **Crash reports** default ON (legitimate-interest basis under
 * GDPR Art 6(1)(f) — service-stability diagnostics; the toggle is kept so the
 * user can object per Art 21). **Product analytics** defaults OFF (opt-in
 * consent under ePrivacy / Law 506/2004).
 *
 * The decision is persisted device-scoped (not user-scoped) — see appStore
 * resetUserScopedState comment block for the rationale.
 *
 * Legal record: docs/legal/consent-split-2026-05-25.md
 */
export default function OnboardingConsentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);
  const resetAnonymousOpenCount = useAppStore((s) => s.resetAnonymousOpenCount);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const skipOnboarding = useSkipOnboarding();
  const persistedSentry = useAppStore((s) => s.analyticsConsent.sentry);
  const persistedPosthog = useAppStore((s) => s.analyticsConsent.posthog);
  const persistedCapturedAt = useAppStore((s) => s.analyticsConsent.capturedAt);

  // First-time defaults vs returning visitor (P0.1, 2026-05-25):
  // - Crash reports (Sentry) default ON. Legitimate-interest basis under
  //   GDPR Art 6(1)(f) — bug telemetry is part of operating the service
  //   safely. The toggle stays visible (Art 21 objection right). Counsel
  //   sign-off note recorded in docs/legal/consent-split-2026-05-25.md.
  // - Product analytics (PostHog) default OFF. Consent basis under
  //   ePrivacy / ANSPDCP Law 506/2004 — non-essential, requires informed
  //   opt-in.
  // - Returning users always see their previously-saved choice; we never
  //   silently flip a setting they already opted in or out of.
  const isFirstTimeConsent = persistedCapturedAt === null;
  const [crashReports, setCrashReports] = useState(
    isFirstTimeConsent ? true : persistedSentry,
  );
  const [productAnalytics, setProductAnalytics] = useState(
    isFirstTimeConsent ? false : persistedPosthog,
  );

  const handleContinue = () => {
    setAnalyticsConsent({
      sentry: sentryConfigured ? crashReports : false,
      posthog: posthogConfigured ? productAnalytics : false,
    });
    const wasInitialOnboarding = !onboardingCompleted;
    setOnboardingCompleted(true);
    if (wasInitialOnboarding) {
      resetAnonymousOpenCount();
    }
    navigateAfterOnboarding();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.glowTop} importantForAccessibility="no" accessibilityElementsHidden />

      <Pressable
        style={styles.skipPill}
        onPress={skipOnboarding}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Skip onboarding"
      >
        <Text style={styles.skipPillText}>Skip</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.topSection}>
          <View importantForAccessibility="no" accessibilityElementsHidden>
            <BrandLogo size={48} />
          </View>
          <Text style={styles.eyebrow}>{t('onboardingConsent.eyebrow')}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboardingConsent.title')}
          </Text>
          <Text style={styles.subtitle}>{t('onboardingConsent.subtitle')}</Text>
        </View>

        <View style={styles.card}>
          {sentryConfigured ? (
            <SettingRow
              label={t('onboardingConsent.crashLabel')}
              description={t('onboardingConsent.crashDescription')}
              checked={crashReports}
              onChange={setCrashReports}
            />
          ) : null}
          {posthogConfigured ? (
            <SettingRow
              label={t('onboardingConsent.analyticsLabel')}
              description={t('onboardingConsent.analyticsDescription')}
              checked={productAnalytics}
              onChange={setProductAnalytics}
            />
          ) : null}
          <View style={styles.assuranceRow}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.textSecondary}
              importantForAccessibility="no"
              accessibilityElementsHidden
            />
            <Text style={styles.assuranceText}>{t('onboardingConsent.assurance')}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
          {t('onboardingConsent.continue')}
        </Button>
        <Text style={styles.changeLater}>{t('onboardingConsent.changeLater')}</Text>
      </View>
    </View>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
      paddingHorizontal: space[5],
    },
    glowTop: {
      position: 'absolute',
      top: -80,
      right: -20,
      width: 220,
      height: 220,
      borderRadius: 9999,
      // Brand glow used by other onboarding screens — opacity-only tint, not a
      // raw hex, so R1 is satisfied. The accent token is theme-aware.
      backgroundColor: colors.accent,
      opacity: 0.14,
    },
    topSection: {
      alignItems: 'center',
      gap: space[3],
      paddingTop: space[6],
      paddingBottom: space[4],
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
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    subtitle: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      paddingHorizontal: space[2],
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    card: {
      gap: space[2],
      backgroundColor: colors.bgPrimary,
      padding: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    assuranceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingTop: space[3],
      borderTopWidth: 1,
      borderTopColor: colors.borderDefault,
    },
    assuranceText: {
      ...textSm,
      flex: 1,
      color: colors.textSecondary,
    },
    footer: {
      gap: space[2],
      paddingTop: space[3],
    },
    changeLater: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    skipPill: {
      position: 'absolute',
      top: space[4],
      right: space[5],
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgPrimary,
      zIndex: 10,
    },
    skipPillText: {
      ...textXs,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
  });
