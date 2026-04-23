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
// Accessibility labels — non-color safety indicators (WCAG 1.4.1)
// ---------------------------------------------------------------------------

const variantLabel: Record<BadgeVariant, string> = {
  'risk-safe': 'Safe',
  'risk-caution': 'Caution',
  'risk-danger': 'Danger',
  info: 'Info',
  neutral: '',
  accent: '',
};

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

  // Flatten children to a plain string for a11y, best-effort. Arrays happen
  // when JSX mixes text and expressions, e.g. `<Badge>Route: {name}</Badge>`
  // — React passes children as `['Route: ', name]` in that case.
  const flattenText = (node: React.ReactNode): string | undefined => {
    if (node == null || node === false) return undefined;
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) {
      const parts = node
        .map(flattenText)
        .filter((s): s is string => s != null);
      return parts.length ? parts.join('') : undefined;
    }
    return undefined;
  };

  const label = variantLabel[variant];
  const childText = flattenText(children);
  const a11yLabel = label
    ? childText
      ? `${label}: ${childText}`
      : label
    : childText;

  // Detect whether `children` is text-ish (string, number, or array thereof)
  // vs a standalone React element. Text-ish children MUST be wrapped in a
  // single <Text> — bare strings inside a <View> trigger the RN red-screen
  // "Text strings must be rendered within a <Text> component." error.
  const isTextChild = (node: React.ReactNode): boolean => {
    if (typeof node === 'string' || typeof node === 'number') return true;
    if (Array.isArray(node)) return node.some(isTextChild);
    return false;
  };

  return (
    <View
      style={containerStyle}
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      {icon}
      {isTextChild(children) ? (
        <Text style={textStyle}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
};
