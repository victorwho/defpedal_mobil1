// @vitest-environment happy-dom
/**
 * ImpactSummaryCard — Unit Tests
 *
 * Tests that the post-ride impact summary displays ride data correctly,
 * including AnimatedCounter values, lifetime totals, and earned badges.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  RideImpact,
  BadgeUnlockEvent,
} from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Force reduced motion so AnimatedCounter renders final values synchronously
vi.mock('../../design-system/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// expo-router (Pressable "View all achievements" link)
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));

// react-native-svg (BadgeIcon uses Svg/Path/etc.)
vi.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('svg', null, children),
  Path: () => null,
  Circle: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Stop: () => null,
}));

const { ImpactSummaryCard } = await import('../ImpactSummaryCard');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRideImpact = (overrides?: Partial<RideImpact>): RideImpact => ({
  tripId: 'trip-123',
  co2SavedKg: 0.84,
  moneySavedEur: 2.45,
  hazardsWarnedCount: 3,
  distanceMeters: 7000,
  equivalentText: 'Charging a smartphone 12 times',
  personalMicrolives: 2.4,
  communitySeconds: 45,
  newBadges: [],
  xpBreakdown: [],
  totalXpEarned: 0,
  currentTotalXp: 0,
  riderTier: 'kickstand',
  tierPromotion: null,
  ...overrides,
});

const makeBadge = (key: string, name: string): BadgeUnlockEvent => ({
  badgeKey: key,
  tier: 'bronze',
  name,
  flavorText: 'You earned a badge!',
  iconKey: key,
  earnedAt: '2026-04-08T12:00:00Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImpactSummaryCard', () => {
  it('renders all three impact counters with correct ride data', () => {
    const impact = makeRideImpact();
    render(<ImpactSummaryCard rideImpact={impact} />);

    // Section heading
    expect(screen.getByText("This ride's impact")).toBeTruthy();

    // Microlives counter — 2.4 ML, label includes formatted time
    expect(screen.getByText('2.4 ML')).toBeTruthy();
    expect(screen.getByText('+1 hour, 12 minutes of life earned')).toBeTruthy();
    expect(screen.getByText('+45s donated to city')).toBeTruthy();

    // CO2 counter
    expect(screen.getByText('0.84 kg')).toBeTruthy();
    expect(screen.getByText('CO2 saved')).toBeTruthy();
    expect(screen.getByText('Charging a smartphone 12 times')).toBeTruthy();

    // Money counter
    expect(screen.getByText('EUR 2.45')).toBeTruthy();
    expect(screen.getByText('Money saved')).toBeTruthy();
  });

  it('always renders XP section with total and tier progress', () => {
    const impact = makeRideImpact({ totalXpEarned: 0, currentTotalXp: 150, riderTier: 'kickstand' });
    render(<ImpactSummaryCard rideImpact={impact} />);

    // XP section always present
    expect(screen.getByText('XP earned')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('+0 XP')).toBeTruthy();
  });

  it('renders XP breakdown rows when available', () => {
    const impact = makeRideImpact({
      xpBreakdown: [
        { action: 'ride_complete', label: 'Ride completed', baseXp: 50, multiplier: 1, finalXp: 50 },
        { action: 'badge_earn', label: 'Badge: First Ride', baseXp: 100, multiplier: 2, finalXp: 200 },
      ],
      totalXpEarned: 250,
      currentTotalXp: 250,
      riderTier: 'kickstand',
    });
    render(<ImpactSummaryCard rideImpact={impact} />);

    expect(screen.getByText('Ride completed')).toBeTruthy();
    expect(screen.getByText('Badge: First Ride')).toBeTruthy();
    expect(screen.getByText('+250 XP')).toBeTruthy();
  });

  it('does not show lifetime totals section', () => {
    const impact = makeRideImpact();
    render(<ImpactSummaryCard rideImpact={impact} />);

    expect(screen.queryByText('Your total impact')).toBeNull();
  });

  it('renders earned badges section when newBadges provided', () => {
    const impact = makeRideImpact();
    const badges = [
      makeBadge('first_ride', 'First Ride'),
      makeBadge('early_bird', 'Early Bird'),
    ];
    render(
      <ImpactSummaryCard
        rideImpact={impact}
        newBadges={badges}
      />,
    );

    // Badges section
    expect(screen.getByText('Badges earned')).toBeTruthy();
    expect(screen.getByText('First Ride')).toBeTruthy();
    expect(screen.getByText('Early Bird')).toBeTruthy();
    expect(screen.getByText('View all achievements >')).toBeTruthy();
  });
});
