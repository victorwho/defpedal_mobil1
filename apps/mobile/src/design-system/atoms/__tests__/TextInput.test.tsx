// @vitest-environment happy-dom
/**
 * TextInput Atom — Unit Tests
 *
 * Locks the one behaviour screens depend on beyond rendering: a `ref` passed
 * to the atom must reach the underlying native input. The auth and
 * reset-password forms use it to move focus on the keyboard's "next" key —
 * part of the iOS keyboard fix (2026-10-10), where the submit button sat
 * underneath the keyboard and could not be tapped.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      textMuted: '#8B9198',
      bgSecondary: '#374151',
      borderDefault: 'rgba(255,255,255,0.08)',
      danger: '#EF4444',
    },
  }),
}));

// Import after mocks
const { TextInput } = await import('../TextInput');

const noop = () => {};

describe('TextInput', () => {
  it('renders its label and the input', () => {
    render(<TextInput label="Email" placeholder="you@example.com" value="" onChangeText={noop} />);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
  });

  it('forwards a ref to the underlying input so a screen can focus it', () => {
    const ref = React.createRef<HTMLInputElement>();
    // The atom's ref type is the React Native input; in this DOM test
    // environment the stand-in is an <input>, hence the cast.
    render(
      <TextInput
        placeholder="password"
        value=""
        onChangeText={noop}
        ref={ref as unknown as React.ComponentProps<typeof TextInput>['ref']}
      />,
    );
    expect(ref.current).toBe(screen.getByPlaceholderText('password'));
  });

  it('still calls the screen-supplied focus and blur handlers', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    render(
      <TextInput
        placeholder="field"
        value=""
        onChangeText={noop}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    const input = screen.getByPlaceholderText('field');
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
