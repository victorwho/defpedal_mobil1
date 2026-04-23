// @vitest-environment happy-dom
/**
 * Badge Atom — Unit Tests
 *
 * Tests rendering, variants, sizes, mono prop, and accessibility.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BadgeProps } from '../Badge';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textInverse: '#111827',
      bgSecondary: '#374151',
    },
  }),
}));

const { Badge } = await import('../Badge');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Badge', () => {
  describe('rendering', () => {
    it('renders with string children', () => {
      render(<Badge>Safe</Badge>);
      expect(screen.getByText('Safe')).toBeTruthy();
    });

    it('renders with ReactNode children', () => {
      render(
        <Badge>
          <span data-testid="custom">42</span>
        </Badge>,
      );
      expect(screen.getByTestId('custom')).toBeTruthy();
    });

    it('wraps mixed text + expression children in a Text element', () => {
      // JSX like `<Badge>Route: {name}</Badge>` passes children as the array
      // `['Route: ', name]`. Without Text-wrapping this produced the runtime
      // error "Text strings must be rendered within a <Text> component." —
      // diagnostics.tsx hit this regression because several cards used the
      // mixed-content pattern. Assert the combined content is still
      // rendered (via Text) and that the a11y label flattens it.
      const name = 'granted';
      const { container } = render(
        <Badge variant="risk-safe">Route: {name}</Badge>,
      );
      expect(screen.getByText((t) => t.includes('Route: granted'))).toBeTruthy();
      const badge = container.querySelector(
        '[accessibilitylabel="Safe: Route: granted"]',
      );
      expect(badge).toBeTruthy();
    });

    it('wraps numeric children in a Text element', () => {
      // `<Badge>{42}</Badge>` — number child, not string.
      render(<Badge>{42}</Badge>);
      expect(screen.getByText('42')).toBeTruthy();
    });

    it('wraps array of mixed text + number children in a Text element', () => {
      // Worst case: `<Badge>Queue: {count}</Badge>` where count is a number.
      const { container } = render(<Badge>Queue: {5}</Badge>);
      expect(screen.getByText((t) => t.includes('Queue: 5'))).toBeTruthy();
      const badge = container.querySelector(
        '[accessibilitylabel="Queue: 5"]',
      );
      expect(badge).toBeTruthy();
    });
  });

  describe('variants', () => {
    it('accepts all badge variants', () => {
      const variants: BadgeProps['variant'][] = [
        'risk-safe',
        'risk-caution',
        'risk-danger',
        'info',
        'neutral',
        'accent',
      ];
      for (const variant of variants) {
        const { unmount } = render(<Badge variant={variant}>Label</Badge>);
        expect(screen.getByText('Label')).toBeTruthy();
        unmount();
      }
    });

    it('defaults to neutral variant', () => {
      const props: BadgeProps = { children: 'Test' };
      expect(props.variant).toBeUndefined();
    });
  });

  describe('sizes', () => {
    it('accepts sm and md sizes', () => {
      const sizes: BadgeProps['size'][] = ['sm', 'md'];
      for (const size of sizes) {
        const { unmount } = render(<Badge size={size}>Label</Badge>);
        expect(screen.getByText('Label')).toBeTruthy();
        unmount();
      }
    });
  });

  describe('mono prop', () => {
    it('accepts mono=true for numeric display', () => {
      render(<Badge mono>72</Badge>);
      expect(screen.getByText('72')).toBeTruthy();
    });
  });

  describe('icon slot', () => {
    it('renders optional icon', () => {
      render(
        <Badge icon={<span data-testid="badge-icon">!</span>}>
          Alert
        </Badge>,
      );
      expect(screen.getByTestId('badge-icon')).toBeTruthy();
      expect(screen.getByText('Alert')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('generates a11y label with variant prefix for risk-safe', () => {
      const { container } = render(<Badge variant="risk-safe">Low Risk</Badge>);
      const badge = container.querySelector('[accessibilitylabel="Safe: Low Risk"]');
      expect(badge).toBeTruthy();
    });

    it('generates a11y label with variant prefix for risk-danger', () => {
      const { container } = render(<Badge variant="risk-danger">High Risk</Badge>);
      const badge = container.querySelector('[accessibilitylabel="Danger: High Risk"]');
      expect(badge).toBeTruthy();
    });

    it('uses only text as a11y label for neutral variant', () => {
      const { container } = render(<Badge variant="neutral">Neutral</Badge>);
      const badge = container.querySelector('[accessibilitylabel="Neutral"]');
      expect(badge).toBeTruthy();
    });
  });
});
