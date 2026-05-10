/**
 * Design System v1.0 — useStaggeredEntrance Hook
 *
 * Returns an animated style for an item entering at position `index` in a
 * cascade. Use on list/grid items mounted together (trip history, badges,
 * leaderboard) to add a 40ms-per-item entrance ripple.
 *
 * Usage:
 *   items.map((item, i) => {
 *     const style = useStaggeredEntrance(i);
 *     return <Animated.View style={style}>{...}</Animated.View>;
 *   });
 *
 * One-shot: animates on mount only. No replay on re-render or scroll.
 *
 * Reduced motion: returns a static fully-visible style (no opacity/transform).
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';

import { duration as durations, easing as easings, stagger } from '../tokens/motion';
import { useReducedMotion } from './useReducedMotion';

export interface UseStaggeredEntranceOptions {
  /** Translate-Y travel distance in px. Default 8. */
  distance?: number;
  /** Per-item delay in ms (overrides token default). */
  step?: number;
  /** Animation duration in ms. Default 250 (motion.duration.normal). */
  duration?: number;
  /** Disable animation entirely (e.g., when item is already visible). */
  disabled?: boolean;
}

export interface StaggeredEntranceStyle {
  opacity: Animated.Value;
  transform: Array<{ translateY: Animated.Value }>;
}

export const useStaggeredEntrance = (
  index: number,
  options: UseStaggeredEntranceOptions = {},
): StaggeredEntranceStyle => {
  const reduced = useReducedMotion();
  const {
    distance = 8,
    step = stagger.step,
    duration: animDuration = durations.normal,
    disabled = false,
  } = options;

  const opacity = useRef(new Animated.Value(reduced || disabled ? 1 : 0)).current;
  const translateY = useRef(
    new Animated.Value(reduced || disabled ? 0 : distance),
  ).current;

  useEffect(() => {
    if (reduced || disabled) {
      // Snap to final state — no animation.
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    const cappedIndex = Math.min(index, stagger.maxItems);
    const delay = cappedIndex * step;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: animDuration,
        delay,
        easing: easings.out,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: animDuration,
        delay,
        easing: easings.out,
        useNativeDriver: true,
      }),
    ]).start();
    // Mount-only animation; deps intentionally empty so re-renders don't replay it.
  }, []);

  return useMemo(
    () => ({
      opacity,
      transform: [{ translateY }],
    }),
    [opacity, translateY],
  );
};
