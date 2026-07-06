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
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Defs, Ellipse, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAppStore } from '../../store/appStore';
import { useT } from '../../hooks/useTranslation';
import { useHoloTilt } from '../hooks/useHoloTilt';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { tierColors, type BadgeTier } from '../tokens/badgeColors';
import { getHoloBadgeAsset } from '../tokens/holoBadges';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoloStickerProps {
  /** Direct image source. Mutually exclusive with `badgeKey`. */
  source?: ImageSourcePropType;
  /** Badge key — resolved via holoBadges manifest. Mutually exclusive with `source`. */
  badgeKey?: string;
  /** Fallback key (tier family) used when `badgeKey` isn't in the manifest. */
  tierFamily?: string | null;
  /** Render size (square) in points. */
  size: number;
  /** Tier — drives halo and rim color. */
  tier?: BadgeTier;
  /** Disable tilt + glare interactions. */
  interactive?: boolean;
  /** Override the NAVIGATING suppression (testing only). */
  forceMotion?: boolean;
  /**
   * Set true when this sticker is the focused one (e.g. detail-modal hero).
   * While any consumer has claimed focus, only stickers with focused=true
   * receive gyro updates — grid stickers behind a modal stop tilting.
   */
  focused?: boolean;
  /**
   * Tap callback — fires on a quick press with no drag movement. Pair with
   * the glare sweep that already runs on tap. Required for cases where the
   * sticker sits inside a parent Pressable (the PanResponder claims the
   * gesture and would otherwise swallow the parent's onPress).
   */
  onTap?: () => void;
  /** Accessibility label — defaults to "Holographic badge". */
  accessibilityLabel?: string;
}

const TAP_MAX_DISTANCE = 8;
const TAP_MAX_DURATION_MS = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HoloSticker: React.FC<HoloStickerProps> = ({
  source,
  badgeKey,
  tierFamily,
  size,
  tier = 'gold',
  interactive = true,
  forceMotion = false,
  focused = false,
  onTap,
  accessibilityLabel,
}) => {
  const t = useT();
  // Audit 2026-07-05 UX-9: localized default a11y label.
  const resolvedA11yLabel = accessibilityLabel ?? t('achievements.holoA11y');
  // Resolve the PNG source: explicit `source` wins; otherwise look up by key.
  const resolvedSource = useMemo(
    () => source ?? (badgeKey ? getHoloBadgeAsset(badgeKey, tierFamily) : undefined),
    [source, badgeKey, tierFamily],
  );

  const appState = useAppStore((s) => s.appState);
  const motionAllowed = forceMotion || appState !== 'NAVIGATING';
  // Audit 2026-07-05 UX-10 (WCAG 2.3.3): the gyro shimmer already respects
  // Reduce Motion inside useHoloTilt, but the tap-glare sweep and drag-tilt
  // are user-triggered animations that must be suppressed too. Tap
  // FORWARDING stays live — only the visual motion is gated.
  const reducedMotion = useReducedMotion();

  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  const glareProgress = useRef(new Animated.Value(0)).current;

  // Drag suspends gyro so a finger touch always wins over the sensor stream.
  // While `isDragging` is true, useHoloTilt detaches its listener (this is
  // refcounted globally — the sensor is fully off when no consumer wants it).
  const [isDragging, setIsDragging] = useState(false);

  useHoloTilt({
    tiltX,
    tiltY,
    enabled: interactive && motionAllowed && !isDragging,
    focused,
  });

  const pressStartRef = useRef<{ t: number; movedFar: boolean }>({
    t: 0,
    movedFar: false,
  });

  // Keep onTap fresh inside the (memoized) PanResponder closure without
  // having to rebuild it every render. Parents typically pass a new
  // arrow each render — adding `onTap` to the useMemo deps would thrash.
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const fireGlare = () => {
    if (!motionAllowed || reducedMotion) return;
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
    ]).start(({ finished }) => {
      // Hand control back to gyro only after the spring settles; otherwise
      // the sensor's next sample would jump-cut over the in-flight animation.
      if (finished) setIsDragging(false);
    });
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
          setIsDragging(true);
        },
        onPanResponderMove: (
          _e: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          if (!reducedMotion) {
            const half = size / 2;
            tiltX.setValue(Math.max(-1, Math.min(1, gesture.dx / half)));
            tiltY.setValue(Math.max(-1, Math.min(1, gesture.dy / half)));
          }
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
            // The PanResponder swallowed the gesture from any parent Pressable,
            // so we forward the tap explicitly. Caller wires this to whatever
            // onPress would have done (e.g. open the detail modal).
            onTapRef.current?.();
          }
          releaseTilt();
        },
        onPanResponderTerminate: releaseTilt,
      }),
    [interactive, motionAllowed, size, reducedMotion],
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

  // Cast shadow — true ellipse via SVG (RN's borderRadius is clamped to half
  // the smallest dimension, so a wide rect with borderRadius: width renders as
  // a rounded rectangle, not an ellipse — that surfaced as a "dark square"
  // behind the sticker on Android in v0.2.63 / v0.2.64). The ellipse here
  // softens at the rim via a radial-ish gradient simulated with three stops.
  const shadowWidth = size * 0.85;
  const shadowHeight = size * 0.22;
  const shadowStyle: ViewStyle = {
    position: 'absolute',
    width: shadowWidth,
    height: shadowHeight,
    top: size * 0.82,
    left: (size - shadowWidth) / 2,
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

  // No holo art available — caller is expected to fall back to BadgeIcon.
  if (!resolvedSource) {
    return null;
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={resolvedA11yLabel}
      style={containerStyle}
      {...panResponder.panHandlers}
    >
      {/* Layer 1: Cast shadow — SVG ellipse (true round shape, no clamping) */}
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
      >
        <Svg width={shadowWidth} height={shadowHeight}>
          <Defs>
            <LinearGradient id="holoShadow" x1="50%" y1="0%" x2="50%" y2="100%">
              <Stop offset="0%" stopColor="#000" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#000" stopOpacity="0.15" />
            </LinearGradient>
          </Defs>
          <Ellipse
            cx={shadowWidth / 2}
            cy={shadowHeight / 2}
            rx={shadowWidth / 2}
            ry={shadowHeight / 2}
            fill="url(#holoShadow)"
          />
        </Svg>
      </Animated.View>

      {/* Layer 2: Halo glow — sibling to the 3D layer */}
      <View style={haloStyle} pointerEvents="none" />

      {/* Layer 3: Card face — 3D rotated group (no needsOffscreenAlphaCompositing —
          on some Android devices it allocates an offscreen buffer with a black
          default backing that shows through any transparent child areas) */}
      <Animated.View
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
        {/* 3a. Edge thickness — two dark, alpha-respecting copies of the PNG
            offset down-right to fake the sticker's side profile. Each copy is
            shaped by the source PNG's alpha (we background-removed the source
            in v0.2.66, so tintColor now respects the die-cut silhouette
            instead of filling the bounding rect). Offsets stagger so the
            accumulated darkening reads as visible thickness, not a halo. */}
        <Image
          source={resolvedSource}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ translateX: 8 }, { translateY: 12 }],
            tintColor: '#000',
            opacity: 0.22,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Image
          source={resolvedSource}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ translateX: 4 }, { translateY: 6 }],
            tintColor: '#000',
            opacity: 0.4,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        {/* 3b. Base PNG */}
        <Image
          source={resolvedSource}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        {/* 3c. Tier rim ring */}
        <View style={rimStyle} pointerEvents="none" />

        {/* 3d-e. Sheen + glare wrapped in a circular clip inscribed in the
            sticker bounds. Without this clip the sheen Animated.View (sized
            at 1.8× to allow translation) bleeds the rainbow gradient onto
            the surrounding card area and over the title text above. The
            die-cut sticker silhouette fits within an inscribed circle, so
            this clip removes the spillage without cropping the artwork. */}
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
        </View>
      </Animated.View>
    </View>
  );
};
