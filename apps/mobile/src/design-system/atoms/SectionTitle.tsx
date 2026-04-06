/**
 * Design System v1.0 — SectionTitle Atom
 *
 * Uppercase section heading used throughout the app.
 * 2 variants:
 *   - accent  → yellow heading (default, used in profile/settings)
 *   - muted   → secondary text color (used in content screens)
 */
import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { brandColors } from '../tokens/colors';
import { fontFamily, textSm } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SectionTitleVariant = 'accent' | 'muted';

export interface SectionTitleProps {
  variant?: SectionTitleVariant;
  children: string;
  style?: TextStyle;
}

// ---------------------------------------------------------------------------
// Variant colors
// ---------------------------------------------------------------------------

const variantColor: Record<SectionTitleVariant, string> = {
  accent: brandColors.accent,
  muted: brandColors.textSecondary,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SectionTitle: React.FC<SectionTitleProps> = ({
  variant = 'accent',
  children,
  style,
}) => {
  return (
    <Text
      style={[styles.base, { color: variantColor[variant] }, style]}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
