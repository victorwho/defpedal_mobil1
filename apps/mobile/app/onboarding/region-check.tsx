import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { isAppCountrySupported } from '@defensivepedal/core';

import { BrandLogo } from '../../src/components/BrandLogo';
import { Button } from '../../src/design-system/atoms';
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
import { mobileApi } from '../../src/lib/api';
import { ALL_COUNTRIES, findCountryName } from '../../src/lib/countries';
import { detectCountryCode } from '../../src/lib/regionGate';
import { useAppStore } from '../../src/store/appStore';
import { useT } from '../../src/hooks/useTranslation';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Phase = 'detecting' | 'picker' | 'waitlist';

/**
 * Onboarding region gate (global availability, 2026-07-12).
 *
 * Sits between the location-permission screen and consent. GPS reverse-
 * geocode resolves the rider's country: supported (EU + EEA + CH + UK, see
 * core `appAvailability.ts`) passes straight through — the rider only ever
 * sees a brief spinner. Unknown → manual country picker. Unsupported →
 * waitlist panel that collects an email for the launch announcement, with a
 * "Continue anyway" soft gate (Mapbox fallback routing still works
 * worldwide; only safety scores / hazard data are Europe-bound).
 *
 * The decision persists device-scoped in `regionGate` — the gate runs once
 * per install, never again (returning here replaces straight to consent).
 */
export default function OnboardingRegionCheckScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const setRegionGate = useAppStore((s) => s.setRegionGate);
  const locale = useAppStore((s) => s.locale);

  const [phase, setPhase] = useState<Phase>('detecting');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorKey, setErrorKey] = useState<'regionEmailInvalid' | 'regionSubmitFailed' | null>(
    null,
  );

  const proceedToConsent = () => {
    router.replace('/onboarding/consent' as any);
  };

  useEffect(() => {
    // Gate already answered on this device (returning user / re-entered
    // onboarding) — pass through without re-running detection.
    if (useAppStore.getState().regionGate.status !== 'unchecked') {
      proceedToConsent();
      return;
    }

    let cancelled = false;
    const run = async () => {
      const code = await detectCountryCode();
      if (cancelled) return;

      if (code && isAppCountrySupported(code)) {
        useAppStore.getState().setRegionGate({ status: 'passed', countryCode: code });
        proceedToConsent();
        return;
      }

      setDetectedCode(code);
      if (code) {
        // Confident detection of an unsupported country — skip the picker,
        // go straight to the waitlist with the country pre-filled. The
        // "Change country" link covers travelers/GPS noise.
        setSelectedCode(code);
        setPhase('waitlist');
      } else {
        setPhase('picker');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // Mount-only: detection must run exactly once per gate entry.
  }, []);

  const filteredCountries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase() === query,
    );
  }, [search]);

  const handleSelectCountry = (code: string) => {
    if (isAppCountrySupported(code)) {
      setRegionGate({ status: 'passed', countryCode: code });
      proceedToConsent();
      return;
    }
    setSelectedCode(code);
    setSubmitted(false);
    setErrorKey(null);
    setPhase('waitlist');
  };

  const handleNotifyMe = async () => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed) || trimmed.length > 254) {
      setErrorKey('regionEmailInvalid');
      return;
    }
    if (!selectedCode) return;

    setErrorKey(null);
    setIsSubmitting(true);
    try {
      await mobileApi.joinCountryWaitlist({
        email: trimmed,
        countryCode: selectedCode,
        detectedCountryCode: detectedCode,
        locale,
        source: 'onboarding',
      });
      setSubmitted(true);
    } catch {
      setErrorKey('regionSubmitFailed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAnyway = () => {
    setRegionGate({ status: 'waitlisted', countryCode: selectedCode });
    proceedToConsent();
  };

  const countryName = findCountryName(selectedCode) ?? selectedCode ?? '';

  if (phase === 'detecting') {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.detectingText}>{t('onboarding.regionChecking')}</Text>
      </View>
    );
  }

  if (phase === 'picker') {
    return (
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[4] },
        ]}
      >
        <View style={styles.glowTop} importantForAccessibility="no" accessibilityElementsHidden />
        <View style={styles.topSection}>
          <View importantForAccessibility="no" accessibilityElementsHidden>
            <BrandLogo size={40} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('onboarding.regionPickerTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('onboarding.regionPickerSubtitle')}</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('onboarding.regionSearchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t('onboarding.regionSearchPlaceholder')}
          />
        </View>

        <FlatList
          data={filteredCountries}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          style={styles.countryList}
          ListEmptyComponent={
            <Text style={styles.noResults}>{t('onboarding.regionNoResults')}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.countryRow}
              onPress={() => handleSelectCountry(item.code)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <Text style={styles.countryName}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] },
      ]}
    >
      <View style={styles.glowTop} importantForAccessibility="no" accessibilityElementsHidden />
      <View style={styles.topSection}>
        <View importantForAccessibility="no" accessibilityElementsHidden>
          <BrandLogo size={40} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('onboarding.regionUnavailableTitle', { country: countryName })}
        </Text>
        <Text style={styles.subtitle}>
          {t('onboarding.regionUnavailableSubtitle', { country: countryName })}
        </Text>
      </View>

      <View style={styles.card}>
        {submitted ? (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
            <Text style={styles.successText}>
              {t('onboarding.regionSubmitted', { country: countryName })}
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (errorKey === 'regionEmailInvalid') setErrorKey(null);
              }}
              placeholder={t('onboarding.regionEmailPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              accessibilityLabel={t('onboarding.regionEmailPlaceholder')}
            />
            {errorKey ? (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {t(`onboarding.${errorKey}`)}
              </Text>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              onPress={() => void handleNotifyMe()}
            >
              {t('onboarding.regionNotifyMe')}
            </Button>
            <Text style={styles.consentText}>{t('onboarding.regionEmailConsent')}</Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.continueHint}>{t('onboarding.regionContinueAnywayHint')}</Text>
        <Button variant="secondary" size="lg" fullWidth onPress={handleContinueAnyway}>
          {t('onboarding.regionContinueAnyway')}
        </Button>
        <Pressable
          onPress={() => {
            setSearch('');
            setPhase('picker');
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.regionChangeCountry')}
        >
          <Text style={styles.changeCountryLink}>{t('onboarding.regionChangeCountry')}</Text>
        </Pressable>
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
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[4],
    },
    detectingText: {
      ...textBase,
      color: colors.textSecondary,
      textAlign: 'center',
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
      paddingTop: space[4],
      paddingBottom: space[4],
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
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      paddingHorizontal: space[4],
      marginBottom: space[3],
    },
    searchInput: {
      ...textBase,
      flex: 1,
      color: colors.textPrimary,
      paddingVertical: space[3],
    },
    countryList: {
      flex: 1,
    },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3],
      paddingHorizontal: space[2],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDefault,
      minHeight: 48,
    },
    countryName: {
      ...textBase,
      color: colors.textPrimary,
    },
    noResults: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingTop: space[6],
    },
    card: {
      gap: space[3],
      backgroundColor: colors.bgPrimary,
      borderRadius: radii['2xl'],
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[5],
      ...shadows.md,
    },
    emailInput: {
      ...textBase,
      color: colors.textPrimary,
      backgroundColor: colors.bgDeep,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
    },
    errorText: {
      ...textSm,
      color: colors.danger,
    },
    consentText: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    successRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
    },
    successText: {
      ...textSm,
      color: colors.textPrimary,
      flex: 1,
      lineHeight: 20,
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingTop: space[5],
      marginTop: 'auto',
    },
    continueHint: {
      ...textXs,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
    },
    changeCountryLink: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.accent,
    },
  });
