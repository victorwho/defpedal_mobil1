/**
 * Design System v1.0 — Button Atom
 *
 * 5 variants: primary | secondary | ghost | danger | safe
 * 3 sizes: sm (36px) | md (44px) | lg (52px)
 * Pill shape on all sizes.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { darkTheme, safetyColors } from '../tokens/colors';
import { useHaptics } from '../hooks/useHaptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'safe';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const sizeStyles: Record<ButtonSize, { height: number; px: number; fontSize: number }> = {
  sm: { height: 36, px: space[3], fontSize: 14 },
  md: { height: 44, px: space[4], fontSize: 16 },
  lg: { height: 52, px: space[6], fontSize: 18 },
};

// ---------------------------------------------------------------------------
// Variant colors (static — always dark theme since buttons carry their own bg)
// ---------------------------------------------------------------------------

const variantStyles: Record<
  ButtonVariant,
  { bg: string; text: string; pressedBg: string }
> = {
  primary: {
    bg: darkTheme.accent,
    text: darkTheme.textInverse,
    pressedBg: darkTheme.accentHover,
  },
  secondary: {
    bg: darkTheme.bgSecondary,
    text: '#FFFFFF',
    pressedBg: darkTheme.bgTertiary,
  },
  ghost: {
    bg: 'transparent',
    text: darkTheme.accent,
    pressedBg: 'rgba(250, 204, 21, 0.1)',
  },
  danger: {
    bg: safetyColors.danger,
    text: '#FFFFFF',
    pressedBg: '#DC2626',
  },
  safe: {
    bg: safetyColors.safe,
    text: '#FFFFFF',
    pressedBg: '#16A34A',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  onPress,
  children,
  accessibilityLabel,
}) => {
  const haptics = useHaptics();
  const s = sizeStyles[size];
  const v = variantStyles[variant];

  const handlePress = () => {
    haptics.light();
    onPress?.();
  };

  const containerStyle: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.px,
    borderRadius: radii.full,
    backgroundColor: v.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    opacity: disabled ? 0.4 : 1,
    alignSelf: fullWidth ? 'stretch' : 'auto',
  };

  const textStyle: TextStyle = {
    fontFamily: fontFamily.body.semiBold,
    fontSize: s.fontSize,
    color: v.text,
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        containerStyle,
        pressed && { backgroundColor: v.pressedBg, transform: [{ scale: 0.97 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={v.text}
          accessibilityLabel="Loading"
        />
      ) : (
        <>
          {leftIcon}
          {typeof children === 'string' ? (
            <Text style={textStyle}>{children}</Text>
          ) : (
            children
          )}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
};
