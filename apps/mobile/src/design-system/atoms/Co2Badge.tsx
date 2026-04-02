import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatCo2Saved } from '@defensivepedal/core';

import { safetyColors } from '../tokens/colors';
import { fontFamily, textXs, textSm } from '../tokens/typography';

type Co2BadgeProps = {
  readonly co2SavedKg: number;
  readonly size?: 'sm' | 'md';
};

export const Co2Badge = ({ co2SavedKg, size = 'sm' }: Co2BadgeProps) => {
  if (co2SavedKg <= 0) return null;

  const iconSize = size === 'sm' ? 12 : 16;
  const textStyle = size === 'sm' ? styles.textSm : styles.textMd;

  return (
    <View style={styles.badge}>
      <Ionicons name="leaf-outline" size={iconSize} color={safetyColors.safe} />
      <Text style={textStyle}>{formatCo2Saved(co2SavedKg)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  textSm: {
    ...textXs,
    color: safetyColors.safe,
    fontFamily: fontFamily.body.medium,
  },
  textMd: {
    ...textSm,
    color: safetyColors.safe,
    fontFamily: fontFamily.heading.bold,
  },
});
