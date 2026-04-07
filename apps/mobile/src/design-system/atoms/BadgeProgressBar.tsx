/**
 * Design System — BadgeProgressBar Atom
 *
 * Thin animated progress bar for badge progress.
 * Always paired with a text label — never shown alone.
 * Track: bgTertiary, Fill: tier primary color.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';

import { badgeSpace } from '../tokens/badgeColors';
import { brandColors } from '../tokens/colors';
import { radii } from '../tokens/radii';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BadgeProgressBarProps {
  /** Current progress value */
  current: number;
  /** Target value */
  target: number;
  /** Tier primary color for the fill */
  tierColor: string;
  /** Bar height in px — defaults to badgeSpace.progressHeight (4px) */
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BadgeProgressBar: React.FC<BadgeProgressBarProps> = ({
  current,
  target,
  tierColor,
  height = badgeSpace.progressHeight,
}) => {
  const fraction = target > 0 ? Math.min(current / target, 1) : 0;
  const animatedScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedScale, {
      toValue: fraction,
      duration: 600,
      useNativeDriver: true, // GPU-accelerated with transform
    }).start();
  }, [fraction]);

  const trackStyle: ViewStyle = {
    height,
    borderRadius: radii.sm,
    backgroundColor: brandColors.bgTertiary,
    overflow: 'hidden',
  };

  // Fill bar: full width, scaled from left edge via transform
  const fillStyle: ViewStyle = {
    height,
    width: '100%',
    borderRadius: radii.sm,
    backgroundColor: tierColor,
  };

  return (
    <View style={trackStyle}>
      <Animated.View
        style={[
          fillStyle,
          {
            transform: [{ scaleX: animatedScale }],
            transformOrigin: 'left',
          },
        ]}
      />
    </View>
  );
};
