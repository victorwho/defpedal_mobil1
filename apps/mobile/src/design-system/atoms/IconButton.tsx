/**
 * Design System v1.0 — IconButton Atom
 *
 * 44x44 touch target (md) or 36x36 (sm). 24px icon centered.
 * Transparent bg, rounded-full.
 */
import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { radii } from '../tokens/radii';
import { darkTheme, safetyColors, gray } from '../tokens/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IconButtonVariant = 'default' | 'accent' | 'danger' | 'secondary';
type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Variant colors
// ---------------------------------------------------------------------------

const variantColor: Record<IconButtonVariant, string> = {
  default: gray[400],
  accent: darkTheme.accent,
  danger: safetyColors.danger,
  secondary: gray[300],
};

const sizeMap: Record<IconButtonSize, number> = {
  sm: 36,
  md: 44,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'default',
  size = 'md',
  disabled = false,
}) => {
  const dim = sizeMap[size];

  const containerStyle: ViewStyle = {
    width: dim,
    height: dim,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        containerStyle,
        pressed && { backgroundColor: darkTheme.bgSecondary },
      ]}
    >
      {icon}
    </Pressable>
  );
};
