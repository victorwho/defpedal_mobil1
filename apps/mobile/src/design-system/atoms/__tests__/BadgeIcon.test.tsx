// @vitest-environment happy-dom
/**
 * BadgeIcon Atom — Unit Tests
 *
 * Tests rendering for various tier/size/progress combinations.
 * BadgeIcon uses react-native-svg which needs mocking.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { BadgeIconProps } from '../BadgeIcon';

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
  getBadgeIcon: (badgeKey: string) => {
    if (badgeKey === 'unknown_key') return null;
    return {
      paths: ['M12 2L2 7l10 5 10-5-10-5z'],
      fills: [],
    };
  },
}));

const { BadgeIcon } = await import('../BadgeIcon');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BadgeIcon', () => {
  describe('rendering', () => {
    it('renders earned bronze badge without crashing', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="bronze" size="md" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders locked badge', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="locked" size="md" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders secret badge', () => {
      const { container } = render(
        <BadgeIcon badgeKey="unknown_key" tier="secret" size="md" />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('sizes', () => {
    it('renders sm size', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="gold" size="sm" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders md size', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="gold" size="md" />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders lg size', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="gold" size="lg" />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('tiers', () => {
    it('renders all tier variants', () => {
      const tiers: BadgeIconProps['tier'][] = [
        'bronze', 'silver', 'gold', 'platinum', 'diamond', 'locked', 'secret',
      ];
      for (const tier of tiers) {
        const { container, unmount } = render(
          <BadgeIcon badgeKey="first_ride" tier={tier} size="md" />,
        );
        expect(container.firstChild).toBeTruthy();
        unmount();
      }
    });
  });

  describe('progress state', () => {
    it('renders in-progress badge', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="bronze" size="md" progress={0.5} />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders zero progress', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="bronze" size="md" progress={0} />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe('optional props', () => {
    it('renders with isNew dot', () => {
      const { container } = render(
        <BadgeIcon badgeKey="first_ride" tier="gold" size="md" isNew />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('renders with hasHigherTier chevron', () => {
      const { container } = render(
        <BadgeIcon
          badgeKey="first_ride"
          tier="bronze"
          size="md"
          hasHigherTier
        />,
      );
      expect(container.firstChild).toBeTruthy();
    });

    it('accepts tierFamily prop', () => {
      const { container } = render(
        <BadgeIcon
          badgeKey="distance_1"
          tierFamily="distance"
          tier="silver"
          size="md"
        />,
      );
      expect(container.firstChild).toBeTruthy();
    });
  });
});
