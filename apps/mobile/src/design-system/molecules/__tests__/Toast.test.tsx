// @vitest-environment happy-dom
/**
 * Toast Molecule — Unit Tests
 *
 * Tests rendering, variants, action/dismiss buttons, and auto-dismiss.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ToastProps } from '../Toast';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true, // reduced motion = instant animation
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}`, ...props }),
    ),
  };
});

const { Toast } = await import('../Toast');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders the message text', () => {
      render(<Toast message="Route saved" />);
      expect(screen.getByText('Route saved')).toBeTruthy();
    });

    it('sets accessibilityRole to alert', () => {
      const { container } = render(<Toast message="Alert" />);
      const alert = container.querySelector('[accessibilityrole="alert"]');
      expect(alert).toBeTruthy();
    });
  });

  describe('variants', () => {
    it('renders all toast variants', () => {
      const variants: ToastProps['variant'][] = ['info', 'success', 'warning', 'error'];
      for (const variant of variants) {
        const { unmount } = render(
          <Toast message="Test" variant={variant} />,
        );
        expect(screen.getByText('Test')).toBeTruthy();
        unmount();
      }
    });

    it('shows appropriate icon for each variant', () => {
      const variantIcons: Record<string, string> = {
        info: 'information-circle',
        success: 'checkmark-circle',
        warning: 'alert-circle',
        error: 'close-circle',
      };
      for (const [variant, iconName] of Object.entries(variantIcons)) {
        const { unmount } = render(
          <Toast message="Test" variant={variant as ToastProps['variant']} />,
        );
        expect(screen.getByTestId(`icon-${iconName}`)).toBeTruthy();
        unmount();
      }
    });
  });

  describe('dismiss button', () => {
    it('shows dismiss button when onDismiss is provided', () => {
      render(<Toast message="Dismissible" onDismiss={vi.fn()} />);
      expect(screen.getByLabelText('Dismiss')).toBeTruthy();
    });

    it('does not show dismiss button when onDismiss is not provided', () => {
      render(<Toast message="Non-dismissible" />);
      expect(screen.queryByLabelText('Dismiss')).toBeNull();
    });

    it('calls onDismiss when dismiss button is pressed', () => {
      const onDismiss = vi.fn();
      render(<Toast message="Dismiss me" onDismiss={onDismiss} />);
      fireEvent.click(screen.getByLabelText('Dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('action button', () => {
    it('shows action button when action and onAction are provided', () => {
      render(
        <Toast
          message="Error occurred"
          action="Retry"
          onAction={vi.fn()}
        />,
      );
      expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('calls onAction when action button is pressed', () => {
      const onAction = vi.fn();
      render(
        <Toast
          message="Error occurred"
          action="Retry"
          onAction={onAction}
        />,
      );
      fireEvent.click(screen.getByLabelText('Retry'));
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('does not show action button when only action is provided (no onAction)', () => {
      render(<Toast message="Test" action="Undo" />);
      // Without onAction, the action button should not render
      expect(screen.queryByText('Undo')).toBeNull();
    });
  });

  describe('auto-dismiss', () => {
    it('calls onDismiss after durationMs', () => {
      const onDismiss = vi.fn();
      render(
        <Toast message="Auto" durationMs={2000} onDismiss={onDismiss} />,
      );
      vi.advanceTimersByTime(2000);
      // With reduced motion, dismiss is called directly
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not auto-dismiss when durationMs is 0', () => {
      const onDismiss = vi.fn();
      render(
        <Toast message="Manual" durationMs={0} onDismiss={onDismiss} />,
      );
      vi.advanceTimersByTime(10000);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});
