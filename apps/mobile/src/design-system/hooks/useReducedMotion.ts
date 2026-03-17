/**
 * Design System v1.0 — useReducedMotion Hook
 *
 * Listens to the OS "Reduce Motion" accessibility setting.
 * When enabled, animated components should skip or shorten animations.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the user has enabled "Reduce Motion" in their OS settings.
 * Animated components should:
 *   - Replace timing/spring with instant value changes (duration = 0)
 *   - Skip looping pulse animations entirely
 *   - Use opacity crossfades instead of slides/scales
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Query initial value
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);

    // Subscribe to changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );

    return () => subscription.remove();
  }, []);

  return reduced;
};
