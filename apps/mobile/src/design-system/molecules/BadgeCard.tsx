/**
 * Design System — BadgeCard Molecule
 *
 * Grid cell for the trophy case. Shows BadgeIcon (md), badge name,
 * and progress text. Handles earned / in-progress / locked / secret states.
 */
import React from 'react';
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import type { BadgeDefinition, BadgeProgress } from '@defensivepedal/core';

import { BadgeIcon } from '../atoms/BadgeIcon';
import { tierColors, type BadgeTier } from '../tokens/badgeColors';
import { brandColors, safetyColors } from '../tokens/colors';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';

export interface BadgeCardProps {
  badge: BadgeDefinition;
  earned: boolean;
  earnedTier?: BadgeTier;
  progress?: BadgeProgress;
  isNew?: boolean;
  hasHigherTier?: boolean;
  onPress: () => void;
}

const TIER_FROM_LEVEL: Record<number, BadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
};

export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  earned,
  earnedTier,
  progress,
  isNew = false,
  hasHigherTier = false,
  onPress,
}) => {
  const isSecret = badge.isHidden && !earned;
  const isInProgress = !earned && !isSecret && progress != null && progress.progress > 0;

  // Determine tier for display
  const tier: BadgeTier | 'locked' | 'secret' = earned
    ? earnedTier ?? TIER_FROM_LEVEL[badge.tier] ?? 'bronze'
    : isSecret
      ? 'secret'
      : 'locked';

  // Progress fraction for BadgeIcon ring
  const progressFraction = isInProgress ? progress!.progress : undefined;

  // Next tier color for progress text
  const nextTier = TIER_FROM_LEVEL[badge.tier] ?? 'bronze';
  const progressColor = tierColors[nextTier]?.primary ?? brandColors.textMuted;

  const nameStyle: TextStyle = {
    ...textXs,
    fontFamily: fontFamily.body.semiBold,
    color: earned ? brandColors.textPrimary : brandColors.textSecondary,
    textAlign: 'center',
    marginTop: space[1],
  };

  const progressTextStyle: TextStyle = {
    ...textXs,
    fontFamily: fontFamily.mono.medium,
    textAlign: 'center',
    color: earned
      ? safetyColors.safe
      : isInProgress
        ? progressColor
        : brandColors.textMuted,
  };

  const containerStyle: ViewStyle = {
    alignItems: 'center',
    padding: space[2],
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        containerStyle,
        pressed && { backgroundColor: brandColors.bgSecondary, borderRadius: 12 },
      ]}
      accessibilityRole="button"
      accessibilityHint="Double tap to view badge details"
      accessibilityLabel={
        isSecret
          ? 'Hidden badge. Tap for a hint.'
          : `${badge.name}, ${earned ? `${tier} tier, earned` : 'locked'}${isInProgress ? `, ${Math.round((progress?.progress ?? 0) * 100)}% complete` : ''}`
      }
    >
      <BadgeIcon
        badgeKey={badge.badgeKey}
        tierFamily={badge.tierFamily}
        tier={tier}
        size="md"
        progress={progressFraction}
        isNew={isNew}
        hasHigherTier={hasHigherTier}
      />
      <Text style={nameStyle} numberOfLines={2}>
        {isSecret ? '???' : badge.name}
      </Text>
      <Text style={progressTextStyle} numberOfLines={1}>
        {earned
          ? 'Earned'
          : isSecret
            ? '???'
            : isInProgress
              ? `${progress!.current}/${progress!.target}`
              : badge.criteriaText}
      </Text>
    </Pressable>
  );
};
