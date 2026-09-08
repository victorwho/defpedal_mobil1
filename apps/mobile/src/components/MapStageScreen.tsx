import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../design-system';
import { useT } from '../hooks/useTranslation';
import { useReducedMotion } from '../design-system/hooks/useReducedMotion';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { surfaceTints } from '../design-system/tokens/tints';
import { zIndex } from '../design-system/tokens/zIndex';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HANDLE_HEIGHT = 48; // drag handle row
const PEEK_CONTENT_HEIGHT = 60; // always-visible summary row when collapsed
const EXPANDED_RATIO = 0.65; // 65% of screen
const EXPANDED_HEIGHT = SCREEN_HEIGHT * EXPANDED_RATIO;
const MID_RATIO = 0.45; // enough for the map to stay the subject
const MID_HEIGHT = SCREEN_HEIGHT * MID_RATIO;
const SNAP_THRESHOLD = 80; // drag distance to trigger snap

/**
 * Where the sheet can rest.
 *
 * `mid` is opt-in via `enableMidDetent`, so a screen that has always been
 * binary stays binary. It exists for the loop planner, where the map is the
 * result and the sheet is the list: at full height the map the camera just
 * flew to is covered the moment results land, and collapsed the results are
 * hidden behind a gesture a first-time rider has no reason to try.
 */
export type SheetDetent = 'collapsed' | 'mid' | 'expanded';

type MapStageScreenProps = PropsWithChildren<{
  map: ReactNode;
  topOverlay?: ReactNode;
  rightOverlay?: ReactNode;
  footer?: ReactNode;
  /** When true, renders children inside a bottom sheet. When false (default), children are ignored. */
  useBottomSheet?: boolean;
  /**
   * Content shown in the sheet handle area even when collapsed.
   * Intended for a one-line summary (e.g. distance + ETA on route preview).
   * Height is fixed at PEEK_CONTENT_HEIGHT (60px).
   */
  peekContent?: ReactNode;
  /**
   * Open the sheet on mount instead of starting collapsed.
   *
   * The default (collapsed, map-first) is right for screens where the map IS
   * the content and the sheet holds detail — route preview, an imported
   * course. It is wrong for a screen whose sheet holds the CONTROLS: the loop
   * planner has nothing to show on the map until the rider has configured a
   * search, so opening collapsed hides the entire purpose of the screen behind
   * a drag handle.
   */
  initiallyExpanded?: boolean;
  /**
   * Allow a third resting height between collapsed and expanded.
   *
   * Off by default: adding a detent to a sheet a rider already has muscle
   * memory for is a behaviour change, and only the loop planner wants it.
   */
  enableMidDetent?: boolean;
  /**
   * Drive the sheet from outside. Supplying this makes the sheet CONTROLLED —
   * it still animates its own drags, but reports them through
   * `onDetentChange` and follows whatever comes back.
   *
   * Used so a search can drop the sheet out of the way while loops draw onto
   * the map, and raise it again when there is something to choose between.
   * Movement the rider did not ask for is the risk here, so every programmatic
   * change is tied to a tap they made.
   */
  detent?: SheetDetent;
  onDetentChange?: (detent: SheetDetent) => void;
}>;

const CollapsibleSheet = ({
  children,
  footer,
  bottomInset,
  peekContent,
  initiallyExpanded = false,
  enableMidDetent = false,
  detent: controlledDetent,
  onDetentChange,
  sheetBg,
  handleColor,
  borderColor,
}: {
  children: ReactNode;
  footer?: ReactNode;
  bottomInset: number;
  peekContent?: ReactNode;
  sheetBg: string;
  handleColor: string;
  borderColor: string;
  initiallyExpanded?: boolean;
  enableMidDetent?: boolean;
  detent?: SheetDetent;
  onDetentChange?: (detent: SheetDetent) => void;
}) => {
  const reducedMotion = useReducedMotion();
  const t = useT();
  // Collapsed by default — map-first: the peek strip carries the one-line
  // summary and the rider drags/taps up for full details.
  const [detent, setDetent] = useState<SheetDetent>(
    controlledDetent ?? (initiallyExpanded ? 'expanded' : 'collapsed'),
  );
  const expanded = detent !== 'collapsed';
  const effectiveExpanded = EXPANDED_HEIGHT - bottomInset;
  const effectiveMid = MID_HEIGHT - bottomInset;
  // Use a ref so panResponder closures always read the current collapsed height,
  // even if peekContent changes after the first render (e.g. route loads async).
  const effectiveCollapsedRef = useRef(HANDLE_HEIGHT);
  effectiveCollapsedRef.current = peekContent ? HANDLE_HEIGHT + PEEK_CONTENT_HEIGHT : HANDLE_HEIGHT;
  const sheetHeight = useRef(
    new Animated.Value(
      initiallyExpanded ? EXPANDED_HEIGHT - bottomInset : effectiveCollapsedRef.current,
    ),
  ).current;
  const detentRef = useRef<SheetDetent>(
    controlledDetent ?? (initiallyExpanded ? 'expanded' : 'collapsed'),
  );
  /** True while a finger is on the sheet — never move it out from under them. */
  const draggingRef = useRef(false);

  const heightFor = (target: SheetDetent): number => {
    if (target === 'collapsed') return effectiveCollapsedRef.current;
    if (target === 'mid' && enableMidDetent) return effectiveMid;
    return effectiveExpanded;
  };

  // The sheet now starts collapsed, so the collapsed height can change after
  // mount: the peek row only exists once the route has loaded. Re-snap the
  // animated height when peek content appears/disappears while collapsed,
  // otherwise the peek row would be clipped at the handle-only height.
  const hasPeekContent = Boolean(peekContent);
  useEffect(() => {
    if (detentRef.current !== 'collapsed') return;
    Animated.spring(sheetHeight, {
      toValue: hasPeekContent ? HANDLE_HEIGHT + PEEK_CONTENT_HEIGHT : HANDLE_HEIGHT,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
  }, [hasPeekContent, sheetHeight]);

  // One-shot drag-handle teaching pulse on first idle. Suppressed by reduced
  // motion. Doesn't replay on remount because handle visibility is the same
  // gating signal each time.
  const handleOpacity = useRef(new Animated.Value(1)).current;
  const hasPulsedRef = useRef(false);
  useEffect(() => {
    if (reducedMotion || hasPulsedRef.current) return;
    const start = setTimeout(() => {
      hasPulsedRef.current = true;
      Animated.sequence([
        Animated.timing(handleOpacity, { toValue: 0.5, duration: 350, useNativeDriver: true }),
        Animated.timing(handleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(handleOpacity, { toValue: 0.5, duration: 350, useNativeDriver: true }),
        Animated.timing(handleOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 800);
    return () => clearTimeout(start);
  }, [reducedMotion, handleOpacity]);

  const snapTo = (target: SheetDetent, notify = true) => {
    detentRef.current = target;
    setDetent(target);
    if (notify) onDetentChange?.(target);

    const toValue = heightFor(target);
    if (reducedMotion) {
      // Snap rather than travel. A sheet that repositions itself is motion the
      // rider did not initiate, which is exactly what reduced-motion is for.
      sheetHeight.setValue(toValue);
      return;
    }
    Animated.spring(sheetHeight, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
  };

  // Follow the controlled value. Skipped mid-drag so the sheet is never yanked
  // away from a finger that is already moving it.
  useEffect(() => {
    if (controlledDetent === undefined) return;
    if (draggingRef.current) return;
    if (controlledDetent === detentRef.current) return;
    snapTo(controlledDetent, false);
    // eslint-disable-next-line
  }, [controlledDetent]);

  /** Order the tap-through cycles, and the set a drag can land on. */
  const ladder: SheetDetent[] = enableMidDetent
    ? ['collapsed', 'mid', 'expanded']
    : ['collapsed', 'expanded'];

  const nearestDetent = (height: number): SheetDetent => {
    let best = ladder[0]!;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const candidate of ladder) {
      const gap = Math.abs(heightFor(candidate) - height);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    return best;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderGrant: () => {
        draggingRef.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        const startHeight = heightFor(detentRef.current);
        const newHeight = Math.max(
          effectiveCollapsedRef.current,
          Math.min(effectiveExpanded, startHeight - gesture.dy),
        );
        sheetHeight.setValue(newHeight);
      },
      onPanResponderRelease: (_, gesture) => {
        draggingRef.current = false;
        const startHeight = heightFor(detentRef.current);
        const released = startHeight - gesture.dy;

        // Below the threshold the drag was not a decision — go back.
        if (Math.abs(gesture.dy) <= SNAP_THRESHOLD) {
          snapTo(detentRef.current);
          return;
        }
        // Otherwise land on whichever detent the finger actually stopped
        // nearest. With three heights a fixed up/down rule would skip the
        // middle one entirely.
        snapTo(nearestDetent(released));
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        snapTo(detentRef.current);
      },
    }),
  ).current;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.bottomDock}
    >
      <Animated.View style={[styles.sheet, { maxHeight: sheetHeight, backgroundColor: sheetBg, borderColor }]}>
        <View {...panResponder.panHandlers}>
          <Pressable
            onPress={() => {
              // Tap steps up the ladder and wraps at the top, so every detent
              // is reachable without a drag — the gesture-alternative rule.
              const index = ladder.indexOf(detentRef.current);
              snapTo(ladder[(index + 1) % ladder.length]!);
            }}
            style={styles.handleTouchArea}
            // The sheet is otherwise driven by a PanResponder, which is
            // invisible to TalkBack/VoiceOver. This tap target is the only
            // accessible expand/collapse path, so label it (review 2026-06-12).
            accessibilityRole="button"
            accessibilityLabel={t('common.routeDetailsSheet')}
            accessibilityState={{ expanded }}
          >
            <Animated.View
              style={[styles.handle, { backgroundColor: handleColor, opacity: handleOpacity }]}
            />
          </Pressable>
          {/* Peek row — only visible when collapsed. Lives inside the pan-responder
              wrapper so swipes from the visible summary strip drive the sheet, not
              just the narrow handle. */}
          {peekContent && !expanded ? (
            <View style={styles.peekRow}>{peekContent}</View>
          ) : null}
        </View>
        {expanded ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {children}
          </ScrollView>
        ) : null}
      </Animated.View>
      {footer ? (
        <View style={[styles.fixedFooter, { paddingBottom: bottomInset + space[2], backgroundColor: sheetBg }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

export const MapStageScreen = ({
  map,
  topOverlay,
  rightOverlay,
  footer,
  children,
  useBottomSheet = false,
  initiallyExpanded = false,
  enableMidDetent = false,
  detent,
  onDetentChange,
  peekContent,
}: MapStageScreenProps) => {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();

  const sheetBg = mode === 'dark'
    ? 'rgba(11, 16, 32, 0.96)'
    : 'rgba(255, 255, 255, 0.96)';
  const handleColor = mode === 'dark'
    ? 'rgba(255, 255, 255, 0.18)'
    : 'rgba(0, 0, 0, 0.15)';

  return (
    <View style={[styles.root, { backgroundColor: colors.bgDeep }]}>
      <View style={StyleSheet.absoluteFill}>{map}</View>
      <View style={[styles.safeArea, { paddingTop: insets.top }]} pointerEvents="box-none">
        {topOverlay ? <View style={styles.topOverlay} pointerEvents="box-none">{topOverlay}</View> : null}
        {rightOverlay ? <View style={styles.rightOverlay}>{rightOverlay}</View> : null}
        <View style={styles.flexSpacer} pointerEvents="box-none" />

        {useBottomSheet ? (
          <CollapsibleSheet footer={footer} bottomInset={insets.bottom} peekContent={peekContent} sheetBg={sheetBg} handleColor={handleColor} borderColor={colors.borderDefault} initiallyExpanded={initiallyExpanded} enableMidDetent={enableMidDetent} detent={detent} onDetentChange={onDetentChange}>{children}</CollapsibleSheet>
        ) : footer ? (
          <View style={[styles.bottomFooter, { paddingBottom: space[2] }]} pointerEvents="box-none">
            {footer}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topOverlay: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    gap: space[3],
  },
  rightOverlay: {
    position: 'absolute',
    top: '50%',
    right: space[3],
    zIndex: zIndex.base,
    gap: space[2],
  },
  flexSpacer: {
    flex: 1,
  },
  bottomDock: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii['2xl'] + space[2],
    borderTopRightRadius: radii['2xl'] + space[2],
    borderWidth: 1,
    overflow: 'hidden',
  },
  handleTouchArea: {
    alignItems: 'center',
    paddingVertical: space[3],
  },
  peekRow: {
    height: PEEK_CONTENT_HEIGHT,
    paddingHorizontal: space[4] + space[0.5],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.12)',
    justifyContent: 'center',
  },
  handle: {
    width: 54,
    height: 6,
    borderRadius: radii.full,
  },
  content: {
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3],
    paddingBottom: space[4] + space[0.5],
    gap: space[4],
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3] + space[0.5],
    paddingBottom: space[4] + space[0.5],
    gap: space[2] + space[0.5],
  },
  fixedFooter: {
    paddingHorizontal: space[4] + space[0.5],
    paddingTop: space[3],
    gap: space[2] + space[0.5],
  },
  bottomFooter: {
    paddingHorizontal: space[4],
    gap: space[2],
  },
});
