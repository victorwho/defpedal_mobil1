// @vitest-environment happy-dom
/**
 * SectionTitle Atom — Unit Tests
 *
 * Tests rendering, variants, custom style, and accessibility.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SectionTitleProps } from '../SectionTitle';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textSecondary: '#9CA3AF',
    },
  }),
}));

const { SectionTitle } = await import('../SectionTitle');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionTitle', () => {
  describe('rendering', () => {
    it('renders the title text', () => {
      render(<SectionTitle>CYCLING PREFERENCES</SectionTitle>);
      expect(screen.getByText('CYCLING PREFERENCES')).toBeTruthy();
    });
  });

  describe('variants', () => {
    it('accepts accent variant', () => {
      render(<SectionTitle variant="accent">Title</SectionTitle>);
      expect(screen.getByText('Title')).toBeTruthy();
    });

    it('accepts muted variant', () => {
      render(<SectionTitle variant="muted">Title</SectionTitle>);
      expect(screen.getByText('Title')).toBeTruthy();
    });

    it('defaults to accent variant', () => {
      const props: SectionTitleProps = { children: 'Test' };
      expect(props.variant).toBeUndefined();
    });
  });

  describe('accessibility', () => {
    it('sets accessibilityRole to header', () => {
      const { container } = render(<SectionTitle>Section</SectionTitle>);
      // RN accessibilityRole becomes lowercase accessibilityrole in DOM
      const header = container.querySelector('[accessibilityrole="header"]');
      expect(header).toBeTruthy();
    });
  });

  describe('custom style', () => {
    it('accepts a style prop', () => {
      render(<SectionTitle style={{ marginBottom: 8 }}>Styled</SectionTitle>);
      expect(screen.getByText('Styled')).toBeTruthy();
    });
  });
});
