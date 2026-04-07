/**
 * Design System v1.0 — AnimatedCounter Atom
 *
 * Animated number count-up from 0 to target value.
 * Uses monospace font (RobotoMono) and data-md typography.
 * Respects OS "Reduce Motion" setting.
 */
import { useEffect, useRef, useState } from 'react';
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
  const [displayText, setDisplayText] = useState(
    reducedMotion ? targetValue.toFixed(decimals) : (0).toFixed(decimals),
  );

  useEffect(() => {
    if (reducedMotion) {
      setDisplayText(targetValue.toFixed(decimals));
      return;
    }

    animatedValue.setValue(0);
    setDisplayText((0).toFixed(decimals));

    const animation = Animated.timing(animatedValue, {
      toValue: targetValue,
      duration,
      useNativeDriver: false,
    });

    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayText(value.toFixed(decimals));
    });

    animation.start();

    return () => {
      animation.stop();
      animatedValue.removeListener(listenerId);
    };
  }, [targetValue, duration, decimals, reducedMotion, animatedValue]);

  const mergedStyle: TextStyle = {
    ...textDataMd,
    ...style,
  };

  return (
    <Text style={mergedStyle}>
      {prefix}{displayText}{suffix}
    </Text>
  );
};
