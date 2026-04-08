/**
 * Vitest shim for react-native.
 *
 * The real react-native/index.js contains Flow syntax (`import typeof`)
 * that Vite/Rollup cannot parse. This file provides lightweight stubs
 * so Vite can resolve `react-native` imports without touching the real
 * entry. The full vi.mock overrides in vitest.setup.ts layer on top.
 */
import React from 'react';

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown) => style,
};

export const Pressable = React.forwardRef(
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
      style: _style,
      testID,
      ...props
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
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
        ...props,
      },
      typeof children === 'function' ? children({ pressed: false }) : children,
    ),
);

export const View = React.forwardRef(
  (
    { children, style: _style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
    ref,
  ) => React.createElement('div', { ref, 'data-testid': testID, ...props }, children),
);

export const Text = React.forwardRef(
  (
    { children, style: _style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
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
  interpolate({ inputRange: _ir, outputRange }: { inputRange: number[]; outputRange: (string | number)[] }) {
    const index = this._value >= 0.5 ? 1 : 0;
    return outputRange[index];
  }
}

const createAnimationResult = () => ({
  start: (callback?: () => void) => callback?.(),
  stop: () => {},
});

export const Animated = {
  View,
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

export const ScrollView = React.forwardRef(
  (
    { children, style: _style, testID, ...props }: { children?: React.ReactNode; style?: unknown; testID?: string },
    ref,
  ) => React.createElement('div', { ref, 'data-testid': testID, role: 'scrollview', ...props }, children),
);

export const ActivityIndicator = ({
  accessibilityLabel,
  ...props
}: {
  accessibilityLabel?: string;
  color?: string;
  size?: string | number;
}) => React.createElement('span', { role: 'progressbar', 'aria-label': accessibilityLabel, ...props }, 'Loading');

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: () => ({ remove: () => {} }),
};

export const Dimensions = {
  get: () => ({ width: 375, height: 812 }),
};

export const NativeModules = {};
export const Platform = { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default };
export const Easing = {
  bezier: () => (t: number) => t,
  linear: (t: number) => t,
  ease: (t: number) => t,
  in: (t: number) => t,
  out: (t: number) => t,
  inOut: (t: number) => t,
};

// ViewStyle / TextStyle type exports (runtime no-ops)
export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
