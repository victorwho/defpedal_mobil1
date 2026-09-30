// @vitest-environment happy-dom
//
// The "your mode is now part of Plus" notice. It must name the mode(s) the
// rider actually lost, and give declining the same weight as buying.
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

import { PlusModesMovedNotice } from '../PlusModesMovedNotice';

const base = { visible: true, onSeePlus: vi.fn(), onDismiss: vi.fn() };

describe('PlusModesMovedNotice', () => {
  it('names E-bike alone', () => {
    render(<PlusModesMovedNotice {...base} modes={['ebike']} />);
    expect(screen.getByText('E-bike mode is now part of Pedal Plus')).toBeTruthy();
  });

  it('names Cool alone', () => {
    render(<PlusModesMovedNotice {...base} modes={['cool']} />);
    expect(screen.getByText('Cool mode is now part of Pedal Plus')).toBeTruthy();
  });

  it('names both when both were used', () => {
    render(<PlusModesMovedNotice {...base} modes={['ebike', 'cool']} />);
    expect(screen.getByText('E-bike and Cool are now part of Pedal Plus')).toBeTruthy();
  });

  it('tells the rider where their routes went, and that Safe stays free', () => {
    render(<PlusModesMovedNotice {...base} modes={['ebike']} />);
    expect(screen.getByText(/back on Safe, which stays free/)).toBeTruthy();
  });

  it('offers both answers', () => {
    const onSeePlus = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PlusModesMovedNotice
        visible
        modes={['ebike']}
        onSeePlus={onSeePlus}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('See Pedal Plus'));
    fireEvent.click(screen.getByText('Keep riding Safe'));
    expect(onSeePlus).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
