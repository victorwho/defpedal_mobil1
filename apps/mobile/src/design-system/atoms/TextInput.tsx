/**
 * Design System v1.0 — TextInput Atom
 *
 * Height: 48px. Two variants: default (radius-md) | search (radius-full).
 * Accent focus border. Left/right icon slots.
 *
 * Motion: border color crossfades between resting and focus/error states
 * (150ms ease-out). Border width snaps (1→2) — the color crossfade carries
 * the visual transition; animating width would reflow layout on every frame.
 * Reduced motion: snaps to final color immediately.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';

import { useTheme } from '../ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { duration as durations, easing as easings } from '../tokens/motion';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { layout } from '../tokens/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextInputProps extends Omit<RNTextInputProps, 'style'> {
  variant?: 'default' | 'search';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string | null;
  disabled?: boolean;
  label?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TextInput: React.FC<TextInputProps> = ({
  variant = 'default',
  leftIcon,
  rightIcon,
  error,
  disabled = false,
  label,
  ...inputProps
}) => {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);

  const isHighlighted = focused || Boolean(error);
  const targetColor = error ? colors.danger : colors.accent;

  const focusProgress = useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(focusProgress, {
      toValue: isHighlighted ? 1 : 0,
      duration: reduced ? 0 : durations.fast,
      easing: easings.default,
      useNativeDriver: false, // animating borderColor
    }).start();
  }, [isHighlighted, reduced, focusProgress]);

  const animatedBorderColor = focusProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderDefault, targetColor],
  });

  // Width snaps; color crossfades. The 1px shift is below visual threshold.
  const borderWidth = isHighlighted ? 2 : 1;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: colors.textSecondary, fontFamily: fontFamily.body.regular },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: colors.bgSecondary,
            borderColor: animatedBorderColor,
            borderWidth,
            borderRadius: variant === 'search' ? radii.full : radii.md,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
      >
        {leftIcon ? <View style={styles.iconSlot}>{leftIcon}</View> : null}
        <RNTextInput
          {...inputProps}
          editable={!disabled}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              fontFamily: fontFamily.body.regular,
              paddingLeft: leftIcon ? 0 : space[3],
              paddingRight: rightIcon ? 0 : space[3],
            },
          ]}
        />
        {rightIcon ? <View style={styles.iconSlot}>{rightIcon}</View> : null}
      </Animated.View>
      {error ? (
        <Text
          style={[
            styles.error,
            { color: colors.danger, fontFamily: fontFamily.body.regular },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    gap: space[1],
  },
  container: {
    height: layout.searchBarHeight, // 48px
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  label: {
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    fontSize: 12,
    marginTop: space[1],
  },
});
