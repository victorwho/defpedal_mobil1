/**
 * Design System v1.0 — AnimatedCounter Atom
 *
 * Animated number count-up from 0 to target value.
 * Uses monospace font (RobotoMono) and data-md typography.
 * Respects OS "Reduce Motion" setting.
 *
 * Uses setInterval + Date.now() instead of requestAnimationFrame because
 * rAF callbacks don't fire reliably in Hermes bytecode (preview/release builds).
 */
import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';

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
  const [displayText, setDisplayText] = useState(
    reducedMotion ? targetValue.toFixed(decimals) : (0).toFixed(decimals),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion || targetValue === 0) {
      setDisplayText(targetValue.toFixed(decimals));
      return;
    }

    // Reset and start fresh animation via setInterval (~60 fps).
    // setInterval + Date.now() works reliably in Hermes bytecode
    // where requestAnimationFrame callbacks may not fire.
    setDisplayText((0).toFixed(decimals));
    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for a pleasant deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = targetValue * eased;
      setDisplayText(current.toFixed(decimals));

      if (progress >= 1 && intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 16);

    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetValue, duration, decimals, reducedMotion]);

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
