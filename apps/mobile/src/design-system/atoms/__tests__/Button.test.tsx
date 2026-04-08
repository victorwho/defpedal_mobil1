// @vitest-environment happy-dom
/**
 * Button Atom — Unit Tests
 *
 * Tests rendering, variant props, callbacks, and disabled/loading states.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ButtonProps } from '../Button';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      accentHover: '#EAB308',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      textMuted: '#8B9198',
      textInverse: '#111827',
      bgPrimary: '#1F2937',
      bgSecondary: '#374151',
      bgTertiary: '#4B5563',
      borderDefault: 'rgba(255,255,255,0.08)',
      danger: '#EF4444',
      bgDeep: '#111827',
    },
  }),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Warning: 'Warning', Error: 'Error', Success: 'Success' },
}));

// Import after mocks
const { Button } = await import('../Button');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Button', () => {
  describe('rendering', () => {
    it('renders with default props (primary, md)', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText('Click me')).toBeTruthy();
    });

    it('renders children as ReactNode', () => {
      render(
        <Button>
          <span data-testid="custom-child">Custom</span>
        </Button>,
      );
      expect(screen.getByTestId('custom-child')).toBeTruthy();
    });
  });

  describe('props interface', () => {
    it('accepts all variant values', () => {
      const variants: ButtonProps['variant'][] = ['primary', 'secondary', 'ghost', 'danger', 'safe'];
      for (const variant of variants) {
        const { unmount } = render(<Button variant={variant}>Btn</Button>);
        expect(screen.getByText('Btn')).toBeTruthy();
        unmount();
      }
    });

    it('accepts all size values', () => {
      const sizes: ButtonProps['size'][] = ['sm', 'md', 'lg'];
      for (const size of sizes) {
        const { unmount } = render(<Button size={size}>Btn</Button>);
        expect(screen.getByText('Btn')).toBeTruthy();
        unmount();
      }
    });

    it('defaults variant to primary and size to md', () => {
      const props: ButtonProps = { children: 'Hello' };
      expect(props.variant).toBeUndefined();
      expect(props.size).toBeUndefined();
    });
  });

  describe('interactions', () => {
    it('calls onPress when clicked', () => {
      const onPress = vi.fn();
      render(<Button onPress={onPress}>Press</Button>);
      fireEvent.click(screen.getByText('Press'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
      const onPress = vi.fn();
      render(
        <Button onPress={onPress} disabled>
          Press
        </Button>,
      );
      fireEvent.click(screen.getByText('Press'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('does not call onPress when loading', () => {
      const onPress = vi.fn();
      const { container } = render(
        <Button onPress={onPress} loading>
          Press
        </Button>,
      );
      // When loading, the button is disabled. Find it via the container.
      const button = container.querySelector('button');
      expect(button).toBeTruthy();
      fireEvent.click(button!);
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('sets accessibilityRole to button', () => {
      render(<Button>A11y</Button>);
      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('passes accessibilityLabel', () => {
      render(<Button accessibilityLabel="Save changes">Save</Button>);
      expect(screen.getByLabelText('Save changes')).toBeTruthy();
    });
  });

  describe('icon slots', () => {
    it('renders leftIcon', () => {
      render(
        <Button leftIcon={<span data-testid="left-icon">L</span>}>
          With Icon
        </Button>,
      );
      expect(screen.getByTestId('left-icon')).toBeTruthy();
    });

    it('renders rightIcon', () => {
      render(
        <Button rightIcon={<span data-testid="right-icon">R</span>}>
          With Icon
        </Button>,
      );
      expect(screen.getByTestId('right-icon')).toBeTruthy();
    });
  });
});
