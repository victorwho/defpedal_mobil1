/**
 * Design System v1.0 — OfflineBanner Molecule
 *
 * Subtle amber/warning banner with wifi-off icon indicating offline status.
 * Uses FadeSlideIn animation pattern for enter/exit.
 * Reusable across navigation, route-planning, and other screens.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../ThemeContext';
import { FadeSlideIn } from '../atoms/FadeSlideIn';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { fontFamily, textSm } from '../tokens/typography';
import { safetyTints } from '../tokens/tints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfflineBannerProps {
  /** Custom message. Defaults to a generic offline notice. */
  message?: string;
  /** Whether the banner is visible. */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  message = "You're offline",
  visible,
}) => {
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <FadeSlideIn translateY={-10}>
      <View
        style={[styles.container, { backgroundColor: safetyTints.cautionLight, borderColor: colors.caution }]}
        accessibilityRole="alert"
        accessibilityLabel={message}
      >
        <Ionicons name="cloud-offline-outline" size={16} color={colors.caution} />
        <Text
          style={[styles.text, { color: colors.cautionText }]}
          numberOfLines={2}
        >
          {message}
        </Text>
      </View>
    </FadeSlideIn>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  text: {
    ...textSm,
    flex: 1,
    fontFamily: fontFamily.body.medium,
  },
});
