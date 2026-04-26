// @vitest-environment happy-dom
/**
 * Toggle Atom — Unit Tests
 *
 * Tests rendering, accessibility, onChange callback, and disabled state.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ToggleProps } from '../Toggle';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    // Semantic tokens
    confirm: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    celebration: vi.fn(),
    destructiveConfirm: vi.fn(),
    snap: vi.fn(),
    fire: vi.fn(),
    // Legacy shortcuts
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textInverse: '#111827',
    },
  }),
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Warning: 'Warning', Error: 'Error', Success: 'Success' },
}));

const { Toggle } = await import('../Toggle');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Toggle', () => {
  const defaultProps: ToggleProps = {
    checked: false,
    onChange: vi.fn(),
    accessibilityLabel: 'Enable feature',
  };

  describe('rendering', () => {
    it('renders without crashing', () => {
      render(<Toggle {...defaultProps} />);
      expect(screen.getByRole('switch')).toBeTruthy();
    });

    it('sets accessibilityRole to switch', () => {
      render(<Toggle {...defaultProps} />);
      expect(screen.getByRole('switch')).toBeTruthy();
    });

    it('passes accessibilityLabel', () => {
      render(<Toggle {...defaultProps} />);
      expect(screen.getByLabelText('Enable feature')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onChange with true when toggling from unchecked', () => {
      const onChange = vi.fn();
      render(<Toggle {...defaultProps} onChange={onChange} />);
      fireEvent.click(screen.getByRole('switch'));
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('calls onChange with false when toggling from checked', () => {
      const onChange = vi.fn();
      render(<Toggle {...defaultProps} checked onChange={onChange} />);
      fireEvent.click(screen.getByRole('switch'));
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it('does not call onChange when disabled', () => {
      const onChange = vi.fn();
      render(<Toggle {...defaultProps} onChange={onChange} disabled />);
      fireEvent.click(screen.getByRole('switch'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('accessibility state', () => {
    it('reports checked=false when unchecked', () => {
      render(<Toggle {...defaultProps} checked={false} />);
      const toggle = screen.getByRole('switch');
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });

    it('reports checked=true when checked', () => {
      render(<Toggle {...defaultProps} checked />);
      const toggle = screen.getByRole('switch');
      expect(toggle.getAttribute('aria-checked')).toBe('true');
    });
  });
});
