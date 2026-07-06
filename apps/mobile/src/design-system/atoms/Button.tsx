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
  StyleSheet,
  Text,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { brandColors, darkTheme, safetyColors } from '../tokens/colors';
import { useTheme } from '../ThemeContext';
import { useT } from '../../hooks/useTranslation';
import { PressableScale } from './PressableScale';

// Pressed-state variants (darker shades of safety colors, not in main token set)
const DANGER_PRESSED = '#DC2626';
const SAFE_PRESSED = '#16A34A';

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
// Variant colors
//
// FILLED variants (primary / secondary / danger / safe) carry their own
// opaque background, so their colors are static — they read correctly on any
// screen regardless of theme. The GHOST variant has a transparent background
// and therefore inherits the SCREEN behind it: on a light-theme screen the
// static dark-theme accent (#FACC15) measured only 1.5:1 on white, well below
// the 4.5:1 AA threshold (review 2026-06-12 a11y P1). Ghost text/press tint
// are resolved per-theme below via `useTheme()`.
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
    text: brandColors.textPrimary,
    pressedBg: darkTheme.bgTertiary,
  },
  ghost: {
    // text + pressedBg overridden per-theme at render time (see below).
    bg: 'transparent',
    text: darkTheme.accent,
    pressedBg: 'rgba(250, 204, 21, 0.1)',
  },
  danger: {
    bg: safetyColors.danger,
    text: brandColors.textPrimary,
    pressedBg: DANGER_PRESSED,
  },
  safe: {
    bg: safetyColors.safe,
    text: brandColors.textPrimary,
    pressedBg: SAFE_PRESSED,
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
  const s = sizeStyles[size];
  const v = variantStyles[variant];
  const { colors, mode } = useTheme();
  const t = useT();

  // Ghost has no background, so its text must contrast with the live screen.
  // Dark theme keeps the bright accent (#FACC15, AA-pass on the dark deep bg).
  // Light theme uses the dedicated darker `accentText` token (≥4.5:1 on the
  // near-white light bg) — the bright accent measured only ~1.5:1 there.
  const ghostText = mode === 'dark' ? darkTheme.accent : colors.accentText;
  const ghostPressedBg =
    mode === 'dark' ? 'rgba(250, 204, 21, 0.12)' : 'rgba(132, 90, 4, 0.10)';
  const effectiveText = variant === 'ghost' ? ghostText : v.text;
  const effectivePressedBg = variant === 'ghost' ? ghostPressedBg : v.pressedBg;

  const containerStyle: ViewStyle = {
    // minHeight (not a fixed height) + vertical padding so the pill grows with
    // the OS font scale instead of clipping the label at large Dynamic Type /
    // Android font-scale settings (review 2026-06-12 a11y). allowFontScaling
    // stays on everywhere, so the label can be up to ~2x.
    minHeight: s.height,
    paddingVertical: space[2],
    paddingHorizontal: s.px,
    borderRadius: radii.full,
    borderCurve: 'continuous', // Smooth squircle corners on iOS
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
    color: effectiveText,
  };

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: loading }}
      style={containerStyle}
      pressedStyle={{ backgroundColor: effectivePressedBg }}
      // Audit 2026-07-05 UX-11: `sm` renders 36dp tall — below the 44dp touch
      // minimum. hitSlop extends the touchable area (~48dp effective) without
      // changing the visual height.
      hitSlop={size === 'sm' ? { top: 6, bottom: 6, left: 4, right: 4 } : undefined}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={effectiveText}
          accessibilityLabel={t('common.loading')}
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
    </PressableScale>
  );
};
