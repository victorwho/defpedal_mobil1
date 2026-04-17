/**
 * MiaShareCard — Dual-variant capturable share card for Mia level-up.
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
import Ionicons from '@expo/vector-icons/Ionicons';

import type { MiaJourneyLevel } from '@defensivepedal/core';

import { BrandLogo } from './BrandLogo';
import { miaLevelColors } from '../design-system/tokens/miaColors';
import { brandColors, darkTheme } from '../design-system/tokens/colors';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import {
  fontFamily,
  text2xl,
  textSm,
  textXs,
} from '../design-system/tokens/typography';

// ---------------------------------------------------------------------------
// Level config
// ---------------------------------------------------------------------------

const LEVEL_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  1: 'bicycle',
  2: 'shield-checkmark',
  3: 'cafe',
  4: 'compass',
  5: 'star',
};

const LEVEL_NAMES: Record<number, string> = {
  1: 'First Pedal',
  2: 'Neighborhood Explorer',
  3: 'Cafe Rider',
  4: 'Urban Navigator',
  5: 'Confident Cyclist',
};

const LEVEL_COLOR_KEYS: Record<number, keyof typeof miaLevelColors> = {
  2: 'level2',
  3: 'level3',
  4: 'level4',
  5: 'level5',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MiaShareCardVariant = 'preview' | 'capture';

export interface MiaShareCardProps {
  readonly level: MiaJourneyLevel;
  readonly stats: {
    readonly totalRides: number;
    readonly totalKm: number;
    readonly daysSinceStart: number;
  };
  readonly variant?: MiaShareCardVariant;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CARD_WIDTH = Math.min(320, Dimensions.get('window').width - 32);

export const MiaShareCard = forwardRef<View, MiaShareCardProps>(
  function MiaShareCard({ level, stats, variant = 'preview' }, ref) {
    const colorKey = LEVEL_COLOR_KEYS[level] ?? 'level2';
    const levelColor = miaLevelColors[colorKey];
    const iconName = LEVEL_ICONS[level] ?? 'bicycle';
    const levelName = LEVEL_NAMES[level] ?? 'Cyclist';
    const isCapture = variant === 'capture';

    if (isCapture) {
      return (
        <View ref={ref} collapsable={false} style={captureStyles.card}>
          {/* Brand header */}
          <View style={captureStyles.header}>
            <View style={captureStyles.headerLeft}>
              <BrandLogo size={56} />
              <Text style={captureStyles.brandText}>DEFENSIVE PEDAL</Text>
            </View>
          </View>

          {/* Hero: large level badge */}
          <View style={captureStyles.hero}>
            <View style={[captureStyles.heroBadge, { backgroundColor: levelColor.primary }]}>
              <Text style={captureStyles.heroLevelLabel}>LEVEL</Text>
              <Text style={captureStyles.heroLevelNumber}>{level}</Text>
              <Ionicons name={iconName} size={110} color="#FFFFFF" />
            </View>
            <Text style={captureStyles.levelName}>{levelName}</Text>
          </View>

          {/* Stats row */}
          <View style={captureStyles.statsRow}>
            <View style={captureStyles.statItem}>
              <Text style={captureStyles.statValue}>{stats.totalRides}</Text>
              <Text style={captureStyles.statLabel}>rides</Text>
            </View>
            <View style={captureStyles.statDivider} />
            <View style={captureStyles.statItem}>
              <Text style={captureStyles.statValue}>{stats.totalKm}</Text>
              <Text style={captureStyles.statLabel}>km</Text>
            </View>
            <View style={captureStyles.statDivider} />
            <View style={captureStyles.statItem}>
              <Text style={captureStyles.statValue}>{stats.daysSinceStart}</Text>
              <Text style={captureStyles.statLabel}>days</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={captureStyles.footer}>
            <BrandLogo size={44} />
            <Text style={captureStyles.footerUrl}>defensivepedal.com</Text>
          </View>
        </View>
      );
    }

    return (
      <View ref={ref} collapsable={false} style={previewStyles.card}>
        {/* Brand header */}
        <View style={previewStyles.topRow}>
          <BrandLogo size={32} />
          <Text style={previewStyles.brandText}>Defensive Pedal</Text>
        </View>

        {/* Level badge */}
        <View style={previewStyles.centerSection}>
          <View style={[previewStyles.badgeCircle, { backgroundColor: levelColor.primary }]}>
            <Text style={previewStyles.levelNumber}>{level}</Text>
            <Ionicons name={iconName} size={28} color="#FFFFFF" />
          </View>
          <Text style={previewStyles.levelName}>{levelName}</Text>
        </View>

        {/* Stats row */}
        <View style={previewStyles.statsRow}>
          <View style={previewStyles.statItem}>
            <Text style={previewStyles.statValue}>{stats.totalRides}</Text>
            <Text style={previewStyles.statLabel}>rides</Text>
          </View>
          <View style={previewStyles.statDivider} />
          <View style={previewStyles.statItem}>
            <Text style={previewStyles.statValue}>{stats.totalKm}</Text>
            <Text style={previewStyles.statLabel}>km</Text>
          </View>
          <View style={previewStyles.statDivider} />
          <View style={previewStyles.statItem}>
            <Text style={previewStyles.statValue}>{stats.daysSinceStart}</Text>
            <Text style={previewStyles.statLabel}>days</Text>
          </View>
        </View>

        {/* Footer */}
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

export const getMiaShareText = (level: MiaJourneyLevel, totalRides: number, totalKm: number): string => {
  const levelName = LEVEL_NAMES[level] ?? 'Cyclist';
  return `I reached Level ${level}: ${levelName} on Defensive Pedal! ${totalRides} rides, ${totalKm} km. #DefensivePedal #SaferCycling`;
};

// ---------------------------------------------------------------------------
// Styles — preview variant (unchanged 320px layout, share button removed)
// ---------------------------------------------------------------------------

const previewStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: darkTheme.bgDeep,
    borderRadius: radii['2xl'],
    borderWidth: 1,
    borderColor: brandColors.borderAccent,
    padding: space[6],
    gap: space[4],
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
    gap: space[3],
  },
  badgeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    position: 'absolute',
    top: 6,
  },
  levelName: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 20,
    color: brandColors.accent,
  },
  statLabel: {
    ...textXs,
    color: darkTheme.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: darkTheme.borderDefault,
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
    gap: space[6],
    paddingHorizontal: space[6],
  },
  heroBadge: {
    width: 360,
    height: 360,
    borderRadius: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  heroLevelLabel: {
    fontFamily: fontFamily.mono.bold,
    fontSize: 28,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 4,
  },
  heroLevelNumber: {
    fontFamily: fontFamily.heading.extraBold,
    fontSize: 140,
    lineHeight: 150,
    color: '#FFFFFF',
  },
  levelName: {
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    fontSize: 56,
    textAlign: 'center',
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: space[6],
  },
  statItem: {
    alignItems: 'center',
    gap: space[2],
  },
  statValue: {
    fontFamily: fontFamily.heading.extraBold,
    color: ACCENT,
    fontSize: 72,
    lineHeight: 78,
  },
  statLabel: {
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
    fontSize: 26,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 2,
    height: 80,
    backgroundColor: darkTheme.borderDefault,
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
