// @vitest-environment happy-dom
/**
 * IconButton Atom — Unit Tests
 *
 * Tests rendering, variants, sizes, disabled state, and callbacks.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { IconButtonProps } from '../IconButton';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      bgSecondary: '#374151',
    },
  }),
}));

const { IconButton } = await import('../IconButton');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IconButton', () => {
  const defaultProps: IconButtonProps = {
    icon: <span data-testid="icon">X</span>,
    onPress: vi.fn(),
    accessibilityLabel: 'Close',
  };

  describe('rendering', () => {
    it('renders the icon', () => {
      render(<IconButton {...defaultProps} />);
      expect(screen.getByTestId('icon')).toBeTruthy();
    });

    it('sets accessibility role to button', () => {
      render(<IconButton {...defaultProps} />);
      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('passes accessibilityLabel', () => {
      render(<IconButton {...defaultProps} />);
      expect(screen.getByLabelText('Close')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onPress when clicked', () => {
      const onPress = vi.fn();
      render(<IconButton {...defaultProps} onPress={onPress} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
      const onPress = vi.fn();
      render(<IconButton {...defaultProps} onPress={onPress} disabled />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('variants', () => {
    it('accepts all variant values', () => {
      const variants: IconButtonProps['variant'][] = ['default', 'accent', 'danger', 'secondary'];
      for (const variant of variants) {
        const { unmount } = render(
          <IconButton {...defaultProps} variant={variant} />,
        );
        expect(screen.getByRole('button')).toBeTruthy();
        unmount();
      }
    });
  });

  describe('sizes', () => {
    it('accepts sm and md sizes', () => {
      const sizes: IconButtonProps['size'][] = ['sm', 'md'];
      for (const size of sizes) {
        const { unmount } = render(
          <IconButton {...defaultProps} size={size} />,
        );
        expect(screen.getByRole('button')).toBeTruthy();
        unmount();
      }
    });
  });
});
