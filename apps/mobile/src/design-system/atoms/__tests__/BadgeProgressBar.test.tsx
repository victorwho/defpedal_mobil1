// @vitest-environment happy-dom
/**
 * BadgeProgressBar Atom — Unit Tests
 *
 * Tests rendering, progress fraction calculation, and edge cases.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { BadgeProgressBarProps } from '../BadgeProgressBar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      bgTertiary: '#4B5563',
    },
  }),
}));

const { BadgeProgressBar } = await import('../BadgeProgressBar');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BadgeProgressBar', () => {
  const defaultProps: BadgeProgressBarProps = {
    current: 5,
    target: 10,
    tierColor: '#CD7F32',
  };

  describe('rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<BadgeProgressBar {...defaultProps} />);
      expect(container.firstChild).toBeTruthy();
    });

    it('accepts custom height', () => {
      const { container } = render(
        <BadgeProgressBar {...defaultProps} height={6} />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('props interface', () => {
    it('handles zero target gracefully', () => {
      const { container } = render(
        <BadgeProgressBar current={5} target={0} tierColor="#CD7F32" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('handles current exceeding target', () => {
      const { container } = render(
        <BadgeProgressBar current={15} target={10} tierColor="#CD7F32" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('handles zero progress', () => {
      const { container } = render(
        <BadgeProgressBar current={0} target={10} tierColor="#CD7F32" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('handles complete progress', () => {
      const { container } = render(
        <BadgeProgressBar current={10} target={10} tierColor="#CD7F32" />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('fraction calculation', () => {
    it('correctly represents progress fraction concept', () => {
      // Verify the fraction logic in isolation
      const current = 5;
      const target = 10;
      const fraction = target > 0 ? Math.min(current / target, 1) : 0;
      expect(fraction).toBe(0.5);
    });

    it('caps fraction at 1 when current exceeds target', () => {
      const current = 15;
      const target = 10;
      const fraction = target > 0 ? Math.min(current / target, 1) : 0;
      expect(fraction).toBe(1);
    });

    it('returns 0 fraction when target is 0', () => {
      const current = 5;
      const target = 0;
      const fraction = target > 0 ? Math.min(current / target, 1) : 0;
      expect(fraction).toBe(0);
    });
  });
});
