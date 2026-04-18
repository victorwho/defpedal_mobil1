// @vitest-environment happy-dom
/**
 * ShareRouteButton Atom — Unit Tests
 *
 * Verifies both presentation variants (button / icon), onPress wiring,
 * disabled + loading states, and a11y label override.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — Button + IconButton transitively pull in useTheme/useHaptics
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

// Stub Ionicons — testID forwarded via passthrough for icon-visibility assertions.
vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: (props: { testID?: string }) =>
    React.createElement('span', {
      'data-testid': props.testID ?? 'ionicon',
    }),
}));

// Import after mocks
const { ShareRouteButton } = await import('../ShareRouteButton');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShareRouteButton', () => {
  describe('variant=button (default)', () => {
    it('renders the "Share" label by default', () => {
      render(<ShareRouteButton onPress={vi.fn()} />);
      expect(screen.getByText('Share')).toBeTruthy();
    });

    it('renders the share-social icon as leftIcon', () => {
      render(<ShareRouteButton onPress={vi.fn()} testID="sharebtn" />);
      expect(screen.getByTestId('sharebtn-icon')).toBeTruthy();
    });

    it('fires onPress when clicked', () => {
      const onPress = vi.fn();
      render(<ShareRouteButton onPress={onPress} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not fire onPress when disabled', () => {
      const onPress = vi.fn();
      render(<ShareRouteButton onPress={onPress} disabled />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('does not fire onPress when loading', () => {
      const onPress = vi.fn();
      const { container } = render(
        <ShareRouteButton onPress={onPress} loading />,
      );
      const btn = container.querySelector('button');
      expect(btn).toBeTruthy();
      fireEvent.click(btn!);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('defaults accessibilityLabel to "Share this route"', () => {
      render(<ShareRouteButton onPress={vi.fn()} />);
      expect(screen.getByLabelText('Share this route')).toBeTruthy();
    });

    it('overrides accessibilityLabel when provided', () => {
      render(
        <ShareRouteButton
          onPress={vi.fn()}
          accessibilityLabel="Share route with friends"
        />,
      );
      expect(screen.getByLabelText('Share route with friends')).toBeTruthy();
    });
  });

  describe('variant=icon', () => {
    it('renders only an icon (no "Share" text label)', () => {
      render(<ShareRouteButton variant="icon" onPress={vi.fn()} />);
      expect(screen.queryByText('Share')).toBeNull();
    });

    it('renders the share-social icon with the provided testID suffix', () => {
      render(
        <ShareRouteButton
          variant="icon"
          onPress={vi.fn()}
          testID="row-share"
        />,
      );
      expect(screen.getByTestId('row-share-icon')).toBeTruthy();
    });

    it('fires onPress when clicked', () => {
      const onPress = vi.fn();
      render(<ShareRouteButton variant="icon" onPress={onPress} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('respects disabled (no onPress fire)', () => {
      const onPress = vi.fn();
      render(<ShareRouteButton variant="icon" onPress={onPress} disabled />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('treats loading as disabled to prevent double-fire', () => {
      const onPress = vi.fn();
      render(<ShareRouteButton variant="icon" onPress={onPress} loading />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('uses the default a11y label when none provided', () => {
      render(<ShareRouteButton variant="icon" onPress={vi.fn()} />);
      expect(screen.getByLabelText('Share this route')).toBeTruthy();
    });
  });
});
