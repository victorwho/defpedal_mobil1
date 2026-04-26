import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useT } from '../../src/hooks/useTranslation';
import {
  posthogConfigured,
  sentryConfigured,
} from '../../src/lib/telemetry';

/**
 * Item 8 of the compliance plan: pre-collection consent screen. Shown during
 * onboarding before any analytics events fire. Both toggles default OFF
 * (Romania-only launch + GDPR posture). User must explicitly opt in to each.
 *
 * The decision is persisted device-scoped (not user-scoped) — see appStore
 * resetUserScopedState comment block for the rationale.
 */
export default function OnboardingConsentScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);
  const persistedSentry = useAppStore((s) => s.analyticsConsent.sentry);
  const persistedPosthog = useAppStore((s) => s.analyticsConsent.posthog);

  // Local mirror — only writes to the store on Continue, so a user who taps
  // a toggle then backs out doesn't accidentally save partial consent.
  const [crashReports, setCrashReports] = useState(persistedSentry);
  const [productAnalytics, setProductAnalytics] = useState(persistedPosthog);

  const handleContinue = () => {
    setAnalyticsConsent({
      sentry: sentryConfigured ? crashReports : false,
      posthog: posthogConfigured ? productAnalytics : false,
    });
    router.push('/onboarding/safety-score');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.glowTop} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.topSection}>
          <BrandLogo size={48} />
          <Text style={styles.eyebrow}>{t('onboardingConsent.eyebrow')}</Text>
          <Text style={styles.title}>{t('onboardingConsent.title')}</Text>
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
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
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
  });
