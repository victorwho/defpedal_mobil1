// @vitest-environment happy-dom
/**
 * MilestoneShareCard Component — Unit Tests
 *
 * Tests dual-variant rendering (preview / capture), ref forwarding,
 * milestone detection, and the exported getMilestoneShareText helper.
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
    mono: { bold: 'System', medium: 'System' },
  },
  text2xl: { fontSize: 24 },
  textBase: { fontSize: 16 },
  textDataLg: { fontSize: 30 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
}));

vi.mock('../BrandLogo', () => ({
  BrandLogo: () => React.createElement('span', { 'data-testid': 'brand-logo' }, 'DP'),
}));

const {
  MilestoneShareCard,
  getMilestoneShareText,
  detectNewMilestones,
  MILESTONE_CONFIGS,
} = await import('../MilestoneShareCard');

// ---------------------------------------------------------------------------
// Preview variant tests
// ---------------------------------------------------------------------------

describe('MilestoneShareCard — preview variant', () => {
  it('renders the title, stat label, and subtitle for streak_7', () => {
    render(<MilestoneShareCard milestoneKey="streak_7" />);
    const config = MILESTONE_CONFIGS.streak_7;
    expect(screen.getByText(config.title)).toBeTruthy();
    expect(screen.getByText(config.statLabel)).toBeTruthy();
    expect(screen.getByText(config.subtitle)).toBeTruthy();
  });

  it('renders the brand logo and brand name', () => {
    render(<MilestoneShareCard milestoneKey="distance_100km" />);
    expect(screen.getByTestId('brand-logo')).toBeTruthy();
    expect(screen.getByText('Defensive Pedal')).toBeTruthy();
  });

  it('renders the tagline footer', () => {
    render(<MilestoneShareCard milestoneKey="rides_10" />);
    expect(screen.getByText('Safer streets, one ride at a time')).toBeTruthy();
  });

  it('renders correctly for every MilestoneKey', () => {
    const keys = Object.keys(MILESTONE_CONFIGS) as (keyof typeof MILESTONE_CONFIGS)[];
    for (const key of keys) {
      const { unmount } = render(<MilestoneShareCard milestoneKey={key} />);
      expect(screen.getByText(MILESTONE_CONFIGS[key].title)).toBeTruthy();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// Capture variant tests
// ---------------------------------------------------------------------------

describe('MilestoneShareCard — capture variant', () => {
  it('renders title, stat label, and subtitle', () => {
    render(<MilestoneShareCard milestoneKey="co2_50kg" variant="capture" />);
    const config = MILESTONE_CONFIGS.co2_50kg;
    expect(screen.getByText(config.title)).toBeTruthy();
    expect(screen.getByText(config.statLabel)).toBeTruthy();
    expect(screen.getByText(config.subtitle)).toBeTruthy();
  });

  it('renders the defensivepedal.com footer in capture variant', () => {
    render(<MilestoneShareCard milestoneKey="streak_30" variant="capture" />);
    expect(screen.getByText('defensivepedal.com')).toBeTruthy();
  });

  it('renders the DEFENSIVE PEDAL brand text (uppercase) in capture variant', () => {
    render(<MilestoneShareCard milestoneKey="streak_30" variant="capture" />);
    expect(screen.getByText('DEFENSIVE PEDAL')).toBeTruthy();
  });

  it('does not render the preview-only tagline in capture variant', () => {
    render(<MilestoneShareCard milestoneKey="streak_30" variant="capture" />);
    expect(screen.queryByText('Safer streets, one ride at a time')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ref forwarding
// ---------------------------------------------------------------------------

describe('MilestoneShareCard — ref forwarding', () => {
  it('forwards ref to the outermost View in capture variant', () => {
    const ref = createRef<unknown>();
    render(
      <MilestoneShareCard
        ref={ref as React.Ref<unknown>}
        milestoneKey="streak_7"
        variant="capture"
      />,
    );
    expect(ref.current).toBeTruthy();
  });

  it('forwards ref to the outermost View in preview variant', () => {
    const ref = createRef<unknown>();
    render(
      <MilestoneShareCard
        ref={ref as React.Ref<unknown>}
        milestoneKey="streak_7"
      />,
    );
    expect(ref.current).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Detection + share-text helpers
// ---------------------------------------------------------------------------

describe('detectNewMilestones', () => {
  it('returns empty for no thresholds met', () => {
    expect(
      detectNewMilestones({
        streakDays: 0,
        totalDistanceKm: 0,
        totalRides: 0,
        totalCo2Kg: 0,
        earnedMilestones: [],
      }),
    ).toEqual([]);
  });

  it('detects streak_7 and rides_10 when met', () => {
    const result = detectNewMilestones({
      streakDays: 7,
      totalDistanceKm: 1,
      totalRides: 10,
      totalCo2Kg: 0,
      earnedMilestones: [],
    });
    expect(result).toContain('streak_7');
    expect(result).toContain('rides_10');
  });

  it('skips already-earned milestones', () => {
    const result = detectNewMilestones({
      streakDays: 14,
      totalDistanceKm: 0,
      totalRides: 0,
      totalCo2Kg: 0,
      earnedMilestones: ['streak_7'],
    });
    expect(result).not.toContain('streak_7');
    expect(result).toContain('streak_14');
  });
});

describe('getMilestoneShareText', () => {
  it('generates share text with title and subtitle', () => {
    const text = getMilestoneShareText('rides_50');
    expect(text).toContain('50 Rides');
    expect(text).toContain('#DefensivePedal');
    expect(text).toContain('#SaferCycling');
  });
});
