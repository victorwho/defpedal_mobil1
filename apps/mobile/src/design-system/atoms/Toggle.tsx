/**
 * Design System v1.0 — Toggle Switch Atom
 *
 * Track: 52px wide x 28px tall, rounded-full.
 * Thumb: 24px diameter circle.
 * Off -> track gray-600, thumb white.
 * On  -> track accent, thumb dark-900.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { radii } from '../tokens/radii';
import { duration, easing } from '../tokens/motion';
import { gray } from '../tokens/colors';
import { useTheme } from '..';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptics } from '../hooks/useHaptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACK_W = 52;
const TRACK_H = 28;
const THUMB_SIZE = 24;
const THUMB_TRAVEL = TRACK_W - THUMB_SIZE - 4; // 2px inset each side

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const anim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      anim.setValue(checked ? 1 : 0);
      return;
    }
    Animated.timing(anim, {
      toValue: checked ? 1 : 0,
      duration: duration.fast,
      useNativeDriver: false,
    }).start();
  }, [checked, reducedMotion]);

  const thumbTranslateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 2 + THUMB_TRAVEL],
  });

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [gray[600], colors.accent],
  });

  const thumbColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', colors.textInverse],
  });

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.light();
        onChange(!checked);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: thumbColor,
              transform: [{ translateX: thumbTranslateX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: radii.full,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});
