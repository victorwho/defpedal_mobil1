// @vitest-environment happy-dom
/**
 * BadgeInlineChip Atom — Unit Tests
 *
 * Tests rendering, press behavior, and prop passthrough.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BadgeInlineChipProps } from '../BadgeInlineChip';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: { accent: '#FACC15' },
  }),
}));

vi.mock('react-native-svg', () => {
  const React = require('react');
  const createSvgComponent = (name: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement(name.toLowerCase(), { ref, ...props }, props.children),
    );
  return {
    __esModule: true,
    default: createSvgComponent('svg'),
    Svg: createSvgComponent('svg'),
    Path: createSvgComponent('path'),
    Circle: createSvgComponent('circle'),
    Defs: createSvgComponent('defs'),
    LinearGradient: createSvgComponent('lineargradient'),
    Stop: createSvgComponent('stop'),
  };
});

vi.mock('../../tokens/badgeIcons', () => ({
  getBadgeIcon: () => ({
    paths: ['M12 2L2 7l10 5 10-5-10-5z'],
    fills: [],
  }),
}));

const { BadgeInlineChip } = await import('../BadgeInlineChip');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BadgeInlineChip', () => {
  const defaultProps: BadgeInlineChipProps = {
    badgeKey: 'first_ride',
    tier: 'bronze',
    name: 'First Ride',
  };

  describe('rendering', () => {
    it('renders badge name', () => {
      render(<BadgeInlineChip {...defaultProps} />);
      expect(screen.getByText('First Ride')).toBeTruthy();
    });

    it('renders without onPress (non-interactive)', () => {
      const { container } = render(<BadgeInlineChip {...defaultProps} />);
      expect(container.firstChild).toBeTruthy();
      // No button role when non-interactive
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('interactions', () => {
    it('renders as pressable when onPress provided', () => {
      const onPress = vi.fn();
      render(<BadgeInlineChip {...defaultProps} onPress={onPress} />);
      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('calls onPress when clicked', () => {
      const onPress = vi.fn();
      render(<BadgeInlineChip {...defaultProps} onPress={onPress} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('sets accessibility label when interactive', () => {
      const onPress = vi.fn();
      render(<BadgeInlineChip {...defaultProps} onPress={onPress} />);
      expect(screen.getByLabelText('First Ride badge')).toBeTruthy();
    });
  });

  describe('tiers', () => {
    it('renders with all tier values', () => {
      const tiers: BadgeInlineChipProps['tier'][] = [
        'bronze', 'silver', 'gold', 'platinum', 'diamond',
      ];
      for (const tier of tiers) {
        const { unmount } = render(
          <BadgeInlineChip {...defaultProps} tier={tier} />,
        );
        expect(screen.getByText('First Ride')).toBeTruthy();
        unmount();
      }
    });
  });
});
