/**
 * PlusBadge — the "PLUS" marker for a Pedal Plus subscriber.
 *
 * Purely decorative by default: it labels a surface that already says what it
 * is, so it is hidden from screen readers unless the caller passes a label.
 * Callers must gate on entitlement themselves — this atom renders whatever it
 * is told to, so it can also be used to *advertise* Plus on a locked feature.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { useT } from '../../hooks/useTranslation';

export type PlusBadgeSize = 'sm' | 'md';

export interface PlusBadgeProps {
  size?: PlusBadgeSize;
  /**
   * Dimmed treatment for advertising Plus on a feature the rider does not
   * have yet, versus the solid treatment for someone who does.
   */
  muted?: boolean;
  /** Pass to make the badge meaningful to a screen reader. */
  accessibilityLabel?: string;
}

const SIZES: Record<PlusBadgeSize, { fontSize: number; px: number; py: number }> = {
  sm: { fontSize: 9, px: space[1], py: 1 },
  md: { fontSize: 11, px: space[2], py: 2 },
};

export const PlusBadge: React.FC<PlusBadgeProps> = ({
  size = 'md',
  muted = false,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();
  const t = useT();
  const dims = SIZES[size];

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityElementsHidden={accessibilityLabel === undefined}
      importantForAccessibility={accessibilityLabel === undefined ? 'no-hide-descendants' : 'yes'}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.badge,
        {
          paddingHorizontal: dims.px,
          paddingVertical: dims.py,
          backgroundColor: muted ? 'transparent' : colors.accent,
          borderColor: colors.accent,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { fontSize: dims.fontSize, color: muted ? colors.accent : colors.textInverse },
        ]}
      >
        {t('premium.badge')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  label: {
    fontFamily: fontFamily.body.semiBold,
    letterSpacing: 0.8,
  },
});
