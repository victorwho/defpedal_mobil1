/**
 * Design System — BadgeInlineChip Atom
 *
 * Compact pill for inline mentions in feed cards, notifications, toasts.
 * Shows sm badge icon + badge name in a pill-shaped container.
 */
import React from 'react';
import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native';

import type { BadgeTier } from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textXs } from '../tokens/typography';
import { BadgeIcon } from './BadgeIcon';

export interface BadgeInlineChipProps {
  badgeKey: string;
  tier: BadgeTier;
  name: string;
  onPress?: () => void;
}

const containerStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: brandColors.bgSecondary,
  borderRadius: radii.full,
  minHeight: 44,
  paddingVertical: space[1],
  paddingLeft: space[2],
  paddingRight: space[3],
  gap: space[1],
};

const nameStyle: TextStyle = {
  ...textXs,
  fontFamily: fontFamily.body.semiBold,
  color: brandColors.textPrimary,
};

export const BadgeInlineChip: React.FC<BadgeInlineChipProps> = ({
  badgeKey,
  tier,
  name,
  onPress,
}) => {
  const content = (
    <View style={containerStyle}>
      <View style={{ transform: [{ scale: 24 / 40 }], width: 24, height: 28 }}>
        <BadgeIcon badgeKey={badgeKey} tier={tier} size="sm" />
      </View>
      <Text style={nameStyle} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name} badge`}
      >
        {content}
      </Pressable>
    );
  }

  return content;
};
