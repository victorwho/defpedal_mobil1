/**
 * BadgeShareCard — Dual-variant capturable badge share card.
 *
 *   - variant="preview" (default): compact 320px card shown inline in modals.
 *   - variant="capture": 1080x1080 branded social image for offscreen capture.
 *
 * Pure presentational. No share logic, no side effects.
 * The outer View forwards its ref so capture hosts can `captureRef` it.
 */
import React, { forwardRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

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

export type BadgeShareCardVariant = 'preview' | 'capture';

export interface BadgeShareCardProps {
  badge: BadgeDefinition;
  tier: BadgeTier;
  rarityPercent?: number;
  variant?: BadgeShareCardVariant;
}

export const BadgeShareCard = forwardRef<View, BadgeShareCardProps>(
  ({ badge, tier, rarityPercent, variant = 'preview' }, ref) => {
    const tierColor = tierColors[tier].primary;
    const rarity = rarityPercent != null ? getRarity(rarityPercent) : null;
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

          {/* Hero: large scaled-up badge shield */}
          <View style={captureStyles.hero}>
            <View style={captureStyles.badgeScaleWrap}>
              <BadgeIcon
                badgeKey={badge.badgeKey}
                tierFamily={badge.tierFamily}
                tier={tier}
                size="lg"
              />
            </View>
          </View>

          {/* Text block */}
          <View style={captureStyles.textBlock}>
            <Text style={captureStyles.badgeName} numberOfLines={2}>
              {badge.name}
            </Text>
            <Text style={[captureStyles.tierLabel, { color: tierColor }]}>
              {TIER_LABELS[tier]}
            </Text>
            <Text style={captureStyles.criteriaText} numberOfLines={3}>
              {badge.criteriaText}
            </Text>
            {rarity && rarityPercent != null ? (
              <Text style={captureStyles.rarityText}>
                Only {rarityPercent.toFixed(0)}% of cyclists earn this
              </Text>
            ) : null}
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
          <Text style={previewStyles.brandText}>DEFENSIVE PEDAL</Text>
        </View>

        {/* Badge hero */}
        <View style={previewStyles.centerSection}>
          <BadgeIcon
            badgeKey={badge.badgeKey}
            tierFamily={badge.tierFamily}
            tier={tier}
            size="lg"
          />
        </View>

        {/* Badge name */}
        <Text style={previewStyles.badgeName}>{badge.name}</Text>
        <Text style={[previewStyles.tierLabel, { color: tierColor }]}>
          {TIER_LABELS[tier]}
        </Text>

        {/* Criteria */}
        <Text style={previewStyles.criteriaText}>{badge.criteriaText}</Text>

        {/* Rarity */}
        {rarity && rarityPercent != null ? (
          <Text style={previewStyles.rarityText}>
            <Text style={{ color: rarity.color }}>-- </Text>
            Only {rarityPercent.toFixed(0)}% of cyclists
            <Text style={{ color: rarity.color }}> --</Text>
          </Text>
        ) : null}

        {/* Footer */}
        <View style={previewStyles.footer}>
          <Text style={previewStyles.footerText}>defensivepedal.com</Text>
        </View>
      </View>
    );
  },
);

export const getBadgeShareText = (badge: BadgeDefinition, tier: BadgeTier): string => {
  const tierLabel = TIER_LABELS[tier];
  return `I just earned the "${badge.name}" badge (${tierLabel}) on Defensive Pedal! ${badge.flavorText} #DefensivePedal #SaferCycling`;
};

// ---------------------------------------------------------------------------
// Styles — preview variant (unchanged 320px layout, share button removed)
// ---------------------------------------------------------------------------

const CARD_WIDTH = Math.min(320, Dimensions.get('window').width - 32);

const previewStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
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

// ---------------------------------------------------------------------------
// Styles — capture variant (1080x1080 branded social image)
// ---------------------------------------------------------------------------

const CAPTURE_SIZE = 1080;
const CAPTURE_HEADER_H = 96;
const CAPTURE_FOOTER_H = 80;
const ACCENT = brandColors.accent;
const HEADER_BG = '#1A1A1A';

// BadgeIcon lg is 120x139; scale ~4x to fit the hero area.
const BADGE_SCALE = 4;

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
    paddingHorizontal: space[6],
  },
  badgeScaleWrap: {
    transform: [{ scale: BADGE_SCALE }],
  },
  textBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
    gap: space[3],
  },
  badgeName: {
    fontFamily: fontFamily.heading.extraBold,
    color: darkTheme.textPrimary,
    fontSize: 56,
    textAlign: 'center',
  },
  tierLabel: {
    fontFamily: fontFamily.mono.semiBold,
    fontSize: 28,
    letterSpacing: 2,
    textAlign: 'center',
  },
  criteriaText: {
    fontFamily: fontFamily.body.medium,
    color: darkTheme.textSecondary,
    fontSize: 28,
    lineHeight: 36,
    textAlign: 'center',
  },
  rarityText: {
    fontFamily: fontFamily.body.regular,
    color: darkTheme.textMuted,
    fontSize: 22,
    textAlign: 'center',
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
