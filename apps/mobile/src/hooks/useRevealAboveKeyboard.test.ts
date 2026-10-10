// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react';
import { Keyboard } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { computeRevealOffset, useRevealAboveKeyboard } from './useRevealAboveKeyboard';

// `emit`/`listenerCount` are test-only helpers on the RN mock, which reports
// Platform.OS === 'ios'.
const kb = Keyboard as unknown as {
  emit: (event: string, payload?: { endCoordinates?: { height: number; screenY?: number } }) => void;
  listenerCount: (event: string) => number;
};

describe('computeRevealOffset', () => {
  // The reported case, iPhone 14-class: 405pt left above the keyboard, the
  // email/password/Sign-up block is 232pt tall and starts 486pt down the content.
  const signUpBlock = { targetTop: 486, targetHeight: 232, visibleHeight: 405 };

  it('scrolls just far enough to lift the submit button clear of the keyboard', () => {
    // Block bottom (718) + margin (12) must sit at the 405pt visible edge.
    expect(computeRevealOffset({ ...signUpBlock, currentOffset: 157 })).toBe(325);
  });

  it('does nothing when the block is already fully visible', () => {
    expect(computeRevealOffset({ ...signUpBlock, currentOffset: 400 })).toBeNull();
  });

  it('scrolls back when the block has been pushed off the top', () => {
    // Anything past 474 hides the first field above the viewport.
    expect(computeRevealOffset({ ...signUpBlock, currentOffset: 560 })).toBe(474);
  });

  it('leaves the scroll position alone when the block cannot fit', () => {
    // Small phone in landscape: aligning either edge would hide the field
    // being typed in, so the native focused-field handling stays in charge.
    expect(
      computeRevealOffset({ targetTop: 486, targetHeight: 232, visibleHeight: 120, currentOffset: 0 }),
    ).toBeNull();
  });

  it('never returns a negative offset', () => {
    expect(
      computeRevealOffset({ targetTop: 20, targetHeight: 150, visibleHeight: 300, currentOffset: 30 }),
    ).toBe(8);
    expect(
      computeRevealOffset({ targetTop: 4, targetHeight: 100, visibleHeight: 300, currentOffset: 40 }),
    ).toBe(0);
  });

  it('ignores sub-pixel differences', () => {
    expect(computeRevealOffset({ ...signUpBlock, currentOffset: 324.6 })).toBeNull();
  });

  it('refuses unusable measurements instead of scrolling to NaN', () => {
    expect(computeRevealOffset({ ...signUpBlock, currentOffset: Number.NaN })).toBeNull();
    expect(computeRevealOffset({ ...signUpBlock, targetHeight: 0, currentOffset: 0 })).toBeNull();
    expect(computeRevealOffset({ ...signUpBlock, visibleHeight: 0, currentOffset: 0 })).toBeNull();
  });
});

describe('useRevealAboveKeyboard', () => {
  // Screen 844pt tall; the ScrollView starts under a 103pt header and runs to
  // the bottom of the screen.
  const mount = (block: { top: number; height: number } | null = { top: 486, height: 232 }) => {
    const scrollTo = vi.fn();
    const nativeScroll = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 103, 390, 741),
    };
    const hook = renderHook(() => useRevealAboveKeyboard());
    (hook.result.current.scrollRef as { current: unknown }).current = {
      getNativeScrollRef: () => nativeScroll,
      scrollTo,
    };
    (hook.result.current.targetRef as { current: unknown }).current = {
      measureLayout: (
        relativeTo: unknown,
        onSuccess: (left: number, top: number, w: number, h: number) => void,
        onFail: () => void,
      ) => {
        expect(relativeTo).toBe(nativeScroll);
        if (block) onSuccess(20, block.top, 350, block.height);
        else onFail();
      },
    };
    return { ...hook, scrollTo };
  };

  const scrollEvent = (y: number) =>
    ({ nativeEvent: { contentOffset: { x: 0, y } } }) as Parameters<
      ReturnType<typeof useRevealAboveKeyboard>['onScroll']
    >[0];

  it('scrolls the block above the keyboard once it has opened', () => {
    const { result, scrollTo, unmount } = mount();
    // Where the native focused-field scroll left it: email field flush with the keyboard.
    act(() => result.current.onScroll(scrollEvent(157)));

    // Keyboard top at 508 → 405pt of the ScrollView stay visible.
    act(() => kb.emit('keyboardDidShow', { endCoordinates: { height: 336, screenY: 508 } }));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 325, animated: true });
    unmount();
  });

  it('does not move when the block is already visible', () => {
    const { result, scrollTo, unmount } = mount();
    act(() => result.current.onScroll(scrollEvent(400)));
    act(() => kb.emit('keyboardDidShow', { endCoordinates: { height: 336, screenY: 508 } }));
    expect(scrollTo).not.toHaveBeenCalled();
    unmount();
  });

  it('does nothing when the keyboard does not overlap the scroll view', () => {
    const { scrollTo, unmount } = mount();
    // Keyboard top at/below the bottom of the ScrollView (103 + 741 = 844).
    act(() => kb.emit('keyboardDidShow', { endCoordinates: { height: 0, screenY: 844 } }));
    expect(scrollTo).not.toHaveBeenCalled();
    unmount();
  });

  it('survives a malformed event, a failed measurement and unattached refs', () => {
    const failing = mount(null);
    act(() => kb.emit('keyboardDidShow', {}));
    act(() => kb.emit('keyboardDidShow', { endCoordinates: { height: 336, screenY: 508 } }));
    expect(failing.scrollTo).not.toHaveBeenCalled();
    failing.unmount();

    const bare = renderHook(() => useRevealAboveKeyboard());
    expect(() =>
      act(() => kb.emit('keyboardDidShow', { endCoordinates: { height: 336, screenY: 508 } })),
    ).not.toThrow();
    bare.unmount();
  });

  it('removes its listener on unmount', () => {
    const before = kb.listenerCount('keyboardDidShow');
    const { unmount } = renderHook(() => useRevealAboveKeyboard());
    expect(kb.listenerCount('keyboardDidShow')).toBe(before + 1);
    unmount();
    expect(kb.listenerCount('keyboardDidShow')).toBe(before);
  });
});
