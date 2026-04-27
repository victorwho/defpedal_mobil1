import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { useTheme, type ThemeColors } from '../src/design-system';
import { SettingRow } from '../src/design-system/molecules/SettingRow';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textBase, textSm } from '../src/design-system/tokens/typography';
import { useAppStore } from '../src/store/appStore';
import { useT } from '../src/hooks/useTranslation';
import {
  posthogConfigured,
  sentryConfigured,
} from '../src/lib/telemetry';

/**
 * Post-onboarding screen for changing the analytics consent decision captured
 * during onboarding. Mirrors the toggles and copy from /onboarding/consent.
 *
 * Reachable from Profile → Account → Privacy & analytics. Telemetry stops
 * within the same render cycle when a user toggles off — TelemetryProvider
 * subscribes to the store slice and tears down the affected client.
 */
export default function PrivacyAnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const sentryConsent = useAppStore((s) => s.analyticsConsent.sentry);
  const posthogConsent = useAppStore((s) => s.analyticsConsent.posthog);
  const setAnalyticsConsent = useAppStore((s) => s.setAnalyticsConsent);

  const handleSentryToggle = useCallback(
    (next: boolean) => {
      setAnalyticsConsent({ sentry: next, posthog: posthogConsent });
    },
    [setAnalyticsConsent, posthogConsent],
  );

  const handlePosthogToggle = useCallback(
    (next: boolean) => {
      setAnalyticsConsent({ sentry: sentryConsent, posthog: next });
    },
    [setAnalyticsConsent, sentryConsent],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  return (
    <Screen title={t('privacyAnalytics.title')} headerVariant="back" onBack={handleBack}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('privacyAnalytics.intro')}</Text>

        <View style={styles.card}>
          {sentryConfigured ? (
            <SettingRow
              label={t('privacyAnalytics.crashLabel')}
              description={t('privacyAnalytics.crashDescription')}
              checked={sentryConsent}
              onChange={handleSentryToggle}
            />
          ) : (
            <View style={styles.unavailableRow}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.textSecondary}
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
              <Text style={styles.unavailableText}>{t('privacyAnalytics.crashUnavailable')}</Text>
            </View>
          )}
          {posthogConfigured ? (
            <SettingRow
              label={t('privacyAnalytics.analyticsLabel')}
              description={t('privacyAnalytics.analyticsDescription')}
              checked={posthogConsent}
              onChange={handlePosthogToggle}
            />
          ) : (
            <View style={styles.unavailableRow}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.textSecondary}
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
              <Text style={styles.unavailableText}>{t('privacyAnalytics.analyticsUnavailable')}</Text>
            </View>
          )}
        </View>

        <View style={styles.assuranceCard}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={colors.textSecondary}
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
          <Text style={styles.assuranceText}>{t('privacyAnalytics.assurance')}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: space[5],
      paddingTop: space[5],
      paddingBottom: space[8],
      gap: space[4],
    },
    intro: {
      ...textBase,
      color: colors.textPrimary,
    },
    card: {
      gap: space[2],
      backgroundColor: colors.bgPrimary,
      padding: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    unavailableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[2],
    },
    unavailableText: {
      ...textSm,
      flex: 1,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
    },
    assuranceCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
      backgroundColor: colors.bgSecondary,
      padding: space[3],
      borderRadius: radii.md,
    },
    assuranceText: {
      ...textSm,
      flex: 1,
      color: colors.textSecondary,
    },
  });
