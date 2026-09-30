// @vitest-environment happy-dom
//
// A locked Plus mode stays on screen (docs/plans/pedal-plus-nudges.md N1) but
// can never read as the mode in use — even if a caller passes isActive.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@expo/vector-icons/Ionicons', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      R.createElement('span', { 'data-icon': String(props.name) }),
  };
});

vi.mock('@expo/vector-icons', () => {
  const R = require('react');
  const Icon = ({ name }: { name: string }) => R.createElement('span', { 'data-icon': name });
  return { Ionicons: Icon, MaterialIcons: Icon, Feather: Icon };
});

// The component reads `useTheme` through the design-system barrel, which
// imports native modules (expo-location) that do not exist under vitest.
vi.mock('../../design-system', () => ({
  useTheme: () => ({ colors: {}, mode: 'dark' }),
}));

import { ModeTogglePill, resolvePillActive } from '../ModeTogglePill';

const base = {
  iconName: 'battery-charging-outline' as const,
  label: 'E-bike',
  activeBgColor: '#000',
  activeFgColor: '#fff',
  accessibilityLabel: 'E-bike',
};

describe('ModeTogglePill — locked', () => {
  it('carries a PLUS tag when locked', () => {
    render(<ModeTogglePill {...base} isActive={false} locked onPress={vi.fn()} />);
    expect(screen.getByText('PLUS')).toBeTruthy();
  });

  it('carries no tag when unlocked', () => {
    render(<ModeTogglePill {...base} isActive={false} onPress={vi.fn()} />);
    expect(screen.queryByText('PLUS')).toBeNull();
  });

  it('is never active while locked, whatever the caller passes', () => {
    // Drives the fill colour AND accessibilityState.selected. Tested as a
    // function because the RN test renderer does not emit accessibilityState.
    expect(resolvePillActive(true, true)).toBe(false);
    expect(resolvePillActive(true, false)).toBe(true);
    expect(resolvePillActive(false, false)).toBe(false);
  });

  it('still reports taps, so the caller can open the paywall', () => {
    const onPress = vi.fn();
    render(<ModeTogglePill {...base} isActive={false} locked onPress={onPress} />);
    fireEvent.click(screen.getByText('E-bike'));
    expect(onPress).toHaveBeenCalled();
  });
});
