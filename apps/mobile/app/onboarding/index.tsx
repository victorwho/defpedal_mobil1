import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Button, Mascot } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
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
import { safetyColors } from '../../src/design-system/tokens/colors';
import { PRIVACY_URL } from '../../src/lib/legal-urls';
import { useT } from '../../src/hooks/useTranslation';

export default function OnboardingPermissionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const [denied, setDenied] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // If location is already granted (returning user / cleared data but kept
  // permission), auto-advance through the region gate. The consent screen
  // was removed from the flow 2026-07-16: crash reporting runs under
  // legitimate interest, and since 2026-07-19 product analytics is ALSO on
  // by default (product-owner override of the opt-in design) — both are
  // disclosed by the transparency notice in this screen's footer, with
  // opt-out in Profile › Privacy & analytics. region-check passes straight
  // through to the signup prompt when the gate was already answered on
  // this device.
  useEffect(() => {
    let cancelled = false;
    const checkExisting = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled && status === 'granted') {
          router.replace('/onboarding/region-check' as any);
        }
      } catch {
        // Ignore — user will tap the button
      }
    };
    void checkExisting();
    return () => { cancelled = true; };
  }, []);

  const handleEnableLocation = async () => {
    setIsRequesting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status === 'granted') {
        router.push('/onboarding/region-check' as any);
      } else {
        setDenied(true);
      }
    } catch {
      setDenied(true);
    } finally {
      setIsRequesting(false);
    }
  };

  // Reachable ONLY after the OS permission request has been shown and denied.
  // App Store Guideline 5.1.1(iv): the priming screen has no skip/exit — the
  // single "Continue" CTA always proceeds to the system prompt first. After a
  // denial the user may continue without location; we still route through the
  // region gate (which falls back to its manual country picker without GPS)
  // before the signup prompt.
  const handleContinueWithoutLocation = () => {
    router.push('/onboarding/region-check' as any);
  };

  const handleOpenSettings = () => {
    // Apple-permitted recovery path: once denied at the OS level, the system
    // dialog won't re-appear, so deep-link to the app's Settings page.
    void Linking.openSettings();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.glowTop} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topSection}>
          <Mascot pose="wave" size="lg" />
          <BrandLogo size={48} />
          <Text style={styles.eyebrow}>Defensive Pedal</Text>
          <Text style={styles.title}>{t('onboarding.locationTitle')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.locationSubtitle')}</Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.featureRow, styles.statRow]}>
            <View style={[styles.featureIcon, styles.statIcon]}>
              <Text style={styles.statBadge}>2.1×</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, styles.statTitle]}>{t('onboarding.featureStat')}</Text>
              <Text style={styles.featureDesc}>{t('onboarding.featureStatSub')}</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="navigate" size={20} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('onboarding.featureRoutes')}</Text>
              <Text style={styles.featureDesc}>{t('onboarding.featureRoutesSub')}</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="warning" size={20} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{t('onboarding.featureHazards')}</Text>
              <Text style={styles.featureDesc}>{t('onboarding.featureHazardsSub')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {denied ? (
          <>
            <Text style={styles.deniedText}>{t('onboarding.locationDenied')}</Text>
            <Button variant="primary" size="lg" fullWidth onPress={handleContinueWithoutLocation}>
              {t('onboarding.continueWithoutLocation')}
            </Button>
            <Pressable
              onPress={handleOpenSettings}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.openSettings')}
            >
              <Text style={styles.settingsLink}>{t('onboarding.openSettings')}</Text>
            </Pressable>
          </>
        ) : (
          // No skip/exit affordance here by design — App Store Guideline
          // 5.1.1(iv) requires the user to always proceed to the system
          // permission request after the priming message.
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isRequesting}
            onPress={() => void handleEnableLocation()}
          >
            {t('onboarding.enableLocation')}
          </Button>
        )}
        {/* Transparency notice (2026-07-16) — the legal condition for
            removing the consent screen from onboarding: crash reporting runs
            under legitimate interest (GDPR Art 6(1)(f)) with clear notice +
            an always-available objection in Profile › Privacy & analytics. */}
        <Text style={styles.telemetryNotice}>
          {t('onboarding.telemetryNotice')}{' '}
          <Text
            style={styles.telemetryNoticeLink}
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            accessibilityRole="link"
          >
            {t('legal.privacyPolicy')}
          </Text>
        </Text>
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
      backgroundColor: brandTints.accentMedium,
      opacity: 0.6,
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
      gap: space[4],
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[5],
      ...shadows.md,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[3],
    },
    featureIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.lg,
      backgroundColor: brandTints.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      flex: 1,
      gap: 2,
    },
    featureTitle: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    featureDesc: {
      ...textXs,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingTop: space[4],
    },
    settingsLink: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
    deniedText: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    telemetryNotice: {
      ...textXs,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 16,
      paddingTop: space[2],
    },
    telemetryNoticeLink: {
      ...textXs,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    statRow: {
      paddingBottom: space[1],
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDefault,
    },
    statIcon: {
      backgroundColor: safetyColors.safeTint,
    },
    statBadge: {
      fontFamily: fontFamily.mono.bold,
      fontSize: 13,
      letterSpacing: -0.5,
      color: safetyColors.safe,
    },
    statTitle: {
      color: safetyColors.safe,
    },
  });
