import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

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

export default function OnboardingPermissionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const [denied, setDenied] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // If location is already granted (returning user / cleared data but kept permission),
  // auto-advance to safety score screen
  useEffect(() => {
    let cancelled = false;
    const checkExisting = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled && status === 'granted') {
          router.replace('/onboarding/safety-score');
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
        router.push('/onboarding/safety-score');
      } else {
        setDenied(true);
      }
    } catch {
      setDenied(true);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSkip = () => {
    router.push('/onboarding/goal-selection');
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
          <BrandLogo size={48} />
          <Text style={styles.eyebrow}>Defensive Pedal</Text>
          <Text style={styles.title}>See how safe your streets are</Text>
          <Text style={styles.subtitle}>
            We use your location to show a live safety score for your neighborhood and find the safest cycling routes nearby.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Neighborhood safety score</Text>
              <Text style={styles.featureDesc}>See how your area ranks for cycling safety</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="navigate" size={20} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Safety-first routes</Text>
              <Text style={styles.featureDesc}>Routes scored by real road risk data</Text>
            </View>
          </View>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="warning" size={20} color={colors.accent} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Hazard alerts</Text>
              <Text style={styles.featureDesc}>Community-reported hazards near your route</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {denied ? (
          <>
            <Text style={styles.deniedText}>
              Location not available. You can still explore routes by searching for a city.
            </Text>
            <Button variant="primary" size="lg" fullWidth onPress={handleSkip}>
              Continue without location
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isRequesting}
              onPress={() => void handleEnableLocation()}
            >
              Enable Location
            </Button>
            <Pressable onPress={handleSkip} hitSlop={12}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </>
        )}
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
    skipText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
    deniedText: {
      ...textSm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
