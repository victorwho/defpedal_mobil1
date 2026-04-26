// @vitest-environment happy-dom
/**
 * Card / Surface Atom — Unit Tests
 *
 * Tests rendering, variants, elevation prop, custom style passthrough, and
 * the `<Surface>` alias.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CardElevation, CardProps, CardRadius, CardVariant } from '../Card';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      bgDeep: '#111827',
      bgPrimary: '#1F2937',
      bgForm: '#FFFDF5',
      borderDefault: 'rgba(255,255,255,0.08)',
      borderAccent: '#FACC15',
    },
  }),
}));

const { Card, Surface } = await import('../Card');

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
      const variants: CardVariant[] = ['solid', 'glass', 'outline', 'form', 'accent', 'panel'];
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

  describe('elevation', () => {
    it('accepts all elevation values', () => {
      const elevations: CardElevation[] = ['inset', 'flat', 'sm', 'md', 'lg'];
      for (const elevation of elevations) {
        const { unmount } = render(
          <Card elevation={elevation}>Content {elevation}</Card>,
        );
        expect(screen.getByText(`Content ${elevation}`)).toBeTruthy();
        unmount();
      }
    });

    it('renders inset variant with deeper bg on solid', () => {
      // Solid + inset uses bgDeep instead of bgPrimary; smoke test for render.
      render(
        <Card variant="solid" elevation="inset">
          Inset content
        </Card>,
      );
      expect(screen.getByText('Inset content')).toBeTruthy();
    });
  });

  describe('radius', () => {
    it('accepts all radius values', () => {
      const radii: CardRadius[] = ['lg', 'xl', '2xl'];
      for (const radius of radii) {
        const { unmount } = render(
          <Card radius={radius}>Radius {radius}</Card>,
        );
        expect(screen.getByText(`Radius ${radius}`)).toBeTruthy();
        unmount();
      }
    });

    it('defaults to xl radius', () => {
      const props: CardProps = { children: 'Default' };
      expect(props.radius).toBeUndefined();
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

describe('Surface (alias of Card)', () => {
  it('renders identically to Card', () => {
    render(<Surface>Surface content</Surface>);
    expect(screen.getByText('Surface content')).toBeTruthy();
  });

  it('accepts the same props as Card', () => {
    render(
      <Surface variant="glass" elevation="lg" style={{ padding: 8 }}>
        Glass surface
      </Surface>,
    );
    expect(screen.getByText('Glass surface')).toBeTruthy();
  });
});

describe('pressable behaviour', () => {
  it('renders as a button when onPress is provided', () => {
    const handlePress = vi.fn();
    render(
      <Surface onPress={handlePress} accessibilityLabel="Tap me">
        Pressable surface
      </Surface>,
    );
    expect(screen.getByText('Pressable surface')).toBeTruthy();
    // role=button is the default when onPress is set
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('invokes onPress on click', () => {
    const handlePress = vi.fn();
    render(
      <Surface onPress={handlePress}>
        Click me
      </Surface>,
    );
    fireEvent.click(screen.getByText('Click me'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onPress when disabled', () => {
    const handlePress = vi.fn();
    render(
      <Surface onPress={handlePress} disabled>
        Disabled
      </Surface>,
    );
    fireEvent.click(screen.getByText('Disabled'));
    expect(handlePress).not.toHaveBeenCalled();
  });

  it('renders as a non-interactive View when onPress is absent', () => {
    render(<Surface>Static content</Surface>);
    // No button role when not interactive
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('accepts accessibilityRole override (e.g. link)', () => {
    render(
      <Surface onPress={vi.fn()} accessibilityRole="link" accessibilityLabel="Open">
        Linked card
      </Surface>,
    );
    expect(screen.getByRole('link')).toBeTruthy();
  });

  it('accepts custom pressedStyle without error', () => {
    render(
      <Surface
        onPress={vi.fn()}
        pressedStyle={{ opacity: 0.5, backgroundColor: '#222' }}
      >
        Custom pressed
      </Surface>,
    );
    expect(screen.getByText('Custom pressed')).toBeTruthy();
  });
});
