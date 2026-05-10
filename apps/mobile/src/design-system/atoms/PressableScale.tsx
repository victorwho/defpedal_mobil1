/**
 * Design System v1.0 — PressableScale Atom
 *
 * The canonical press primitive. Wraps Pressable with a spring scale + opacity
 * animation on press in/out, plus an optional haptic intent. Use this anywhere
 * a tap should feel like a physical response — buttons, cards, list rows, FABs.
 *
 * Outer Animated.View carries the transform/opacity (so the inner Pressable
 * can keep state-based style overrides via `pressedStyle`).
 *
 * Reduced-motion: scale animation is skipped, opacity feedback retained so the
 * tap still confirms visually. Haptic suppression is handled by useHaptics.
 *
 * Press handlers fire in this order: `onPressIn` → animate down + haptic →
 * `onPress` (on release) → `onPressOut` → animate up.
 */
import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useHaptics } from '../hooks/useHaptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { HapticToken } from '../tokens/haptics';
import { springs } from '../tokens/motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Static style for the pressable surface (size, padding, bg, radius). */
  style?: StyleProp<ViewStyle>;
  /** Style applied only while pressed (e.g. darker bg). Inner Pressable. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Scale value at full press depth. Default 0.96. */
  pressedScale?: number;
  /** Opacity value at full press depth. Default 0.92. */
  pressedOpacity?: number;
  /** Haptic intent fired on press in. `false` disables. Default `'confirm'`. */
  hapticOnPress?: HapticToken | false;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PressableScale: React.FC<PressableScaleProps> = ({
  style,
  pressedStyle,
  pressedScale = 0.96,
  pressedOpacity = 0.92,
  hapticOnPress = 'confirm',
  disabled,
  onPressIn,
  onPressOut,
  children,
  ...rest
}) => {
  const reduced = useReducedMotion();
  const haptics = useHaptics();

  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateTo = (targetScale: number, targetOpacity: number) => {
    if (reduced) {
      // Skip scale, keep opacity feedback so the tap is still visible.
      Animated.timing(opacity, {
        toValue: targetOpacity,
        duration: 80,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(scale, {
        toValue: targetScale,
        ...springs.snappy,
        useNativeDriver: true,
      }),
      Animated.spring(opacity, {
        toValue: targetOpacity,
        ...springs.snappy,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressIn: PressableProps['onPressIn'] = (e) => {
    if (!disabled) {
      animateTo(pressedScale, pressedOpacity);
      if (hapticOnPress !== false) {
        haptics.fire(hapticOnPress);
      }
    }
    onPressIn?.(e);
  };

  const handlePressOut: PressableProps['onPressOut'] = (e) => {
    if (!disabled) {
      animateTo(1, 1);
    }
    onPressOut?.(e);
  };

  const animatedStyle = useMemo(
    () => ({
      transform: [{ scale }],
      opacity,
    }),
    [scale, opacity],
  );

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [style, pressed && pressedStyle]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};
