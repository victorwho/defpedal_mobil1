/**
 * Design System v1.0 — IdlePulse Atom
 *
 * Wraps children in an Animated.View that loops a slow opacity breathe
 * (1.0 ↔ 0.55, ~1.1s each phase). Used to give empty-state illustrations
 * a sign of life without being distracting. Suppressed under reduced motion.
 *
 * Use sparingly — reserve for empty states or idle decorative elements.
 * Never wrap content the user must read or interact with.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../hooks/useReducedMotion';

export interface IdlePulseProps {
  children: React.ReactNode;
  /** Optional style passed to the wrapping Animated.View. */
  style?: StyleProp<ViewStyle>;
  /** Bottom of the breathe range (default 0.55). */
  minOpacity?: number;
  /** Per-phase duration in ms (default 1100). */
  phaseMs?: number;
}

export const IdlePulse: React.FC<IdlePulseProps> = ({
  children,
  style,
  minOpacity = 0.55,
  phaseMs = 1100,
}) => {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: minOpacity,
          duration: phaseMs,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: phaseMs,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, minOpacity, phaseMs, opacity]);

  return <Animated.View style={[{ opacity }, style]}>{children}</Animated.View>;
};
