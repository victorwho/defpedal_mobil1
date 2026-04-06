/**
 * BadgeShareCard — Capturable view for social sharing.
 *
 * Follows MilestoneShareCard pattern:
 * 320px width, bgDeep background, accent border, centered badge icon.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BadgeDefinition } from '@defensivepedal/core';

import { BrandLogo } from './BrandLogo';
import { BadgeIcon } from '../design-system/atoms/BadgeIcon';
import { tierColors, getRarity, type BadgeTier } from '../design-system/tokens/badgeColors';
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

const TIER_LABELS: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
};

const TIER_FROM_LEVEL: Record<number, BadgeTier> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'diamond',
};

export interface BadgeShareCardProps {
  badge: BadgeDefinition;
  tier: BadgeTier;
  rarityPercent?: number;
}

export const BadgeShareCard = React.forwardRef<View, BadgeShareCardProps>(
  ({ badge, tier, rarityPercent }, ref) => {
    const tierColor = tierColors[tier].primary;
    const rarity = rarityPercent != null ? getRarity(rarityPercent) : null;

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        {/* Brand header */}
        <View style={styles.topRow}>
          <BrandLogo size={32} />
          <Text style={styles.brandText}>DEFENSIVE PEDAL</Text>
        </View>

        {/* Badge hero */}
        <View style={styles.centerSection}>
          <BadgeIcon
            badgeKey={badge.badgeKey}
            tierFamily={badge.tierFamily}
            tier={tier}
            size="lg"
          />
        </View>

        {/* Badge name */}
        <Text style={styles.badgeName}>{badge.name}</Text>
        <Text style={[styles.tierLabel, { color: tierColor }]}>
          {TIER_LABELS[tier]}
        </Text>

        {/* Criteria */}
        <Text style={styles.criteriaText}>{badge.criteriaText}</Text>

        {/* Rarity */}
        {rarity && rarityPercent != null ? (
          <Text style={styles.rarityText}>
            <Text style={{ color: rarity.color }}>-- </Text>
            Only {rarityPercent.toFixed(0)}% of cyclists
            <Text style={{ color: rarity.color }}> --</Text>
          </Text>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>defensivepedal.com</Text>
        </View>
      </View>
    );
  },
);

export const getBadgeShareText = (badge: BadgeDefinition, tier: BadgeTier): string => {
  const tierLabel = TIER_LABELS[tier];
  return `I just earned the "${badge.name}" badge (${tierLabel}) on Defensive Pedal! ${badge.flavorText} #DefensivePedal #SaferCycling`;
};

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: darkTheme.bgDeep,
    borderRadius: radii['2xl'],
    borderWidth: 2,
    borderColor: brandColors.accent,
    padding: space[6],
    gap: space[3],
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
    paddingVertical: space[3],
  },
  badgeName: {
    ...text2xl,
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    textAlign: 'center',
  },
  tierLabel: {
    ...textSm,
    fontFamily: fontFamily.mono.semiBold,
    textAlign: 'center',
  },
  criteriaText: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  rarityText: {
    ...textSm,
    color: darkTheme.textMuted,
    textAlign: 'center',
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
  },
});
