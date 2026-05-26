/**
 * Design System — HoloMedallion Atom
 *
 * Holographic tier medallion. Sister to HoloSticker but tuned for rank
 * display (singular, ambient, on-screen as your active status) rather
 * than badge display (one of many, interactive, collectible).
 *
 * Differences from HoloSticker:
 *   - No rim or halo overlay — the medallion frame (iridescent ring,
 *     accent metal band, gem chips, engraved tier name) is baked into
 *     the source PNG at design time, no runtime compositing.
 *   - No tap-to-glare — a tier is a status indicator, not a toy.
 *     The PanResponder still claims gestures for drag-tilt, but tap-
 *     shaped releases are no-ops (no onTap callback exposed).
 *   - Continuous slow shimmer — a faint diagonal specular streak
 *     sweeps across the medallion on a ~6 s loop, conveying "polished
 *     metal catching ambient light". Reads as "active status", not as
 *     "press me". Suppressed under reduced-motion and while NAVIGATING.
 *   - Does NOT participate in claimHoloFocus — tiers stay live under
 *     the detail modal (badges freeze underneath it because they're
 *     decorative; the rider tier is functional status info).
 *
 * Implementation notes:
 *   - Tilt range and 3D perspective match HoloSticker exactly so a
 *     screen mixing both reads as the same physical material.
 *   - The shimmer is rendered as an SVG LinearGradient inside a static
 *     wrapper that's circular-clipped to the medallion bounds (the
 *     PNG art is already circular but the streak rect is square).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAppStore } from '../../store/appStore';
import { useHoloTilt } from '../hooks/useHoloTilt';
import { getHoloTierAsset } from '../tokens/holoTiers';
import type { RiderTierKey } from '../tokens/tierColors';

const TAP_MAX_DISTANCE = 8;
const SHIMMER_CYCLE_MS = 6000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoloMedallionProps {
  /** Tier key — resolved via holoTiers manifest. */
  tier: RiderTierKey;
  /** Render size (square) in points. Matches the inscribed medallion bounds. */
  size: number;
  /** Disable interactions (drag + shimmer). Useful for view-shot captures. */
  interactive?: boolean;
  /** Override the NAVIGATING suppression (testing only). */
  forceMotion?: boolean;
  /** Accessibility label — defaults to "{tier} tier medallion". */
  accessibilityLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HoloMedallion: React.FC<HoloMedallionProps> = ({
  tier,
  size,
  interactive = true,
  forceMotion = false,
  accessibilityLabel,
}) => {
  const source = getHoloTierAsset(tier);
  const appState = useAppStore((s) => s.appState);
  const motionAllowed = forceMotion || appState !== 'NAVIGATING';

  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;

  const [isDragging, setIsDragging] = useState(false);

  // Gyro subscription — same shared listener the badges use. Tier is NOT
  // a focused consumer (focused=false) so it pauses while a badge detail
  // modal has claimed exclusive focus elsewhere in the tree.
  useHoloTilt({
    tiltX,
    tiltY,
    enabled: interactive && motionAllowed && !isDragging,
  });

  // Continuous shimmer — loop a translate from -size to +size on the
  // specular streak, with a brief on/off window so it's not constantly
  // visible. Driver runs while motion is allowed; stops cleanly on
  // unmount or suppression so it doesn't leak.
  const shimmerProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!interactive || !motionAllowed) {
      shimmerProgress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(shimmerProgress, {
        toValue: 1,
        duration: SHIMMER_CYCLE_MS,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      shimmerProgress.setValue(0);
    };
  }, [interactive, motionAllowed, shimmerProgress]);

  const releaseTilt = () => {
    Animated.parallel([
      Animated.spring(tiltX, {
        toValue: 0,
        damping: 14,
        stiffness: 90,
        useNativeDriver: true,
      }),
      Animated.spring(tiltY, {
        toValue: 0,
        damping: 14,
        stiffness: 90,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setIsDragging(false);
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim aggressively so the tilt response feels immediate, but tap-
        // shaped releases are silent (no glare, no onTap forwarding) — the
        // medallion is a status display, not an interactive control.
        onStartShouldSetPanResponder: () => interactive && motionAllowed,
        onStartShouldSetPanResponderCapture: () => interactive && motionAllowed,
        onMoveShouldSetPanResponder: () => interactive && motionAllowed,
        onMoveShouldSetPanResponderCapture: () => interactive && motionAllowed,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => setIsDragging(true),
        onPanResponderMove: (
          _e: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          const half = size / 2;
          tiltX.setValue(Math.max(-1, Math.min(1, gesture.dx / half)));
          tiltY.setValue(Math.max(-1, Math.min(1, gesture.dy / half)));
        },
        onPanResponderRelease: releaseTilt,
        onPanResponderTerminate: releaseTilt,
      }),
    [interactive, motionAllowed, size],
  );

  // ---- Animated interpolations ----------------------------------------------

  const cardRotateY = tiltX.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-14deg', '14deg'],
  });
  const cardRotateX = tiltY.interpolate({
    inputRange: [-1, 1],
    outputRange: ['14deg', '-14deg'],
  });

  // Shimmer translate: streak starts off the left edge, crosses the
  // medallion over the first 35% of the cycle, then hides off the right
  // edge for the remaining 65% (long pause between sweeps so it doesn't
  // feel constantly "buzzing").
  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [-size * 1.2, size * 1.2, size * 1.2],
  });
  const shimmerOpacity = shimmerProgress.interpolate({
    inputRange: [0, 0.05, 0.3, 0.35, 1],
    outputRange: [0, 0.55, 0.55, 0, 0],
  });

  // ---- Render --------------------------------------------------------------

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  };

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${tier} tier medallion`}
      style={containerStyle}
      {...panResponder.panHandlers}
    >
      {/* Card face — 3D rotated group containing the medallion PNG + shimmer */}
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          transform: [
            { perspective: 800 },
            { rotateX: cardRotateX },
            { rotateY: cardRotateY },
          ],
        }}
      >
        {/* Base medallion PNG (frame + character + engraving + drop shadow baked in) */}
        <Image
          source={source}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        {/* Continuous slow shimmer — diagonal specular streak clipped to the
            medallion's circular bounds via overflow:hidden + borderRadius. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              opacity: shimmerOpacity,
              transform: [{ translateX: shimmerTranslateX }, { rotate: '22deg' }],
            }}
          >
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Defs>
                <LinearGradient id="holoMedallionShimmer" x1="0%" y1="50%" x2="100%" y2="50%">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                  <Stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
                  <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={size} height={size} fill="url(#holoMedallionShimmer)" />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};
