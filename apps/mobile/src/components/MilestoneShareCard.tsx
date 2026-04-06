import { StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from './BrandLogo';
import { brandColors, darkTheme } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textBase,
  textDataLg,
  textSm,
  textXs,
} from '../design-system/tokens/typography';

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

export type MilestoneKey =
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  | 'distance_50km'
  | 'distance_100km'
  | 'rides_10'
  | 'rides_50'
  | 'co2_10kg'
  | 'co2_50kg';

type MilestoneConfig = {
  readonly title: string;
  readonly subtitle: string;
  readonly statLabel: string;
  readonly icon: string;
};

export const MILESTONE_CONFIGS: Record<MilestoneKey, MilestoneConfig> = {
  streak_7: { title: '7-Day Streak', subtitle: 'A full week of safer cycling!', statLabel: '7 days', icon: 'F' },
  streak_14: { title: '14-Day Streak', subtitle: 'Two weeks strong!', statLabel: '14 days', icon: 'F' },
  streak_30: { title: '30-Day Streak', subtitle: 'A full month of cycling safety!', statLabel: '30 days', icon: 'F' },
  distance_50km: { title: '50 km Cycled', subtitle: 'Your first fifty — many more to come!', statLabel: '50 km', icon: 'D' },
  distance_100km: { title: '100 km Cycled', subtitle: 'Century cyclist! Impressive.', statLabel: '100 km', icon: 'D' },
  rides_10: { title: '10 Rides', subtitle: 'Double digits! You are a regular.', statLabel: '10 rides', icon: 'R' },
  rides_50: { title: '50 Rides', subtitle: 'Fifty rides safer. Keep going!', statLabel: '50 rides', icon: 'R' },
  co2_10kg: { title: '10 kg CO2 Saved', subtitle: 'Like planting half a tree!', statLabel: '10 kg', icon: 'C' },
  co2_50kg: { title: '50 kg CO2 Saved', subtitle: 'That is 2 trees worth of carbon!', statLabel: '50 kg', icon: 'C' },
};

// ---------------------------------------------------------------------------
// Milestone detection
// ---------------------------------------------------------------------------

type MilestoneCheckInput = {
  readonly streakDays: number;
  readonly totalDistanceKm: number;
  readonly totalRides: number;
  readonly totalCo2Kg: number;
  readonly earnedMilestones: readonly string[];
};

export const detectNewMilestones = (input: MilestoneCheckInput): MilestoneKey[] => {
  const checks: { key: MilestoneKey; condition: boolean }[] = [
    { key: 'streak_7', condition: input.streakDays >= 7 },
    { key: 'streak_14', condition: input.streakDays >= 14 },
    { key: 'streak_30', condition: input.streakDays >= 30 },
    { key: 'distance_50km', condition: input.totalDistanceKm >= 50 },
    { key: 'distance_100km', condition: input.totalDistanceKm >= 100 },
    { key: 'rides_10', condition: input.totalRides >= 10 },
    { key: 'rides_50', condition: input.totalRides >= 50 },
    { key: 'co2_10kg', condition: input.totalCo2Kg >= 10 },
    { key: 'co2_50kg', condition: input.totalCo2Kg >= 50 },
  ];

  return checks
    .filter((check) => check.condition && !input.earnedMilestones.includes(check.key))
    .map((check) => check.key);
};

// ---------------------------------------------------------------------------
// Share card component (capturable view)
// ---------------------------------------------------------------------------

type MilestoneShareCardProps = {
  readonly milestoneKey: MilestoneKey;
};

export const MilestoneShareCard = ({ milestoneKey }: MilestoneShareCardProps) => {
  const config = MILESTONE_CONFIGS[milestoneKey];

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <BrandLogo size={32} />
        <Text style={styles.brandText}>Defensive Pedal</Text>
      </View>

      <View style={styles.centerSection}>
        <Text style={styles.iconText}>{config.icon}</Text>
        <Text style={styles.statLabel}>{config.statLabel}</Text>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.subtitle}>{config.subtitle}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Safer streets, one ride at a time</Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Share text generator (for RN Share API)
// ---------------------------------------------------------------------------

export const getMilestoneShareText = (milestoneKey: MilestoneKey): string => {
  const config = MILESTONE_CONFIGS[milestoneKey];
  return `I just earned the "${config.title}" milestone on Defensive Pedal! ${config.subtitle} #DefensivePedal #SaferCycling`;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: darkTheme.bgDeep,
    borderRadius: radii['2xl'],
    borderWidth: 2,
    borderColor: brandColors.accent,
    padding: space[6],
    gap: space[5],
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  brandText: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    letterSpacing: 0.5,
  },
  centerSection: {
    alignItems: 'center',
    gap: space[2],
  },
  iconText: {
    ...textDataLg,
    fontFamily: fontFamily.mono.bold,
    color: brandColors.accent,
    fontSize: 48,
    lineHeight: 52,
  },
  statLabel: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
  },
  title: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    textAlign: 'center',
  },
  subtitle: {
    ...textSm,
    color: darkTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: darkTheme.borderDefault,
    paddingTop: space[3],
    alignItems: 'center',
  },
  footerText: {
    ...textXs,
    color: darkTheme.textMuted,
    fontStyle: 'italic',
  },
});
