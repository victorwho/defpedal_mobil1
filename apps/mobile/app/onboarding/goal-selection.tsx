import type { CyclingGoal } from '@defensivepedal/core';
import { router } from 'expo-router';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { brandColors, darkTheme } from '../../src/design-system/tokens/colors';
import { radii } from '../../src/design-system/tokens/radii';
import { shadows } from '../../src/design-system/tokens/shadows';
import { space } from '../../src/design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textSm,
  textXs,
} from '../../src/design-system/tokens/typography';
import { useAppStore } from '../../src/store/appStore';

type GoalOption = {
  readonly goal: CyclingGoal;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly description: string;
};

const GOAL_OPTIONS: readonly GoalOption[] = [
  {
    goal: 'commute',
    icon: 'briefcase-outline',
    title: 'Commute safely',
    description: 'Find the safest route to work every day',
  },
  {
    goal: 'explore',
    icon: 'compass-outline',
    title: 'Explore new routes',
    description: 'Discover safe cycling paths around your city',
  },
  {
    goal: 'beginner',
    icon: 'bicycle-outline',
    title: "Start cycling (I'm nervous)",
    description: 'Get comfortable with low-risk beginner routes',
  },
] as const;

export default function OnboardingGoalSelectionScreen() {
  const insets = useSafeAreaInsets();
  const setCyclingGoal = useAppStore((s) => s.setCyclingGoal);

  const handleSelect = (goal: CyclingGoal) => {
    setCyclingGoal(goal);
    router.push('/onboarding/first-route');
  };

  const handleDismiss = () => {
    setCyclingGoal('commute');
    router.push('/onboarding/first-route');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.glowTop} />

      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12} accessibilityLabel="Go back" accessibilityRole="button">
        <Ionicons name="chevron-back" size={24} color={darkTheme.textPrimary} />
      </Pressable>

      <View style={styles.headerSection}>
        <Text style={styles.eyebrow}>Your cycling goal</Text>
        <Text style={styles.title}>What brings you here?</Text>
        <Text style={styles.subtitle}>
          This helps us personalize your routes and safety tips.
        </Text>
      </View>

      <View style={styles.cardList}>
        {GOAL_OPTIONS.map((option) => (
          <Pressable
            key={option.goal}
            style={({ pressed }) => [
              styles.goalCard,
              pressed && styles.goalCardPressed,
            ]}
            onPress={() => handleSelect(option.goal)}
            accessibilityRole="button"
            accessibilityLabel={option.title}
          >
            <View style={styles.goalIconWrap}>
              <Ionicons name={option.icon} size={24} color={brandColors.accent} />
            </View>
            <View style={styles.goalText}>
              <Text style={styles.goalTitle}>{option.title}</Text>
              <Text style={styles.goalDesc}>{option.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={darkTheme.textMuted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={handleDismiss} hitSlop={12}>
          <Text style={styles.skipText}>Skip this step</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
    paddingHorizontal: space[5],
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
    backgroundColor: 'rgba(250, 204, 21, 0.14)',
    opacity: 0.6,
  },
  headerSection: {
    gap: space[2],
    paddingTop: space[6],
    paddingBottom: space[4],
  },
  eyebrow: {
    ...textXs,
    fontFamily: fontFamily.heading.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: brandColors.accent,
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...textBase,
    color: darkTheme.textSecondary,
    lineHeight: 22,
  },
  cardList: {
    flex: 1,
    justifyContent: 'center',
    gap: space[3],
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: darkTheme.bgPrimary,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    padding: space[4],
    ...shadows.md,
  },
  goalCardPressed: {
    backgroundColor: darkTheme.bgSecondary,
    borderColor: brandColors.accent,
  },
  goalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalText: {
    flex: 1,
    gap: 2,
  },
  goalTitle: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textPrimary,
    fontSize: 16,
  },
  goalDesc: {
    ...textXs,
    color: darkTheme.textSecondary,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingTop: space[4],
  },
  skipText: {
    ...textSm,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textMuted,
  },
});
