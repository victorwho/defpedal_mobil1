/**
 * Design System v1.0 — AnimatedCounter Atom
 *
 * Animated number count-up from 0 to target value.
 * Uses monospace font (RobotoMono) and data-md typography.
 * Respects OS "Reduce Motion" setting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const animate = useCallback(
    (startTs: number) => {
      const elapsed = startTs - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for a pleasant deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = targetValue * eased;
      setDisplayText(current.toFixed(decimals));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    },
    [targetValue, duration, decimals],
  );

  useEffect(() => {
    if (reducedMotion || targetValue === 0) {
      setDisplayText(targetValue.toFixed(decimals));
      return;
    }

    // Reset and start fresh animation
    setDisplayText((0).toFixed(decimals));
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [targetValue, duration, decimals, reducedMotion, animate]);

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
