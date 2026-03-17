/**
 * Design System v1.0 — Skeleton Loader Atom
 *
 * Pulsing placeholder that matches target component dimensions.
 * Animates between bgTertiary and bgSecondary at 1.5s cycle.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkeletonProps {
  width: number | string;
  height: number;
  radius?: keyof typeof radii;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  radius = 'md',
}) => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 0.7 : 0.5)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.7);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [reducedMotion]);

  const style: Animated.AnimatedProps<ViewStyle> = {
    width: width as number,
    height,
    borderRadius: radii[radius],
    backgroundColor: colors.bgTertiary,
    opacity,
  };

  return (
    <Animated.View
      style={style}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    />
  );
};
