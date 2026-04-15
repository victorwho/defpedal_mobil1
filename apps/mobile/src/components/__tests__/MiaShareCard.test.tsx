// @vitest-environment happy-dom
/**
 * MiaShareCard Component — Unit Tests
 *
 * Tests rendering for all 5 levels, stats display, share text generation,
 * and the exported getMiaShareText helper.
 */
import React from 'react';
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

vi.mock('../../design-system/tokens/miaColors', () => ({
  miaLevelColors: {
    level2: { primary: '#22C55E', secondary: '#4ADE80', particle: '#86EFAC' },
    level3: { primary: '#F59E0B', secondary: '#FBBF24', particle: '#FDE68A' },
    level4: { primary: '#3B82F6', secondary: '#60A5FA', particle: '#93C5FD' },
    level5: { primary: '#FACC15', secondary: '#FDE68A', particle: '#FEF9C3' },
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
    mono: { bold: 'System', medium: 'System' },
  },
  text2xl: { fontSize: 24 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
  textBase: { fontSize: 16 },
}));

vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: ({ name }: { name: string }) =>
    React.createElement('span', { 'data-testid': `icon-${name}` }, name),
}));

vi.mock('../BrandLogo', () => ({
  BrandLogo: () => React.createElement('span', { 'data-testid': 'brand-logo' }, 'DP'),
}));

const { MiaShareCard, getMiaShareText } = await import('../MiaShareCard');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MiaShareCard', () => {
  const defaultStats = { totalRides: 10, totalKm: 45, daysSinceStart: 14 };

  describe('rendering for each level', () => {
    const levelNames: Record<number, string> = {
      1: 'First Pedal',
      2: 'Neighborhood Explorer',
      3: 'Cafe Rider',
      4: 'Urban Navigator',
      5: 'Confident Cyclist',
    };

    const levelIcons: Record<number, string> = {
      1: 'bicycle',
      2: 'shield-checkmark',
      3: 'cafe',
      4: 'compass',
      5: 'star',
    };

    for (const level of [1, 2, 3, 4, 5] as const) {
      it(`renders level ${level} with correct name and icon`, () => {
        const { unmount } = render(
          <MiaShareCard level={level} stats={defaultStats} onShare={vi.fn()} />,
        );
        expect(screen.getByText(levelNames[level])).toBeTruthy();
        expect(screen.getByTestId(`icon-${levelIcons[level]}`)).toBeTruthy();
        unmount();
      });
    }
  });

  describe('stats display', () => {
    it('shows rides, km, and days', () => {
      render(
        <MiaShareCard level={3} stats={defaultStats} onShare={vi.fn()} />,
      );
      expect(screen.getByText('10')).toBeTruthy();
      expect(screen.getByText('45')).toBeTruthy();
      expect(screen.getByText('14')).toBeTruthy();
      expect(screen.getByText('rides')).toBeTruthy();
      expect(screen.getByText('km')).toBeTruthy();
      expect(screen.getByText('days')).toBeTruthy();
    });

    it('shows zero stats without error', () => {
      render(
        <MiaShareCard
          level={1}
          stats={{ totalRides: 0, totalKm: 0, daysSinceStart: 0 }}
          onShare={vi.fn()}
        />,
      );
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBe(3);
    });
  });

  describe('branding', () => {
    it('renders brand logo', () => {
      render(
        <MiaShareCard level={2} stats={defaultStats} onShare={vi.fn()} />,
      );
      expect(screen.getByTestId('brand-logo')).toBeTruthy();
    });

    it('renders brand name', () => {
      render(
        <MiaShareCard level={2} stats={defaultStats} onShare={vi.fn()} />,
      );
      expect(screen.getByText('Defensive Pedal')).toBeTruthy();
    });

    it('renders footer tagline', () => {
      render(
        <MiaShareCard level={2} stats={defaultStats} onShare={vi.fn()} />,
      );
      expect(screen.getByText('Safer streets, one ride at a time')).toBeTruthy();
    });
  });

  describe('share button', () => {
    it('renders share button', () => {
      render(
        <MiaShareCard level={3} stats={defaultStats} onShare={vi.fn()} />,
      );
      expect(screen.getByText('Share')).toBeTruthy();
      expect(screen.getByTestId('icon-share-social-outline')).toBeTruthy();
    });
  });
});

describe('getMiaShareText', () => {
  it('generates share text with level name, rides, and km', () => {
    const text = getMiaShareText(3, 10, 45);
    expect(text).toContain('Level 3');
    expect(text).toContain('Cafe Rider');
    expect(text).toContain('10 rides');
    expect(text).toContain('45 km');
    expect(text).toContain('#DefensivePedal');
  });

  it('falls back to "Cyclist" for unknown level', () => {
    const text = getMiaShareText(99 as any, 5, 20);
    expect(text).toContain('Cyclist');
  });
});
