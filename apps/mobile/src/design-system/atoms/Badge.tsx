/**
 * Design System v1.0 — Badge / Chip Atom
 *
 * 6 variants: risk-safe | risk-caution | risk-danger | info | neutral | accent
 * 2 sizes: sm (24px) | md (28px)
 * Pill shape. Risk score numbers use mono font.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle, type TextStyle } from 'react-native';

import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { safetyColors, darkTheme, gray } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeVariant =
  | 'risk-safe'
  | 'risk-caution'
  | 'risk-danger'
  | 'info'
  | 'neutral'
  | 'accent';

type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  /** When true, renders children in mono font (for numeric risk scores) */
  mono?: boolean;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Variant colors
// ---------------------------------------------------------------------------

const variantMap: Record<BadgeVariant, { bg: string; text: string }> = {
  'risk-safe': { bg: safetyColors.safeTint, text: safetyColors.safeText },
  'risk-caution': { bg: safetyColors.cautionTint, text: safetyColors.cautionText },
  'risk-danger': { bg: safetyColors.dangerTint, text: safetyColors.dangerText },
  info: { bg: safetyColors.infoTint, text: safetyColors.infoText },
  neutral: { bg: darkTheme.bgSecondary, text: gray[300] },
  accent: { bg: darkTheme.accent, text: darkTheme.textInverse },
};

const sizeMap: Record<BadgeSize, { height: number; px: number; fontSize: number }> = {
  sm: { height: 24, px: space[2], fontSize: 12 },
  md: { height: 28, px: 10, fontSize: 12 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  icon,
  mono = false,
  children,
}) => {
  const v = variantMap[variant];
  const s = sizeMap[size];

  const containerStyle: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.px,
    borderRadius: radii.full,
    backgroundColor: v.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    alignSelf: 'flex-start',
  };

  const textStyle: TextStyle = {
    fontFamily: mono ? fontFamily.mono.semiBold : fontFamily.body.semiBold,
    fontSize: s.fontSize,
    lineHeight: s.fontSize * 1.4,
    color: v.text,
  };

  return (
    <View style={containerStyle}>
      {icon}
      {typeof children === 'string' ? (
        <Text style={textStyle}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
};
