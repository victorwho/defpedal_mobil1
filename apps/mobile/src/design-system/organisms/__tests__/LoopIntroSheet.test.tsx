// @vitest-environment happy-dom
//
// The Loop feature intro: explains loops to someone who has never used them,
// with a close X and a "Try it" that takes them to the planner.
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

// The mascot resolves a PNG asset and reads the store; neither is under test.
vi.mock('../../atoms/Mascot', () => ({ Mascot: () => null }));

import { LoopIntroSheet } from '../LoopIntroSheet';

const base = { visible: true, onClose: vi.fn(), onTry: vi.fn() };

describe('LoopIntroSheet', () => {
  it('explains what a loop is', () => {
    render(<LoopIntroSheet {...base} />);
    expect(screen.getByText('Ride a loop')).toBeTruthy();
    expect(screen.getByText(/brings you back to where you started/)).toBeTruthy();
  });

  it('closes from the X', () => {
    const onClose = vi.fn();
    render(<LoopIntroSheet {...base} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the rider taps outside the card', () => {
    const onClose = vi.fn();
    render(<LoopIntroSheet {...base} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('loop-intro-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Android back (the modal request to close)', () => {
    const onClose = vi.fn();
    render(<LoopIntroSheet {...base} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports Try it', () => {
    const onTry = vi.fn();
    render(<LoopIntroSheet {...base} onTry={onTry} />);
    fireEvent.click(screen.getByText('Try it'));
    expect(onTry).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when not visible', () => {
    render(<LoopIntroSheet {...base} visible={false} />);
    expect(screen.queryByText('Try it')).toBeNull();
  });
});
