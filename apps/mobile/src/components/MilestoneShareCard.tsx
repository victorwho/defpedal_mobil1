/**
 * MilestoneShareCard — Dual-variant capturable share card.
 *
 *   - variant="preview" (default): compact 320px card used inside modals.
 *   - variant="capture": 1080x1080 branded social image rendered offscreen
 *     by the OffScreenCaptureHost.
 *
 * Pure presentational. No share logic, no side effects.
 * The outer View forwards its ref so capture hosts can `captureRef` it.
 */
import React, { forwardRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

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
// Share card component
// ---------------------------------------------------------------------------

export type MilestoneShareCardVariant = 'preview' | 'capture';

export interface MilestoneShareCardProps {
  readonly milestoneKey: MilestoneKey;
  readonly variant?: MilestoneShareCardVariant;
}

export const MilestoneShareCard = forwardRef<View, MilestoneShareCardProps>(
  function MilestoneShareCard({ milestoneKey, variant = 'preview' }, ref) {
    const config = MILESTONE_CONFIGS[milestoneKey];
    const isCapture = variant === 'capture';

    if (isCapture) {
      return (
        <View ref={ref} collapsable={false} style={captureStyles.card}>
          <View style={captureStyles.header}>
            <View style={captureStyles.headerLeft}>
              <BrandLogo size={56} />
              <Text style={captureStyles.brandText}>DEFENSIVE PEDAL</Text>
            </View>
          </View>

          <View style={captureStyles.hero}>
            <View style={captureStyles.heroIconRing}>
              <Text style={captureStyles.heroIcon}>{config.icon}</Text>
            </View>
            <Text style={captureStyles.heroStat}>{config.statLabel}</Text>
          </View>

          <View style={captureStyles.textBlock}>
            <Text style={captureStyles.title}>{config.title}</Text>
            <Text style={captureStyles.subtitle}>{config.subtitle}</Text>
          </View>

          <View style={captureStyles.footer}>
            <BrandLogo size={44} />
            <Text style={captureStyles.footerUrl}>defensivepedal.com</Text>
          </View>
        </View>
      );
    }

    return (
      <View ref={ref} collapsable={false} style={previewStyles.card}>
        <View style={previewStyles.topRow}>
          <BrandLogo size={32} />
          <Text style={previewStyles.brandText}>Defensive Pedal</Text>
        </View>

        <View style={previewStyles.centerSection}>
          <Text style={previewStyles.iconText}>{config.icon}</Text>
          <Text style={previewStyles.statLabel}>{config.statLabel}</Text>
          <Text style={previewStyles.title}>{config.title}</Text>
          <Text style={previewStyles.subtitle}>{config.subtitle}</Text>
        </View>

        <View style={previewStyles.footer}>
          <Text style={previewStyles.footerText}>Safer streets, one ride at a time</Text>
        </View>
      </View>
    );
  },
);

// ---------------------------------------------------------------------------
// Share text generator (for consumer-driven sharing via shareImage / Share API)
// ---------------------------------------------------------------------------

export const getMilestoneShareText = (milestoneKey: MilestoneKey): string => {
  const config = MILESTONE_CONFIGS[milestoneKey];
  return `I just earned the "${config.title}" milestone on Defensive Pedal! ${config.subtitle} #DefensivePedal #SaferCycling`;
};

// ---------------------------------------------------------------------------
// Styles — preview variant (unchanged 320px layout, no share button)
// ---------------------------------------------------------------------------

const CARD_WIDTH = Math.min(320, Dimensions.get('window').width - 32);

const previewStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: darkTheme.bgDeep,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: brandColors.borderAccent,
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

// ---------------------------------------------------------------------------
// Styles — capture variant (1080x1080 branded social image)
// ---------------------------------------------------------------------------

const CAPTURE_SIZE = 1080;
const CAPTURE_HEADER_H = 96;
const CAPTURE_FOOTER_H = 80;
const ACCENT = brandColors.accent;
const HEADER_BG = '#1A1A1A';

const captureStyles = StyleSheet.create({
  card: {
    width: CAPTURE_SIZE,
    height: CAPTURE_SIZE,
    backgroundColor: darkTheme.bgDeep,
    overflow: 'hidden',
  },
  header: {
    height: CAPTURE_HEADER_H,
    backgroundColor: HEADER_BG,
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  brandText: {
    fontFamily: fontFamily.heading.extraBold,
    color: ACCENT,
    fontSize: 22,
    letterSpacing: 2,
  },
  hero: {
    height: 560,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[5],
    paddingHorizontal: space[6],
  },
  heroIconRing: {
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 6,
    borderColor: ACCENT,
    backgroundColor: 'rgba(250, 204, 21, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    fontFamily: fontFamily.mono.bold,
    color: ACCENT,
    fontSize: 180,
    lineHeight: 200,
    textAlign: 'center',
  },
  heroStat: {
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    fontSize: 72,
    letterSpacing: 1,
  },
  textBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
    gap: space[3],
  },
  title: {
    fontFamily: fontFamily.heading.extraBold,
    color: ACCENT,
    fontSize: 56,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textSecondary,
    fontSize: 30,
    textAlign: 'center',
    lineHeight: 38,
  },
  footer: {
    height: CAPTURE_FOOTER_H,
    backgroundColor: HEADER_BG,
    paddingHorizontal: space[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  footerUrl: {
    fontFamily: fontFamily.body.semiBold,
    color: ACCENT,
    fontSize: 20,
    letterSpacing: 1,
  },
});
