// @vitest-environment happy-dom
/**
 * BadgeCard Molecule — Unit Tests
 *
 * Tests rendering for earned, locked, in-progress, and secret states.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BadgeCardProps } from '../BadgeCard';

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

const { BadgeCard } = await import('../BadgeCard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createBadgeDef = (overrides: Record<string, unknown> = {}) => ({
  badgeKey: 'first_ride',
  category: 'firsts' as const,
  displayTab: 'firsts' as const,
  name: 'First Ride',
  flavorText: 'Every journey begins with a single pedal stroke.',
  criteriaText: 'Complete your first ride',
  criteriaUnit: null,
  tier: 1,
  tierFamily: null,
  isHidden: false,
  isSeasonal: false,
  sortOrder: 1,
  iconKey: 'first_ride',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BadgeCard', () => {
  describe('earned state', () => {
    it('renders badge name and "Earned" text', () => {
      render(
        <BadgeCard
          badge={createBadgeDef()}
          earned
          earnedTier="bronze"
          onPress={vi.fn()}
        />,
      );
      expect(screen.getByText('First Ride')).toBeTruthy();
      expect(screen.getByText('Earned')).toBeTruthy();
    });

    it('calls onPress when pressed', () => {
      const onPress = vi.fn();
      render(
        <BadgeCard
          badge={createBadgeDef()}
          earned
          earnedTier="gold"
          onPress={onPress}
        />,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('locked state', () => {
    it('renders badge name and criteria text', () => {
      render(
        <BadgeCard
          badge={createBadgeDef()}
          earned={false}
          onPress={vi.fn()}
        />,
      );
      expect(screen.getByText('First Ride')).toBeTruthy();
      expect(screen.getByText('Complete your first ride')).toBeTruthy();
    });
  });

  describe('in-progress state', () => {
    it('renders progress as current/target', () => {
      render(
        <BadgeCard
          badge={createBadgeDef()}
          earned={false}
          progress={{ badgeKey: 'first_ride', current: 3, target: 10, progress: 0.3 }}
          onPress={vi.fn()}
        />,
      );
      expect(screen.getByText('3/10')).toBeTruthy();
    });
  });

  describe('secret state', () => {
    it('renders ??? for hidden unearned badges', () => {
      render(
        <BadgeCard
          badge={createBadgeDef({ isHidden: true })}
          earned={false}
          onPress={vi.fn()}
        />,
      );
      // Both name and criteria should be ???
      const questionMarks = screen.getAllByText('???');
      expect(questionMarks.length).toBe(2);
    });
  });

  describe('accessibility', () => {
    it('sets appropriate label for earned badge', () => {
      render(
        <BadgeCard
          badge={createBadgeDef()}
          earned
          earnedTier="silver"
          onPress={vi.fn()}
        />,
      );
      expect(
        screen.getByLabelText('First Ride, silver tier, earned'),
      ).toBeTruthy();
    });

    it('sets appropriate label for secret badge', () => {
      render(
        <BadgeCard
          badge={createBadgeDef({ isHidden: true })}
          earned={false}
          onPress={vi.fn()}
        />,
      );
      expect(
        screen.getByLabelText('Hidden badge. Tap for a hint.'),
      ).toBeTruthy();
    });
  });
});
