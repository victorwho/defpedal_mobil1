/**
 * Design System — TierPill Atom
 *
 * Small horizontal pill showing the user's rider tier name.
 * Used next to usernames in feed, on profile, and on share cards.
 * Hidden at tiers 1-2 (Kickstand, Spoke) when size='sm' — too early to clutter feed.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RiderTierName } from '@defensivepedal/core';

import { riderTiers, type RiderTierKey } from '../tokens/tierColors';
import { radii } from '../tokens/radii';
import { fontFamily } from '../tokens/typography';

export interface TierPillProps {
  tier: RiderTierName;
  /** 'sm' for feed (16px), 'md' for profile (20px), 'lg' for rank-up overlay (28px) */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CONFIG = {
  sm: { height: 16, fontSize: 8, paddingH: 6 },
  md: { height: 20, fontSize: 10, paddingH: 8 },
  lg: { height: 28, fontSize: 13, paddingH: 12 },
} as const;

export const TierPill = React.memo(function TierPill({ tier, size = 'md' }: TierPillProps) {
  const tierDef = riderTiers[tier as RiderTierKey];
  if (!tierDef) return null;

  // Hide at tiers 1-2 when sm (feed context)
  if (size === 'sm' && tierDef.level < 3) return null;

  const cfg = SIZE_CONFIG[size];

  return (
    <View
      style={[
        styles.pill,
        {
          height: cfg.height,
          paddingHorizontal: cfg.paddingH,
          backgroundColor: tierDef.color,
          borderRadius: radii.full,
        },
      ]}
      accessibilityLabel={`Tier: ${tierDef.displayName}`}
      accessibilityRole="text"
    >
      <Text
        style={[
          styles.text,
          {
            fontSize: cfg.fontSize,
            color: tierDef.pillText,
          },
        ]}
        numberOfLines={1}
      >
        {tierDef.displayName}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fontFamily.mono.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
