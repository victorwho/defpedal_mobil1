/**
 * Design System v1.0 — BottomSheet Organism
 *
 * Pure RN Animated implementation (no native dep required).
 * 3 snap points (25% / 50% / 85% of screen).
 * Drag handle, rounded-t-2xl, dark glass background.
 *
 * Can be swapped for @gorhom/bottom-sheet once native deps are installed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { useTheme } from '../ThemeContext';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { shadows } from '../tokens/shadows';
import { gray } from '../tokens/colors';
import { duration, easing } from '../tokens/motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptics } from '../hooks/useHaptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapIndex = 0 | 1 | 2;

export interface BottomSheetProps {
  /** Children rendered inside the scrollable area */
  children: React.ReactNode;
  /** Footer pinned below scroll content */
  footer?: React.ReactNode;
  /** Initial snap point index (0=25%, 1=50%, 2=85%) */
  initialSnap?: SnapIndex;
  /** Callback when snap index changes */
  onSnapChange?: (index: SnapIndex) => void;
  /** Whether the sheet is visible */
  visible?: boolean;
}

// ---------------------------------------------------------------------------
// Snap fractions
// ---------------------------------------------------------------------------

const SNAP_FRACTIONS = [0.25, 0.50, 0.85] as const;
const HANDLE_HEIGHT = 44; // 44px touch target minimum

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BottomSheet: React.FC<BottomSheetProps> = ({
  children,
  footer,
  initialSnap = 1,
  onSnapChange,
  visible = true,
}) => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const haptics = useHaptics();
  const [screenH, setScreenH] = useState(Dimensions.get('window').height);
  const snapHeights = SNAP_FRACTIONS.map((f) => Math.round(screenH * f));
  const currentSnap = useRef<SnapIndex>(initialSnap);

  const sheetHeight = useRef(
    new Animated.Value(snapHeights[initialSnap]),
  ).current;

  // Animate to snap point
  const animateTo = useCallback(
    (index: SnapIndex) => {
      haptics.snap();
      currentSnap.current = index;
      if (reducedMotion) {
        sheetHeight.setValue(snapHeights[index]);
      } else {
        Animated.timing(sheetHeight, {
          toValue: snapHeights[index],
          duration: duration.normal,
          easing: easing.default,
          useNativeDriver: false,
        }).start();
      }
      onSnapChange?.(index);
    },
    [snapHeights, onSnapChange, reducedMotion],
  );

  // Find nearest snap point
  const findNearestSnap = useCallback(
    (height: number): SnapIndex => {
      let best: SnapIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < snapHeights.length; i++) {
        const d = Math.abs(height - snapHeights[i]);
        if (d < bestDist) {
          bestDist = d;
          best = i as SnapIndex;
        }
      }
      return best;
    },
    [snapHeights],
  );

  // Pan responder for drag handle
  const dragStartH = useRef(snapHeights[initialSnap]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Capture current height
        // @ts-ignore — _value is internal but safe to read
        dragStartH.current = (sheetHeight as any)._value ?? snapHeights[currentSnap.current];
      },
      onPanResponderMove: (_, gesture) => {
        const newH = dragStartH.current - gesture.dy;
        const clamped = Math.max(snapHeights[0] * 0.8, Math.min(newH, snapHeights[2] * 1.05));
        sheetHeight.setValue(clamped);
      },
      onPanResponderRelease: (_, gesture) => {
        const currentH = dragStartH.current - gesture.dy;
        // Factor in velocity: if flicking up → snap higher, flicking down → snap lower
        const projectedH = currentH - gesture.vy * 200;
        const nearest = findNearestSnap(projectedH);
        animateTo(nearest);
      },
    }),
  ).current;

  // Re-snap on screen rotation
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreenH(window.height);
    });
    return () => sub.remove();
  }, []);

  // Animate initial appearance
  useEffect(() => {
    if (visible) {
      animateTo(initialSnap);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: sheetHeight,
          backgroundColor: colors.bgPrimary,
          borderColor: colors.borderDefault,
        },
        shadows.lg,
      ]}
    >
      {/* Drag handle */}
      <View
        style={styles.handleZone}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Sheet drag handle"
        accessibilityHint="Drag up or down to resize"
      >
        <View style={[styles.handle, { backgroundColor: gray[600] }]} />
      </View>

      {/* Scrollable content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {children}
      </ScrollView>

      {/* Pinned footer */}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.borderDefault,
              backgroundColor: colors.bgSecondary,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handleZone: {
    height: HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
  },
  content: {
    paddingHorizontal: space[4],
    paddingBottom: space[4],
    gap: space[3],
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[5],
    gap: space[3],
  },
});
