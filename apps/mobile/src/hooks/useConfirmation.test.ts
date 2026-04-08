// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useT to return identity function
vi.mock('./useTranslation', () => ({
  useT: () => (key: string) => key,
}));

import { useConfirmation } from './useConfirmation';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('useConfirmation', () => {
  it('calls Alert.alert with title, message, and two buttons', () => {
    const { result } = renderHook(() => useConfirmation());
    const onConfirm = vi.fn();

    act(() => {
      result.current({
        title: 'Delete?',
        message: 'This cannot be undone.',
        onConfirm,
      });
    });

    expect(Alert.alert).toHaveBeenCalledOnce();
    const [title, message, buttons] = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(title).toBe('Delete?');
    expect(message).toBe('This cannot be undone.');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');
  });

  it('uses common.cancel as default cancel label via useT', () => {
    const { result } = renderHook(() => useConfirmation());

    act(() => {
      result.current({
        title: 'Sign Out',
        message: 'Sure?',
        onConfirm: vi.fn(),
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(buttons[0].text).toBe('common.cancel');
  });

  it('uses title as default confirm label when confirmLabel omitted', () => {
    const { result } = renderHook(() => useConfirmation());

    act(() => {
      result.current({
        title: 'End ride?',
        message: 'Progress saved.',
        onConfirm: vi.fn(),
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(buttons[1].text).toBe('End ride?');
  });

  it('uses custom confirmLabel and cancelLabel when provided', () => {
    const { result } = renderHook(() => useConfirmation());

    act(() => {
      result.current({
        title: 'Delete route?',
        message: 'Gone forever.',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        onConfirm: vi.fn(),
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(buttons[0].text).toBe('Keep');
    expect(buttons[1].text).toBe('Delete');
  });

  it('calls onConfirm when confirm button pressed', () => {
    const { result } = renderHook(() => useConfirmation());
    const onConfirm = vi.fn();

    act(() => {
      result.current({
        title: 'End ride?',
        message: 'Sure?',
        onConfirm,
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    buttons[1].onPress();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel button pressed', () => {
    const { result } = renderHook(() => useConfirmation());
    const onCancel = vi.fn();

    act(() => {
      result.current({
        title: 'Sign Out',
        message: 'Sure?',
        onConfirm: vi.fn(),
        onCancel,
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    buttons[0].onPress();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not crash when onCancel is undefined and cancel pressed', () => {
    const { result } = renderHook(() => useConfirmation());

    act(() => {
      result.current({
        title: 'Test',
        message: 'Test',
        onConfirm: vi.fn(),
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(() => buttons[0].onPress?.()).not.toThrow();
  });

  it('supports confirmStyle default as non-destructive', () => {
    const { result } = renderHook(() => useConfirmation());

    act(() => {
      result.current({
        title: 'Proceed?',
        message: 'Continue with action.',
        confirmStyle: 'default',
        onConfirm: vi.fn(),
      });
    });

    const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(buttons[1].style).toBe('default');
  });
});
