/**
 * Design System v1.0 — FadeSlideIn Animation Wrapper
 *
 * Wraps children in an Animated.View that fades in and slides up on mount.
 * Respects the OS "Reduce Motion" accessibility setting — when enabled,
 * children render immediately at full opacity with no animation.
 *
 * Usage:
 *   <FadeSlideIn delay={100}>
 *     <Card>...</Card>
 *   </FadeSlideIn>
 */
import React, { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { duration as motionDuration, easing } from '../tokens/motion';

interface FadeSlideInProps {
  children: React.ReactNode;
  /** Delay before the animation starts (ms). Default: 0 */
  delay?: number;
  /** Total animation duration (ms). Default: 200 */
  duration?: number;
  /** Initial vertical offset (px). Positive = starts below. Default: 10 */
  translateY?: number;
  /** Optional style applied to the wrapping Animated.View */
  style?: ViewStyle;
}

export function FadeSlideIn({
  children,
  delay = 0,
  duration = motionDuration.fast + 50, // 200ms
  translateY = 10,
  style,
}: FadeSlideInProps): React.ReactElement {
  const isReducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(isReducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (isReducedMotion) {
      // Ensure full visibility without animation
      progress.setValue(1);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: easing.out,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [isReducedMotion, progress, duration, delay]);

  const animatedStyle: Animated.WithAnimatedObject<ViewStyle> = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [translateY, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

export type { FadeSlideInProps };
