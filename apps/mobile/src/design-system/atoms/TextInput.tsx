/**
 * Design System v1.0 — TextInput Atom
 *
 * Height: 48px. Two variants: default (radius-md) | search (radius-full).
 * Accent focus border. Left/right icon slots.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';

import { useTheme } from '../ThemeContext';
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
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.accent
      : colors.borderDefault;

  const borderWidth = focused || error ? 2 : 1;

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
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.bgSecondary,
            borderColor,
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
      </View>
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
