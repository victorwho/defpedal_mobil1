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

  const createAnimationResult = () => ({
    start: (callback?: () => void) => callback?.(),
    stop: () => {},
  });

  const Animated = {
    View: View,
    Value: AnimatedValue,
    timing: (_value: AnimatedValue, _config: unknown) => createAnimationResult(),
    spring: (_value: AnimatedValue, _config: unknown) => createAnimationResult(),
    parallel: (animations: { start: (cb?: () => void) => void }[]) => ({
      start: (callback?: () => void) => {
        animations.forEach((a) => a.start());
        callback?.();
      },
      stop: () => {},
    }),
  };

  const ScrollView = React.forwardRef(
    (
      { children, style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
      ref,
    ) => React.createElement('div', { ref, 'data-testid': testID, role: 'scrollview', ...props }, children),
  );

  const ActivityIndicator = ({ accessibilityLabel, color, size, ...props }: { accessibilityLabel?: string; color?: string; size?: string | number }) =>
    React.createElement('span', { role: 'progressbar', 'aria-label': accessibilityLabel, ...props }, 'Loading');

  const AccessibilityInfo = {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => {} }),
  };

  const Dimensions = {
    get: () => ({ width: 375, height: 812 }),
  };

  return {
    StyleSheet,
    Pressable,
    View,
    Text,
    Animated,
    ScrollView,
    ActivityIndicator,
    AccessibilityInfo,
    Dimensions,
    NativeModules: {},
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
