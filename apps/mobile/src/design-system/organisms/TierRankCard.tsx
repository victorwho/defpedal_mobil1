/**
 * Design System — TierRankCard Organism
 *
 * Main tier display card for Profile and Impact Dashboard.
 * Shows tier name, tagline, XP progress bar, and next tier info.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { RiderTierName } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { riderTiers, getNextTier, getTierProgress, getXpToNextTier, type RiderTierKey } from '../tokens/tierColors';
import { hasTierImage, tierImages } from '../tokens/tierImages';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

export interface TierRankCardProps {
  totalXp: number;
  riderTier: RiderTierName;
  /** Show mascot image (true on profile, false on compact dashboard) */
  showMascot?: boolean;
}

export const TierRankCard = React.memo(function TierRankCard({
  totalXp,
  riderTier,
  showMascot = true,
}: TierRankCardProps) {
  const { colors } = useTheme();
  const s = createStyles(colors);

  const key = riderTier as RiderTierKey;
  const tierDef = riderTiers[key];
  if (!tierDef) return null;

  const progress = getTierProgress(totalXp, key);
  const nextTierKey = getNextTier(key);
  const xpRemaining = getXpToNextTier(totalXp, key);
  const nextTierDef = nextTierKey ? riderTiers[nextTierKey] : null;
  const isLegend = !nextTierKey;

  return (
    <View style={s.container}>
      <View style={s.row}>
        {/* Left column: icon + tier name */}
        {showMascot && (
          <View style={s.leftCol}>
            {hasTierImage(key) ? (
              <Image source={tierImages[key]} style={s.mascotImage} resizeMode="contain" />
            ) : (
              <View style={[s.mascotFallback, { borderColor: tierDef.color }]}>
                <Ionicons name="bicycle" size={28} color={tierDef.color} />
              </View>
            )}
            <Text style={[s.tierName, { color: tierDef.color }]}>{tierDef.displayName}</Text>
          </View>
        )}

        {/* Right column: XP + progress bar */}
        <View style={s.rightCol}>
          <Text style={s.xpText}>{totalXp.toLocaleString()} XP</Text>

          {!isLegend ? (
            <>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: tierDef.color,
                    },
                  ]}
                />
              </View>
              <Text style={s.nextText}>
                {nextTierDef?.displayName} · {xpRemaining?.toLocaleString()} XP to go
              </Text>
            </>
          ) : (
            <Text style={s.legendText}>Maximum rank achieved</Text>
          )}
        </View>
      </View>
    </View>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.bgPrimary,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: space[4],
      ...shadows.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
    },
    leftCol: {
      alignItems: 'center',
      gap: space[2],
    },
    mascotImage: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
    },
    mascotFallback: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSecondary,
    },
    tierName: {
      fontSize: 12,
      fontFamily: fontFamily.heading.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    rightCol: {
      flex: 1,
      gap: space[1],
    },
    xpText: {
      fontSize: 16,
      fontFamily: fontFamily.mono.bold,
      color: colors.textPrimary,
    },
    progressTrack: {
      width: '100%',
      height: 6,
      borderRadius: radii.sm,
      backgroundColor: colors.bgTertiary,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radii.sm,
    },
    nextText: {
      fontSize: 11,
      fontFamily: fontFamily.body.medium,
      color: colors.textMuted,
    },
    legendText: {
      fontSize: 11,
      fontFamily: fontFamily.body.medium,
      color: colors.accent,
    },
  });
