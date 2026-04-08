// @vitest-environment happy-dom
/**
 * FadeSlideIn Atom — Unit Tests
 *
 * Tests rendering and prop handling.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

const { FadeSlideIn } = await import('../FadeSlideIn');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FadeSlideIn', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(
        <FadeSlideIn>
          <span data-testid="child">Animated child</span>
        </FadeSlideIn>,
      );
      expect(screen.getByTestId('child')).toBeTruthy();
    });

    it('renders multiple children', () => {
      render(
        <FadeSlideIn>
          <span data-testid="child-1">First</span>
          <span data-testid="child-2">Second</span>
        </FadeSlideIn>,
      );
      expect(screen.getByTestId('child-1')).toBeTruthy();
      expect(screen.getByTestId('child-2')).toBeTruthy();
    });
  });

  describe('props', () => {
    it('accepts delay prop', () => {
      render(
        <FadeSlideIn delay={200}>
          <span>Delayed</span>
        </FadeSlideIn>,
      );
      expect(screen.getByText('Delayed')).toBeTruthy();
    });

    it('accepts duration prop', () => {
      render(
        <FadeSlideIn duration={400}>
          <span>Custom duration</span>
        </FadeSlideIn>,
      );
      expect(screen.getByText('Custom duration')).toBeTruthy();
    });

    it('accepts translateY prop', () => {
      render(
        <FadeSlideIn translateY={20}>
          <span>Offset</span>
        </FadeSlideIn>,
      );
      expect(screen.getByText('Offset')).toBeTruthy();
    });

    it('accepts style prop', () => {
      render(
        <FadeSlideIn style={{ marginTop: 16 }}>
          <span>Styled</span>
        </FadeSlideIn>,
      );
      expect(screen.getByText('Styled')).toBeTruthy();
    });
  });

  describe('reduced motion', () => {
    it('renders immediately when reduced motion is enabled', async () => {
      // Re-mock for reduced motion
      vi.doMock('../../hooks/useReducedMotion', () => ({
        useReducedMotion: () => true,
      }));
      // Re-import to pick up mock
      const { FadeSlideIn: ReducedMotionFadeSlideIn } = await import('../FadeSlideIn');
      render(
        <ReducedMotionFadeSlideIn>
          <span>Instant</span>
        </ReducedMotionFadeSlideIn>,
      );
      expect(screen.getByText('Instant')).toBeTruthy();
    });
  });
});
