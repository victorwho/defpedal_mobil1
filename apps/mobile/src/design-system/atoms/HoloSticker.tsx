/**
 * Design System — HoloSticker Atom (SCAFFOLD)
 *
 * Renders a holographic sticker badge: PNG sticker + animated chromatic sheen
 * overlay + tier halo + 3D card tilt + tactile depth layers.
 *
 * Implementation notes:
 *   - react-native-svg's <Stop> does NOT animate via Animated.createAnimatedComponent
 *     (offsets arrive as "[object Object]" and the gradient falls back to opaque
 *     black fill). We keep gradient stops static and animate the entire sheen
 *     layer with transform: translate + rotate via Animated.View.
 *   - We use a plain View (not Pressable) for the gesture surface and detect
 *     tap manually inside PanResponder, because Pressable swallows the gesture
 *     and parent ScrollViews win arbitration against non-capturing PanResponders.
 *   - The 3D-rotating layer is wrapped tightly around the card face only.
 *     Halo + cast-shadow sit OUTSIDE the rotated layer so Android's hardware
 *     compositing doesn't paint an opaque black backing over them.
 *
 * Layer stack (back to front):
 *   1. Cast shadow — soft dark ellipse that shifts opposite to the tilt
 *   2. Tier glow halo — soft tinted glow extending beyond the sticker silhouette
 *   3. CARD FACE (3D-rotated group):
 *        3a. Edge thickness — tinted dark copy of the PNG offset down-right
 *            to simulate the visible side of a real sticker
 *        3b. Base PNG — the holo_badges/<key>.png illustration
 *        3c. Tier rim ring — colored ring at the sticker bounds
 *        3d. Holo sheen — static SVG LinearGradient, translated + rotated by tilt
 *        3e. Glare sweep — one-shot specular stripe on tap
 *
 * Suppressed during NAVIGATING (the static PNG + halo + rim still render).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAppStore } from '../../store/appStore';
import { tierColors, type BadgeTier } from '../tokens/badgeColors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoloStickerProps {
  source: ImageSourcePropType;
  size: number;
  tier?: BadgeTier;
  interactive?: boolean;
  forceMotion?: boolean;
  accessibilityLabel?: string;
}

const TAP_MAX_DISTANCE = 8;
const TAP_MAX_DURATION_MS = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HoloSticker: React.FC<HoloStickerProps> = ({
  source,
  size,
  tier = 'gold',
  interactive = true,
  forceMotion = false,
  accessibilityLabel = 'Holographic badge',
}) => {
  const appState = useAppStore((s) => s.appState);
  const motionAllowed = forceMotion || appState !== 'NAVIGATING';

  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  const glareProgress = useRef(new Animated.Value(0)).current;

  const pressStartRef = useRef<{ t: number; movedFar: boolean }>({
    t: 0,
    movedFar: false,
  });

  const fireGlare = () => {
    if (!motionAllowed) return;
    glareProgress.setValue(0);
    Animated.timing(glareProgress, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

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
    ]).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive && motionAllowed,
        onStartShouldSetPanResponderCapture: () => interactive && motionAllowed,
        onMoveShouldSetPanResponder: () => interactive && motionAllowed,
        onMoveShouldSetPanResponderCapture: () => interactive && motionAllowed,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          pressStartRef.current = { t: Date.now(), movedFar: false };
        },
        onPanResponderMove: (
          _e: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          const half = size / 2;
          tiltX.setValue(Math.max(-1, Math.min(1, gesture.dx / half)));
          tiltY.setValue(Math.max(-1, Math.min(1, gesture.dy / half)));
          if (
            Math.abs(gesture.dx) > TAP_MAX_DISTANCE ||
            Math.abs(gesture.dy) > TAP_MAX_DISTANCE
          ) {
            pressStartRef.current.movedFar = true;
          }
        },
        onPanResponderRelease: () => {
          const { t, movedFar } = pressStartRef.current;
          const elapsed = Date.now() - t;
          if (!movedFar && elapsed < TAP_MAX_DURATION_MS) {
            fireGlare();
          }
          releaseTilt();
        },
        onPanResponderTerminate: releaseTilt,
      }),
    [interactive, motionAllowed, size],
  );

  useEffect(() => {
    if (!motionAllowed) {
      tiltX.setValue(0);
      tiltY.setValue(0);
      glareProgress.setValue(0);
    }
  }, [motionAllowed]);

  // ---- Animated interpolations ----------------------------------------------

  const sheenSize = size * 1.8;
  const sheenInset = (sheenSize - size) / 2;

  const sheenTranslateX = tiltX.interpolate({
    inputRange: [-1, 1],
    outputRange: [size * 0.35, -size * 0.35],
  });
  const sheenTranslateY = tiltY.interpolate({
    inputRange: [-1, 1],
    outputRange: [size * 0.2, -size * 0.2],
  });
  const sheenRotate = tiltX.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-14deg', '14deg'],
  });

  const cardRotateY = tiltX.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-18deg', '18deg'],
  });
  const cardRotateX = tiltY.interpolate({
    inputRange: [-1, 1],
    outputRange: ['18deg', '-18deg'],
  });

  // Cast shadow shifts OPPOSITE to the card tilt — keeps the apparent light
  // source fixed above the page so the shadow always falls "below" the tilt.
  const shadowTranslateX = tiltX.interpolate({
    inputRange: [-1, 1],
    outputRange: [-size * 0.12, size * 0.12],
  });
  const shadowTranslateY = tiltY.interpolate({
    inputRange: [-1, 1],
    outputRange: [-size * 0.08, size * 0.08],
  });

  const glareTranslateX = glareProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-size, size],
  });
  const glareOpacity = glareProgress.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.65, 0.65, 0],
  });

  // ---- Static styles --------------------------------------------------------

  const halo = tierColors[tier];

  // Cast shadow — dark ellipse below the sticker, blurred via shadow on iOS.
  const shadowSize = size * 0.9;
  const shadowStyle: ViewStyle = {
    position: 'absolute',
    width: shadowSize,
    height: shadowSize * 0.4,
    top: size * 0.7,
    left: (size - shadowSize) / 2,
    borderRadius: shadowSize,
    backgroundColor: 'rgba(0,0,0,0.55)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      default: {},
    }),
  };

  // Halo glow — extends past the sticker silhouette.
  const haloOuterSize = size * 1.16;
  const haloOffset = (haloOuterSize - size) / 2;
  const haloStyle: ViewStyle = {
    position: 'absolute',
    top: -haloOffset,
    left: -haloOffset,
    width: haloOuterSize,
    height: haloOuterSize,
    borderRadius: haloOuterSize,
    backgroundColor: halo.primary,
    opacity: 0.32,
    ...Platform.select({
      ios: {
        shadowColor: halo.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: size * 0.22,
      },
      default: {},
    }),
  };

  // Tier rim ring inside the card face.
  const rimStyle: ViewStyle = {
    position: 'absolute',
    top: -4,
    left: -4,
    width: size + 8,
    height: size + 8,
    borderRadius: (size + 8) / 2,
    borderWidth: 3,
    borderColor: halo.primary,
    opacity: 0.85,
  };

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  };

  const cardFaceStyle = {
    width: size,
    height: size,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  };

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={containerStyle}
      {...panResponder.panHandlers}
    >
      {/* Layer 1: Cast shadow — sits OUTSIDE the 3D layer so it's not painted over */}
      <Animated.View
        pointerEvents="none"
        style={[
          shadowStyle,
          {
            transform: [
              { translateX: shadowTranslateX },
              { translateY: shadowTranslateY },
            ],
          },
        ]}
      />

      {/* Layer 2: Halo glow — sibling to the 3D layer */}
      <View style={haloStyle} pointerEvents="none" />

      {/* Layer 3: Card face — 3D rotated group */}
      <Animated.View
        needsOffscreenAlphaCompositing
        style={[
          cardFaceStyle,
          {
            transform: [
              { perspective: 800 },
              { rotateX: cardRotateX },
              { rotateY: cardRotateY },
            ],
          },
        ]}
      >
        {/* 3a. Edge thickness REMOVED — Android's tintColor on PNG ignores
            the die-cut alpha channel and fills the full bounding rect with
            the tint color, which surfaced as a dark square behind the
            sticker. Depth now comes from cast shadow + 3D tilt + halo.
            Proper thickness will be revisited with a Skia approach. */}

        {/* 3b. Base PNG */}
        <Image
          source={source}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        {/* 3c. Tier rim ring */}
        <View style={rimStyle} pointerEvents="none" />

        {/* 3d. Holo sheen — static gradient, animated transform */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -sheenInset,
            left: -sheenInset,
            width: sheenSize,
            height: sheenSize,
            opacity: 0.45,
            transform: [
              { translateX: sheenTranslateX },
              { translateY: sheenTranslateY },
              { rotate: sheenRotate },
            ],
          }}
        >
          <Svg width={sheenSize} height={sheenSize} viewBox={`0 0 ${sheenSize} ${sheenSize}`}>
            <Defs>
              <LinearGradient id="holoSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#7DFCFC" stopOpacity="0" />
                <Stop offset="20%" stopColor="#7DFCFC" stopOpacity="0.9" />
                <Stop offset="40%" stopColor="#FF7BD9" stopOpacity="0.9" />
                <Stop offset="60%" stopColor="#FFE066" stopOpacity="0.9" />
                <Stop offset="80%" stopColor="#9DFCFC" stopOpacity="0.9" />
                <Stop offset="100%" stopColor="#7DFCFC" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={sheenSize} height={sheenSize} fill="url(#holoSheen)" />
          </Svg>
        </Animated.View>

        {/* 3e. Glare sweep */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            opacity: glareOpacity,
            transform: [{ translateX: glareTranslateX }, { rotate: '20deg' }],
          }}
        >
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Defs>
              <LinearGradient id="holoGlare" x1="0%" y1="50%" x2="100%" y2="50%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size} height={size} fill="url(#holoGlare)" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
};
