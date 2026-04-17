/**
 * Design System — FollowButton Atom
 *
 * Compact pill button for follow actions.
 * 3 states: "Follow" (primary filled), "Requested" (dimmed outline), "Following" (outline + checkmark).
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { FollowStatus } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowButtonProps {
  status: FollowStatus;
  onPress: () => void;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FollowButton = React.memo(function FollowButton({
  status,
  onPress,
  loading = false,
}: FollowButtonProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);

  const config = STATUS_CONFIG[status];

  return (
    <Pressable
      onPress={onPress}
      disabled={loading || status === 'accepted'}
      accessibilityRole="button"
      accessibilityLabel={config.a11yLabel}
      accessibilityState={{ disabled: loading || status === 'accepted' }}
      style={({ pressed }) => [
        styles.base,
        status === 'none' && styles.filled,
        status === 'pending' && styles.dimmed,
        status === 'accepted' && styles.outline,
        pressed && status === 'none' && styles.filledPressed,
        pressed && status !== 'none' && styles.outlinePressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={status === 'none' ? colors.textInverse : colors.textSecondary}
          accessibilityLabel="Loading"
        />
      ) : (
        <View style={styles.content}>
          {status === 'accepted' && (
            <Ionicons
              name="checkmark"
              size={14}
              color={colors.textSecondary}
            />
          )}
          <Text
            style={[
              styles.label,
              status === 'none' && styles.filledLabel,
              status !== 'none' && styles.outlineLabel,
            ]}
          >
            {config.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<FollowStatus, { label: string; a11yLabel: string }> = {
  none: { label: 'Follow', a11yLabel: 'Follow this user' },
  pending: { label: 'Requested', a11yLabel: 'Follow request pending' },
  accepted: { label: 'Following', a11yLabel: 'Following this user' },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      height: 32,
      paddingHorizontal: space[3],
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderCurve: 'continuous',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    filled: {
      backgroundColor: colors.accent,
    },
    filledPressed: {
      backgroundColor: colors.accentHover,
      transform: [{ scale: 0.97 }],
    },
    dimmed: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderDefault,
      opacity: 0.7,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    outlinePressed: {
      backgroundColor: colors.bgTertiary,
      transform: [{ scale: 0.97 }],
    },
    label: {
      fontFamily: fontFamily.body.semiBold,
      fontSize: 13,
    },
    filledLabel: {
      color: colors.textInverse,
    },
    outlineLabel: {
      color: colors.textSecondary,
    },
  });
