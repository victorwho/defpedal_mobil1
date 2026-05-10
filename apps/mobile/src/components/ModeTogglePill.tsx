/**
 * ModeTogglePill
 *
 * Single segment of the Safe / Fast / Flat routing mode toggle on the route
 * planning screen. Animates background and label color between the inactive
 * tone and the variant's active scheme on selection.
 *
 * Reduced motion: snaps to final colors.
 *
 * Kept here (not in the design-system) because the variant-specific color
 * mapping is coupled to the routing-mode UX. Promote to a generic
 * SegmentedToggle once a second surface needs the same pattern.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PressableScale } from '../design-system/atoms/PressableScale';
import { useTheme } from '../design-system';
import { useReducedMotion } from '../design-system/hooks/useReducedMotion';
import { gray } from '../design-system/tokens/colors';
import { duration, easing } from '../design-system/tokens/motion';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { fontFamily } from '../design-system/tokens/typography';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export interface ModeTogglePillProps {
  iconName: IoniconsName;
  label: string;
  isActive: boolean;
  /** Background color when active (with low alpha — e.g. infoLight tint). */
  activeBgColor: string;
  /** Text + icon color when active. */
  activeFgColor: string;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export const ModeTogglePill: React.FC<ModeTogglePillProps> = ({
  iconName,
  label,
  isActive,
  activeBgColor,
  activeFgColor,
  onPress,
  accessibilityLabel,
  style,
}) => {
  useTheme(); // subscribe so the inactive resting tone tracks the theme
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isActive ? 1 : 0,
      duration: reduced ? 0 : duration.fast,
      easing: easing.default,
      useNativeDriver: false, // bg + text color interpolation
    }).start();
  }, [isActive, reduced, progress]);

  const animatedBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', activeBgColor],
  });
  const animatedFg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [gray[400], activeFgColor],
  });

  // Icon color snaps (Ionicons doesn't play well with Animated color interpolation).
  // The bg + text fade carry the visual transition.
  const iconColor = isActive ? activeFgColor : gray[400];

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      hapticOnPress="snap"
      style={style}
      pressedScale={0.94}
    >
      <Animated.View style={[styles.pill, { backgroundColor: animatedBg }]}>
        <Ionicons name={iconName} size={14} color={iconColor} />
        <Animated.Text style={[styles.label, { color: animatedFg }]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  label: {
    fontSize: 12,
    fontFamily: fontFamily.body.bold,
  },
});
