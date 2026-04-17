// @vitest-environment happy-dom
/**
 * BadgeShareCard Component — Unit Tests
 *
 * Tests dual-variant rendering (preview / capture), ref forwarding,
 * tier label + rarity display, and the exported getBadgeShareText helper.
 */
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../design-system/tokens/colors', () => ({
  brandColors: {
    accent: '#FACC15',
    textInverse: '#111827',
    borderAccent: '#FACC15',
  },
  darkTheme: {
    bgDeep: '#111827',
    textPrimary: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#8B9198',
    borderDefault: 'rgba(255,255,255,0.08)',
  },
}));

vi.mock('../../design-system/tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36],
}));

vi.mock('../../design-system/tokens/radii', () => ({
  radii: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
}));

vi.mock('../../design-system/tokens/typography', () => ({
  fontFamily: {
    heading: { bold: 'System', semiBold: 'System', extraBold: 'System' },
    body: { regular: 'System', medium: 'System', semiBold: 'System' },
    mono: { bold: 'System', medium: 'System', semiBold: 'System' },
  },
  text2xl: { fontSize: 24 },
  textBase: { fontSize: 16 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
}));

vi.mock('../../design-system/tokens/badgeColors', () => ({
  tierColors: {
    bronze: { primary: '#CD7F32' },
    silver: { primary: '#A8B4C0' },
    gold: { primary: '#F2C30F' },
    platinum: { primary: '#A8C4E0' },
    diamond: { primary: '#B0E0FF' },
  },
  getRarity: (percent: number) => {
    if (percent <= 1) return { level: 'legendary', color: '#FACC15' };
    if (percent <= 5) return { level: 'epic', color: '#F59E0B' };
    if (percent <= 20) return { level: 'rare', color: '#A78BFA' };
    return { level: 'common', color: '#6B7280' };
  },
}));

vi.mock('../../design-system/atoms/BadgeIcon', () => ({
  BadgeIcon: ({ badgeKey, tier, size }: { badgeKey: string; tier: string; size: string }) =>
    React.createElement(
      'span',
      { 'data-testid': `badge-icon-${badgeKey}-${tier}-${size}` },
      `badge:${badgeKey}`,
    ),
}));

vi.mock('../BrandLogo', () => ({
  BrandLogo: () => React.createElement('span', { 'data-testid': 'brand-logo' }, 'DP'),
}));

const { BadgeShareCard, getBadgeShareText } = await import('../BadgeShareCard');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseBadge = {
  badgeKey: 'first_ride',
  name: 'First Ride',
  description: 'Your first ride on Defensive Pedal.',
  criteriaText: 'Complete your first ride',
  flavorText: 'Every journey starts with a first pedal stroke.',
  tierFamily: null,
  category: 'firsts' as const,
  iconKey: 'bicycle',
  xpReward: 50,
  isSecret: false,
} as const;

// ---------------------------------------------------------------------------
// Preview variant tests
// ---------------------------------------------------------------------------

describe('BadgeShareCard — preview variant', () => {
  it('renders badge name, tier label, criteria, and logo', () => {
    render(<BadgeShareCard badge={baseBadge as never} tier="gold" />);
    expect(screen.getByText('First Ride')).toBeTruthy();
    expect(screen.getByText('Gold')).toBeTruthy();
    expect(screen.getByText('Complete your first ride')).toBeTruthy();
    expect(screen.getByTestId('brand-logo')).toBeTruthy();
    expect(screen.getByTestId('badge-icon-first_ride-gold-lg')).toBeTruthy();
  });

  it('renders rarity line when rarityPercent provided', () => {
    render(
      <BadgeShareCard
        badge={baseBadge as never}
        tier="bronze"
        rarityPercent={3}
      />,
    );
    expect(screen.getByText(/Only 3% of cyclists/)).toBeTruthy();
  });

  it('omits rarity line when rarityPercent undefined', () => {
    render(<BadgeShareCard badge={baseBadge as never} tier="bronze" />);
    expect(screen.queryByText(/Only \d+% of cyclists/)).toBeNull();
  });

  it('renders defensivepedal.com footer', () => {
    render(<BadgeShareCard badge={baseBadge as never} tier="silver" />);
    expect(screen.getByText('defensivepedal.com')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Capture variant tests
// ---------------------------------------------------------------------------

describe('BadgeShareCard — capture variant', () => {
  it('renders name, tier label, criteria text', () => {
    render(
      <BadgeShareCard
        badge={baseBadge as never}
        tier="platinum"
        variant="capture"
      />,
    );
    expect(screen.getByText('First Ride')).toBeTruthy();
    expect(screen.getByText('Platinum')).toBeTruthy();
    expect(screen.getByText('Complete your first ride')).toBeTruthy();
  });

  it('renders brand header text and footer', () => {
    render(
      <BadgeShareCard
        badge={baseBadge as never}
        tier="diamond"
        variant="capture"
      />,
    );
    expect(screen.getByText('DEFENSIVE PEDAL')).toBeTruthy();
    expect(screen.getByText('defensivepedal.com')).toBeTruthy();
  });

  it('renders simplified rarity line without em-dashes', () => {
    render(
      <BadgeShareCard
        badge={baseBadge as never}
        tier="gold"
        rarityPercent={1}
        variant="capture"
      />,
    );
    expect(screen.getByText(/Only 1% of cyclists earn this/)).toBeTruthy();
  });

  it('mounts the BadgeIcon at lg size in capture variant', () => {
    render(
      <BadgeShareCard
        badge={baseBadge as never}
        tier="gold"
        variant="capture"
      />,
    );
    expect(screen.getByTestId('badge-icon-first_ride-gold-lg')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Ref forwarding
// ---------------------------------------------------------------------------

describe('BadgeShareCard — ref forwarding', () => {
  it('forwards ref to the outermost View in capture variant', () => {
    const ref = createRef<unknown>();
    render(
      <BadgeShareCard
        ref={ref as React.Ref<unknown>}
        badge={baseBadge as never}
        tier="bronze"
        variant="capture"
      />,
    );
    expect(ref.current).toBeTruthy();
  });

  it('forwards ref to the outermost View in preview variant', () => {
    const ref = createRef<unknown>();
    render(
      <BadgeShareCard
        ref={ref as React.Ref<unknown>}
        badge={baseBadge as never}
        tier="silver"
      />,
    );
    expect(ref.current).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Share text helper
// ---------------------------------------------------------------------------

describe('getBadgeShareText', () => {
  it('generates text with badge name, tier label, and hashtags', () => {
    const text = getBadgeShareText(baseBadge as never, 'gold');
    expect(text).toContain('First Ride');
    expect(text).toContain('Gold');
    expect(text).toContain('#DefensivePedal');
    expect(text).toContain('#SaferCycling');
  });
});
