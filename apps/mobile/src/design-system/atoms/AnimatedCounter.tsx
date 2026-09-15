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
  /**
   * Group thousands ("100,000" rather than "100000").
   *
   * Off by default so every existing caller is unchanged. Worth turning on
   * above four digits: the City Heartbeat estimates reach six ("100000" for
   * Bucharest), and an ungrouped six-digit figure has to be counted rather
   * than read, which is the opposite of what a glanceable stat is for.
   */
  groupThousands?: boolean;
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
  groupThousands = false,
  style,
}: AnimatedCounterProps) => {
  const reducedMotion = useReducedMotion();
  // Locale-aware, so a Romanian reader gets their own separator rather than a
  // comma imposed by the source language.
  const format = useCallback(
    (v: number): string =>
      groupThousands
        ? v.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : v.toFixed(decimals),
    [groupThousands, decimals],
  );
  const [displayText, setDisplayText] = useState(
    reducedMotion ? format(targetValue) : format(0),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reducedMotion || targetValue === 0) {
      setDisplayText(format(targetValue));
      return;
    }

    // Reset and start fresh animation via setInterval (~60 fps).
    // setInterval + Date.now() works reliably in Hermes bytecode
    // where requestAnimationFrame callbacks may not fire.
    setDisplayText(format(0));
    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for a pleasant deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = targetValue * eased;
      setDisplayText(format(current));

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
  }, [targetValue, duration, decimals, reducedMotion, format]);

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
