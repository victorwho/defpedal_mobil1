/**
 * Design System v1.0 — Card Atom
 *
 * Standardized card container used across screens.
 * 3 variants:
 *   - solid  → dark bg, border, shadow (default)
 *   - glass  → semi-transparent dark bg, border, no shadow
 *   - outline → transparent bg, border only
 */
import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { space } from '../tokens/spacing';
import { surfaceTints } from '../tokens/tints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardVariant = 'solid' | 'glass' | 'outline';

export interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

const variantMap: Record<CardVariant, ViewStyle> = {
  solid: {
    backgroundColor: brandColors.bgPrimary,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    ...shadows.md,
  },
  glass: {
    backgroundColor: surfaceTints.glass,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Card: React.FC<CardProps> = ({
  variant = 'solid',
  children,
  style,
}) => {
  return (
    <View style={[styles.base, variantMap[variant], style]}>
      {children}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    borderCurve: 'continuous', // Smooth squircle corners on iOS
    padding: space[4],
    gap: space[3],
  },
});
