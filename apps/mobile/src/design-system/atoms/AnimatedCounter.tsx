/**
 * Design System v1.0 — AnimatedCounter Atom
 *
 * Animated number count-up from 0 to target value.
 * Uses monospace font (RobotoMono) and data-md typography.
 * Respects OS "Reduce Motion" setting.
 */
import { useEffect, useRef } from 'react';
import { Animated, Text, type TextStyle } from 'react-native';

import { textDataMd } from '../tokens/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnimatedCounterProps {
  targetValue: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: TextStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AnimatedCounter = ({
  targetValue,
  duration = 1500,
  prefix = '',
  suffix = '',
  decimals = 1,
  style,
}: AnimatedCounterProps) => {
  const reducedMotion = useReducedMotion();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const displayRef = useRef(targetValue.toFixed(decimals));
  const textRef = useRef<Text>(null);

  useEffect(() => {
    if (reducedMotion) {
      // Skip animation — show final value immediately
      animatedValue.setValue(targetValue);
      displayRef.current = targetValue.toFixed(decimals);
      textRef.current?.setNativeProps({
        text: `${prefix}${displayRef.current}${suffix}`,
      });
      return;
    }

    animatedValue.setValue(0);

    const animation = Animated.timing(animatedValue, {
      toValue: targetValue,
      duration,
      useNativeDriver: false,
    });

    const listenerId = animatedValue.addListener(({ value }) => {
      displayRef.current = value.toFixed(decimals);
      textRef.current?.setNativeProps({
        text: `${prefix}${displayRef.current}${suffix}`,
      });
    });

    animation.start();

    return () => {
      animation.stop();
      animatedValue.removeListener(listenerId);
    };
  }, [targetValue, duration, decimals, prefix, suffix, reducedMotion, animatedValue]);

  const mergedStyle: TextStyle = {
    ...textDataMd,
    ...style,
  };

  return (
    <Text ref={textRef} style={mergedStyle}>
      {prefix}{reducedMotion ? targetValue.toFixed(decimals) : '0'.padStart(1, '0')}{suffix}
    </Text>
  );
};
