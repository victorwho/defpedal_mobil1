// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react';
import { Keyboard } from 'react-native';
import { describe, expect, it } from 'vitest';

import { useKeyboardHeight } from './useKeyboardHeight';

// The RN mock reports Platform.OS === 'ios', so the hook subscribes to the
// `will*` pair. `emit`/`listenerCount` are test-only helpers on the mock.
const kb = Keyboard as unknown as {
  emit: (event: string, payload?: { endCoordinates?: { height: number } }) => void;
  listenerCount: (event: string) => number;
};

describe('useKeyboardHeight', () => {
  it('starts at zero', () => {
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current).toBe(0);
  });

  it('reports the keyboard height while it is open', () => {
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => {
      kb.emit('keyboardWillShow', { endCoordinates: { height: 291 } });
    });

    expect(result.current).toBe(291);
  });

  it('returns to zero when the keyboard closes', () => {
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => {
      kb.emit('keyboardWillShow', { endCoordinates: { height: 291 } });
    });
    act(() => {
      kb.emit('keyboardWillHide');
    });

    expect(result.current).toBe(0);
  });

  it('falls back to zero when the event carries no coordinates', () => {
    // Defensive: a malformed event must not produce NaN padding, which would
    // collapse the panel layout entirely.
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => {
      kb.emit('keyboardWillShow', {});
    });

    expect(result.current).toBe(0);
  });

  it('removes both listeners on unmount', () => {
    const before = kb.listenerCount('keyboardWillShow');
    const { unmount } = renderHook(() => useKeyboardHeight());

    expect(kb.listenerCount('keyboardWillShow')).toBe(before + 1);
    expect(kb.listenerCount('keyboardWillHide')).toBe(before + 1);

    unmount();

    expect(kb.listenerCount('keyboardWillShow')).toBe(before);
    expect(kb.listenerCount('keyboardWillHide')).toBe(before);
  });
});
