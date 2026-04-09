// @vitest-environment happy-dom
/**
 * AnimatedCounter Atom — Unit Tests
 *
 * Tests that the counter displays correct values with formatting,
 * verifying the reduced-motion path (synchronous final value).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — force reduced motion so counter renders final value synchronously
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

const { AnimatedCounter } = await import('../AnimatedCounter');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedCounter', () => {
  it('displays the final target value immediately with reduced motion', () => {
    render(<AnimatedCounter targetValue={3.7} decimals={1} />);
    expect(screen.getByText('3.7')).toBeTruthy();
  });

  it('formats value with prefix, suffix, and correct decimal places', () => {
    render(
      <AnimatedCounter
        targetValue={1.756}
        prefix="EUR "
        suffix=" saved"
        decimals={2}
      />,
    );
    expect(screen.getByText('EUR 1.76 saved')).toBeTruthy();
  });

  it('displays zero correctly when targetValue is 0', () => {
    render(<AnimatedCounter targetValue={0} decimals={2} suffix=" kg" />);
    expect(screen.getByText('0.00 kg')).toBeTruthy();
  });
});
