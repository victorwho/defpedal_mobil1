/**
 * Design System — MiaSegmentBanner Molecule
 *
 * In-ride encouraging banner for entering/exiting moderate road segments.
 * Entry: amber-tinted background with shield icon.
 * Exit: green-tinted background with checkmark icon.
 * Auto-dismisses after a timeout (entry: 4s, exit: 3s).
 * Positioned absolutely above the map but below overlays.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme, type ThemeColors } from '../ThemeContext';
import { space } from '../tokens/spacing';
import { radii } from '../tokens/radii';
import { shadows } from '../tokens/shadows';
import { fontFamily, textSm } from '../tokens/typography';
import { zIndex } from '../tokens/zIndex';
import { usePersonaT } from '../../hooks/usePersonaT';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiaSegmentBannerProps {
  readonly type: 'entry' | 'exit';
  readonly streetName: string;
  readonly hasBikeLane: boolean;
  readonly onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTRY_DISMISS_MS = 4000;
const EXIT_DISMISS_MS = 3000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MiaSegmentBanner: React.FC<MiaSegmentBannerProps> = ({
  type,
  streetName,
  hasBikeLane,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = usePersonaT();
  const slideAnim = useRef(new Animated.Value(-100)).current;

  // Slide in from top
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [slideAnim]);

  // Auto-dismiss after timeout
  useEffect(() => {
    const timeout = type === 'entry' ? ENTRY_DISMISS_MS : EXIT_DISMISS_MS;
    const timer = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, timeout);
    return () => clearTimeout(timer);
  }, [type, onDismiss, slideAnim]);

  const isEntry = type === 'entry';
  const iconName = isEntry ? 'shield-checkmark' : 'checkmark-circle';
  const iconColor = isEntry ? colors.caution : colors.safe;

  const message = isEntry
    ? hasBikeLane
      ? t('navigation.segmentEntry')
      : t('navigation.segmentEntryNoBikeLane')
    : t('navigation.segmentExit');

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { transform: [{ translateY: slideAnim }] },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.banner, isEntry ? styles.bannerEntry : styles.bannerExit]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
        <Text style={styles.bannerText}>{message}</Text>
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss banner"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Themed styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: zIndex.popover,
      paddingHorizontal: space[4],
      paddingTop: space[2],
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      borderRadius: radii.xl,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      ...shadows.md,
    },
    bannerEntry: {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    bannerExit: {
      backgroundColor: 'rgba(34, 197, 94, 0.15)',
      borderWidth: 1,
      borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    bannerText: {
      ...textSm,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
      flex: 1,
      lineHeight: 20,
    },
  });
