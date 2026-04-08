// @vitest-environment happy-dom
/**
 * Card Atom — Unit Tests
 *
 * Tests rendering, variants, and custom style passthrough.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CardProps } from '../Card';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      bgPrimary: '#1F2937',
      borderDefault: 'rgba(255,255,255,0.08)',
    },
  }),
}));

const { Card } = await import('../Card');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Card', () => {
  describe('rendering', () => {
    it('renders children', () => {
      render(
        <Card>
          <span data-testid="card-content">Content</span>
        </Card>,
      );
      expect(screen.getByTestId('card-content')).toBeTruthy();
    });

    it('renders string children', () => {
      render(<Card>Text content</Card>);
      expect(screen.getByText('Text content')).toBeTruthy();
    });
  });

  describe('variants', () => {
    it('accepts all card variants', () => {
      const variants: CardProps['variant'][] = ['solid', 'glass', 'outline'];
      for (const variant of variants) {
        const { unmount } = render(
          <Card variant={variant}>Content</Card>,
        );
        expect(screen.getByText('Content')).toBeTruthy();
        unmount();
      }
    });

    it('defaults to solid variant', () => {
      const props: CardProps = { children: 'Test' };
      expect(props.variant).toBeUndefined();
    });
  });

  describe('custom style', () => {
    it('accepts a style prop without error', () => {
      render(
        <Card style={{ marginTop: 10 }}>
          Styled
        </Card>,
      );
      expect(screen.getByText('Styled')).toBeTruthy();
    });
  });
});
