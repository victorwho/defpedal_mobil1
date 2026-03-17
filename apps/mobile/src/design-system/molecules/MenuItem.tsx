/**
 * Design System v1.0 — MenuItem Molecule
 *
 * For settings / lists. 56px min-height.
 * Icon + label + optional description + right accessory slot.
 * Replaces ad-hoc list rows in settings/diagnostics screens.
 */
import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { layout } from '../tokens/spacing';
import { fontFamily, textBase, textSm } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MenuItemProps {
  /** Left icon (Ionicons name) */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Custom icon color override */
  iconColor?: string;
  /** Primary label */
  label: string;
  /** Secondary description line */
  description?: string;
  /** Right accessory slot (badge, toggle, chevron, etc.) */
  rightAccessory?: React.ReactNode;
  /** Show chevron by default (overridden when rightAccessory is provided) */
  showChevron?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Disabled state */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  iconColor,
  label,
  description,
  rightAccessory,
  showChevron = true,
  onPress,
  disabled = false,
}) => {
  const { colors } = useTheme();

  const resolvedIconColor = iconColor ?? colors.textSecondary;
  const showRight = rightAccessory ?? (showChevron && onPress);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.container,
        { opacity: disabled ? 0.4 : 1 },
        pressed && onPress && { backgroundColor: colors.bgSecondary },
      ]}
    >
      {/* Left icon */}
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={resolvedIconColor} />
        </View>
      ) : null}

      {/* Text content */}
      <View style={styles.content}>
        <Text
          style={[
            textBase,
            { color: colors.textPrimary, fontFamily: fontFamily.body.medium },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {description ? (
          <Text
            style={[textSm, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}
      </View>

      {/* Right accessory or chevron */}
      {rightAccessory ? (
        <View style={styles.accessory}>{rightAccessory}</View>
      ) : showChevron && onPress ? (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textMuted}
        />
      ) : null}
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.cardMinHeight, // 56px
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[3],
    borderRadius: radii.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  accessory: {
    marginLeft: space[2],
  },
});
