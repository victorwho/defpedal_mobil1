/**
 * MiaShareCard — Capturable share card for Mia level-up sharing.
 *
 * Renders a branded card with level badge, stats, and transformation line.
 * Uses the MilestoneShareCard visual pattern (dark background, DP branding).
 */
import React from 'react';
import { Dimensions, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
  textBase,
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

export interface MiaShareCardProps {
  readonly level: MiaJourneyLevel;
  readonly stats: {
    readonly totalRides: number;
    readonly totalKm: number;
    readonly daysSinceStart: number;
  };
  readonly onShare: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CARD_WIDTH = Math.min(320, Dimensions.get('window').width - 32);

export const MiaShareCard: React.FC<MiaShareCardProps> = ({
  level,
  stats,
  onShare,
}) => {
  const colorKey = LEVEL_COLOR_KEYS[level] ?? 'level2';
  const levelColor = miaLevelColors[colorKey];
  const iconName = LEVEL_ICONS[level] ?? 'bicycle';
  const levelName = LEVEL_NAMES[level] ?? 'Cyclist';

  const handleShare = () => {
    const shareMessage = `I reached Level ${level}: ${levelName} on Defensive Pedal! ${stats.totalRides} rides, ${stats.totalKm} km in ${stats.daysSinceStart} days. #DefensivePedal #SaferCycling`;
    void Share.share({ message: shareMessage });
    onShare();
  };

  return (
    <View style={styles.card}>
      {/* Brand header */}
      <View style={styles.topRow}>
        <BrandLogo size={32} />
        <Text style={styles.brandText}>Defensive Pedal</Text>
      </View>

      {/* Level badge */}
      <View style={styles.centerSection}>
        <View style={[styles.badgeCircle, { backgroundColor: levelColor.primary }]}>
          <Text style={styles.levelNumber}>{level}</Text>
          <Ionicons name={iconName} size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.levelName}>{levelName}</Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalRides}</Text>
          <Text style={styles.statLabel}>rides</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalKm}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.daysSinceStart}</Text>
          <Text style={styles.statLabel}>days</Text>
        </View>
      </View>

      {/* Share button */}
      <Pressable style={styles.shareButton} onPress={handleShare}>
        <Ionicons name="share-social-outline" size={16} color={brandColors.textInverse} />
        <Text style={styles.shareButtonText}>Share</Text>
      </Pressable>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Safer streets, one ride at a time</Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Share text generator (for use by parents)
// ---------------------------------------------------------------------------

export const getMiaShareText = (level: MiaJourneyLevel, totalRides: number, totalKm: number): string => {
  const levelName = LEVEL_NAMES[level] ?? 'Cyclist';
  return `I reached Level ${level}: ${levelName} on Defensive Pedal! ${totalRides} rides, ${totalKm} km. #DefensivePedal #SaferCycling`;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingVertical: space[2],
    borderRadius: radii.full,
    backgroundColor: brandColors.accent,
  },
  shareButtonText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: brandColors.textInverse,
    fontSize: 14,
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
