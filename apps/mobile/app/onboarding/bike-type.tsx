/**
 * Onboarding step: what do you ride?
 *
 * The answer sets a real routing default — `avoidUnpaved` — exactly the way
 * the Profile picker does (both go through `setBikeType`, which applies
 * `avoidUnpavedForBikeType`). Because the screen quietly changes a setting the
 * rider never asked about, it SAYS SO: the consequence line under the list
 * updates live with the selection and names where to change it later. A
 * silent settings mutation is the difference between helpful and spooky.
 *
 * Reached from `computePostSignupStepTarget`, which keys off store state
 * rather than a nav path — Google/Apple and email signups converge in
 * different places (see that module).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  avoidUnpavedForBikeType,
  type BikeTypeId,
} from '@defensivepedal/core';

import { Button, FadeSlideIn, Mascot, PressableScale } from '../../src/design-system/atoms';
import { useTheme, type ThemeColors } from '../../src/design-system';
import { radii } from '../../src/design-system/tokens/radii';
import { space } from '../../src/design-system/tokens/spacing';
import { brandTints } from '../../src/design-system/tokens/tints';
import { stagger } from '../../src/design-system/tokens/motion';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useT } from '../../src/hooks/useTranslation';
import { useAppStore } from '../../src/store/appStore';
import { finishPostSignupSteps } from '../../src/lib/post-onboarding-nav';

/**
 * Row metadata, positionally aligned with `BIKE_TYPE_IDS`.
 *
 * Icons are Ionicons, never emoji — emoji render inconsistently across OEM
 * font stacks and cannot be themed or tinted.
 */
const ROWS: ReadonlyArray<{
  id: BikeTypeId;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  descKey: string;
}> = [
  { id: 'road', icon: 'speedometer-outline', labelKey: 'profile.bikeRoad', descKey: 'onboarding.bikeRoadDesc' },
  { id: 'city', icon: 'business-outline', labelKey: 'profile.bikeCity', descKey: 'onboarding.bikeCityDesc' },
  { id: 'mountain', icon: 'trail-sign-outline', labelKey: 'profile.bikeMountain', descKey: 'onboarding.bikeMountainDesc' },
  { id: 'ebike', icon: 'flash-outline', labelKey: 'profile.bikeEbike', descKey: 'onboarding.bikeEbikeDesc' },
  { id: 'recumbent', icon: 'body-outline', labelKey: 'profile.bikeRecumbent', descKey: 'onboarding.bikeRecumbentDesc' },
  { id: 'other', icon: 'bicycle-outline', labelKey: 'profile.bikeOther', descKey: 'onboarding.bikeOtherDesc' },
];

export default function OnboardingBikeTypeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();

  const setBikeType = useAppStore((s) => s.setBikeType);
  const markBikeTypePromptSeen = useAppStore((s) => s.markBikeTypePromptSeen);

  const [selected, setSelected] = useState<BikeTypeId | null>(null);

  /**
   * The live consequence line. `avoidUnpavedForBikeType` returns null for
   * bike types that imply nothing (E-bike, Other) — those keep whatever the
   * rider already has, so we say that rather than claim a change.
   */
  const consequenceKey = useMemo(() => {
    if (!selected) return 'onboarding.bikeConsequenceNone';
    const implied = avoidUnpavedForBikeType(selected);
    if (implied === true) return 'onboarding.bikeConsequencePaved';
    if (implied === false) return 'onboarding.bikeConsequenceUnpaved';
    return 'onboarding.bikeConsequenceNeutral';
  }, [selected]);

  const handleContinue = () => {
    // setBikeType applies the routing default AND stamps the prompt as seen.
    if (selected) {
      setBikeType(selected);
    } else {
      markBikeTypePromptSeen();
    }
    finishPostSignupSteps();
  };

  const handleSkip = () => {
    // Skipping is a real answer: never ask again, and leave avoidUnpaved
    // exactly as the rider already has it.
    markBikeTypePromptSeen();
    finishPostSignupSteps();
  };

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] },
      ]}
    >
      <View style={styles.glowTop} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topSection}>
          <Mascot pose="ride" size="md" />
          <Text style={styles.title}>{t('onboarding.bikeTypeTitle')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.bikeTypeSubtitle')}</Text>
        </View>

        <View style={styles.list}>
          {ROWS.map((row, index) => {
            const isSelected = selected === row.id;
            return (
              <FadeSlideIn
                key={row.id}
                delay={Math.min(index, stagger.maxItems) * stagger.step}
              >
                <PressableScale
                  style={[styles.row, isSelected && styles.rowSelected]}
                  hapticOnPress="confirm"
                  onPress={() => setSelected(row.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${t(row.labelKey)}. ${t(row.descKey)}`}
                >
                  <View style={[styles.rowIcon, isSelected && styles.rowIconSelected]}>
                    <Ionicons
                      name={row.icon}
                      size={22}
                      color={isSelected ? colors.accent : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
                    <Text style={styles.rowDesc}>{t(row.descKey)}</Text>
                  </View>
                  {/* Selection is never signalled by colour alone — the
                      checkmark carries it for colour-blind riders and for
                      anyone in a high-contrast mode. */}
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? colors.accent : colors.borderDefault}
                  />
                </PressableScale>
              </FadeSlideIn>
            );
          })}
        </View>

        <View style={styles.consequence}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.consequenceText}>{t(consequenceKey)}</Text>
        </View>
      </ScrollView>

      {/* Footer sits OUTSIDE the ScrollView so the primary action can never
          fall below the fold on a small handset. */}
      <View style={styles.footer}>
        <Button variant="primary" size="lg" fullWidth onPress={handleContinue}>
          {t('onboarding.bikeTypeContinue')}
        </Button>
        <Pressable
          onPress={handleSkip}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
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
    scrollContent: {
      flexGrow: 1,
      paddingBottom: space[4],
    },
    topSection: {
      alignItems: 'center',
      gap: space[2],
      paddingTop: space[2],
      paddingBottom: space[5],
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
    list: {
      gap: space[2],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      // 44pt is the platform floor; 60 keeps two lines of text comfortable
      // and leaves the tap target generous with gloves on.
      minHeight: 60,
      paddingVertical: space[3],
      paddingHorizontal: space[4],
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    rowSelected: {
      borderColor: colors.accent,
      backgroundColor: brandTints.accentLight,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgDeep,
    },
    rowIconSelected: {
      backgroundColor: brandTints.accentMedium,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textPrimary,
    },
    rowDesc: {
      ...textXs,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    consequence: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space[2],
      paddingTop: space[4],
      paddingHorizontal: space[1],
    },
    consequenceText: {
      ...textXs,
      flex: 1,
      color: colors.textMuted,
      lineHeight: 17,
    },
    footer: {
      gap: space[3],
      alignItems: 'center',
      paddingTop: space[4],
    },
    skipText: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
      color: colors.textSecondary,
    },
  });
