/**
 * Keeps one block of a ScrollView — typically a form's fields plus its submit
 * button — above the iOS keyboard.
 *
 * Why this exists: iOS never resizes the window for the keyboard (Android
 * does), so a form in the lower half of a screen ends up underneath it. A
 * rider reported on 2026-10-10 that the keyboard covered the Sign up button on
 * /auth and it could not be tapped at all.
 *
 * It is the second half of a two-part fix. Pair it with
 * `automaticallyAdjustKeyboardInsets` on the same ScrollView:
 *
 *   1. That native prop adds a bottom inset the height of the keyboard (so the
 *      content can be scrolled clear of it) and scrolls the FOCUSED FIELD into
 *      view. It knows nothing about the button underneath the field.
 *   2. This hook runs once the keyboard has finished opening and scrolls the
 *      least amount needed for the whole block — button included — to be
 *      visible. If the block cannot fit in the space above the keyboard it
 *      does nothing, leaving the native focused-field handling in charge.
 *
 * iOS only. Android keeps its existing behaviour untouched.
 *
 * Usage:
 *   const { scrollRef, targetRef, onScroll } = useRevealAboveKeyboard();
 *   <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets
 *               onScroll={onScroll} scrollEventThrottle={16}>
 *     <View ref={targetRef} collapsable={false}> fields + submit button </View>
 *   </ScrollView>
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type View,
} from 'react-native';

/** Breathing room kept between the block and the viewport edge / keyboard. */
export const REVEAL_MARGIN = 12;

export type RevealOffsetInput = {
  /** The ScrollView's current vertical scroll offset. */
  currentOffset: number;
  /** Top edge of the block, in scroll-content coordinates. */
  targetTop: number;
  /** Height of the block. */
  targetHeight: number;
  /** Height of the ScrollView still visible above the keyboard. */
  visibleHeight: number;
  margin?: number;
};

/**
 * The scroll offset that brings the block fully into the space above the
 * keyboard with the smallest movement, or `null` when nothing should move —
 * it is already fully visible, it cannot fit, or the numbers are unusable.
 */
export const computeRevealOffset = ({
  currentOffset,
  targetTop,
  targetHeight,
  visibleHeight,
  margin = REVEAL_MARGIN,
}: RevealOffsetInput): number | null => {
  if (
    ![currentOffset, targetTop, targetHeight, visibleHeight].every(Number.isFinite) ||
    targetHeight <= 0 ||
    visibleHeight <= 0
  ) {
    return null;
  }

  // Scroll any further than this and the block's top edge leaves the viewport.
  const maxOffset = targetTop - margin;
  // Scroll any less than this and its bottom edge is still behind the keyboard.
  const minOffset = targetTop + targetHeight + margin - visibleHeight;

  // Taller than the space above the keyboard (small phone in landscape):
  // leave it alone, so we never scroll the field being typed in out of view.
  if (minOffset > maxOffset) return null;

  let next: number;
  if (currentOffset < minOffset) next = minOffset;
  else if (currentOffset > maxOffset) next = maxOffset;
  else return null;

  next = Math.max(0, next);
  return Math.abs(next - currentOffset) < 1 ? null : next;
};

export const useRevealAboveKeyboard = () => {
  const scrollRef = useRef<ScrollView>(null);
  const targetRef = useRef<View>(null);
  const offsetRef = useRef(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    // `keyboardDidShow`, not `keyboardWillShow`: by then the native inset from
    // `automaticallyAdjustKeyboardInsets` is in place, so the extra scroll
    // range exists and this cannot race the native scroll-to-focused-field.
    const subscription = Keyboard.addListener('keyboardDidShow', (event: KeyboardEvent) => {
      const scroll = scrollRef.current;
      const target = targetRef.current;
      const keyboardTop = event?.endCoordinates?.screenY;
      const nativeScroll = scroll?.getNativeScrollRef?.() ?? null;
      if (!scroll || !target || !nativeScroll || typeof keyboardTop !== 'number') return;

      nativeScroll.measureInWindow((_x, scrollTop, _width, scrollHeight) => {
        const visibleHeight = keyboardTop - scrollTop;
        // Keyboard is not over this ScrollView (floating/undocked iPad keyboard).
        if (!(visibleHeight > 0) || visibleHeight >= scrollHeight) return;

        // Relative to the scroll view = scroll-content coordinates (the scroll
        // offset is not part of a relative layout measurement).
        target.measureLayout(
          nativeScroll,
          (_left, targetTop, _targetWidth, targetHeight) => {
            const next = computeRevealOffset({
              currentOffset: offsetRef.current,
              targetTop,
              targetHeight,
              visibleHeight,
            });
            if (next !== null) scroll.scrollTo({ y: next, animated: true });
          },
          () => undefined,
        );
      });
    });

    return () => subscription.remove();
  }, []);

  return { scrollRef, targetRef, onScroll };
};
