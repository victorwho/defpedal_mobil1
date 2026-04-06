/**
 * Vitest setup for React Native testing
 *
 * Mocks React Native modules that don't work in jsdom environment.
 */
import { vi } from 'vitest';

// Mock react-native
vi.mock('react-native', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    flatten: (style: unknown) => style,
  };

  const Pressable = React.forwardRef(
    (
      {
        children,
        onPress,
        onPressIn,
        onPressOut,
        disabled,
        accessibilityRole,
        accessibilityState,
        accessibilityLabel,
        style,
        testID,
        ...props
      }: {
        children?: React.ReactNode;
        onPress?: () => void;
        onPressIn?: () => void;
        onPressOut?: () => void;
        disabled?: boolean;
        accessibilityRole?: string;
        accessibilityState?: { checked?: boolean; disabled?: boolean };
        accessibilityLabel?: string;
        style?: unknown;
        testID?: string;
      },
      ref,
    ) =>
      React.createElement(
        'button',
        {
          ref,
          onClick: disabled ? undefined : onPress,
          onMouseDown: disabled ? undefined : onPressIn,
          onMouseUp: disabled ? undefined : onPressOut,
          disabled,
          role: accessibilityRole,
          'aria-checked': accessibilityState?.checked,
          'aria-disabled': accessibilityState?.disabled,
          'aria-label': accessibilityLabel,
          'data-testid': testID,
          accessibilityRole,
          accessibilityState,
          accessibilityLabel,
          ...props,
        },
        typeof children === 'function'
          ? children({ pressed: false })
          : children,
      ),
  );

  const View = React.forwardRef(
    (
      { children, style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
      ref,
    ) => React.createElement('div', { ref, 'data-testid': testID, ...props }, children),
  );

  const Text = React.forwardRef(
    (
      { children, style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
      ref,
    ) => React.createElement('span', { ref, 'data-testid': testID, ...props }, children),
  );

  class AnimatedValue {
    private _value: number;
    constructor(value: number) {
      this._value = value;
    }
    setValue(value: number) {
      this._value = value;
    }
    interpolate({ inputRange, outputRange }: { inputRange: number[]; outputRange: (string | number)[] }) {
      const index = this._value >= 0.5 ? 1 : 0;
      return outputRange[index];
    }
  }

  const Animated = {
    View: View,
    Value: AnimatedValue,
    timing: (_value: AnimatedValue, _config: unknown) => ({
      start: (callback?: () => void) => callback?.(),
    }),
    spring: (_value: AnimatedValue, _config: unknown) => ({
      start: (callback?: () => void) => callback?.(),
    }),
  };

  return {
    StyleSheet,
    Pressable,
    View,
    Text,
    Animated,
    Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    Easing: {
      bezier: () => (t: number) => t,
      linear: (t: number) => t,
      ease: (t: number) => t,
      in: (t: number) => t,
      out: (t: number) => t,
      inOut: (t: number) => t,
    },
  };
});

// Mock react-native-safe-area-context
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
