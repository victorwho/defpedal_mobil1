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
  ImpactDashboard,
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
  ...overrides,
});

const makeDashboard = (overrides?: Partial<ImpactDashboard>): ImpactDashboard => ({
  streak: {
    currentStreak: 5,
    longestStreak: 12,
    lastQualifyingDate: '2026-04-08',
    freezeAvailable: true,
    freezeUsedDate: null,
  },
  totalCo2SavedKg: 15.3,
  totalMoneySavedEur: 47,
  totalHazardsReported: 9,
  totalRidersProtected: 42,
  thisWeek: {
    rides: 4,
    co2SavedKg: 2.1,
    moneySavedEur: 6.0,
    hazardsReported: 2,
  },
  totalMicrolives: 18.5,
  totalCommunitySeconds: 320,
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
    render(<ImpactSummaryCard rideImpact={impact} dashboard={null} />);

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

  it('shows lifetime totals when dashboard is provided', () => {
    const impact = makeRideImpact();
    const dashboard = makeDashboard();
    render(<ImpactSummaryCard rideImpact={impact} dashboard={dashboard} />);

    // Totals section heading
    expect(screen.getByText('Your total impact')).toBeTruthy();

    // Formatted dashboard values
    expect(screen.getByText('15.3')).toBeTruthy(); // totalCo2SavedKg.toFixed(1)
    expect(screen.getByText('kg CO2')).toBeTruthy();
    expect(screen.getByText('47')).toBeTruthy(); // totalMoneySavedEur.toFixed(0)
    expect(screen.getByText('EUR saved')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy(); // totalHazardsReported
    expect(screen.getByText('hazards')).toBeTruthy();
  });

  it('does not show totals section when dashboard is null', () => {
    const impact = makeRideImpact();
    render(<ImpactSummaryCard rideImpact={impact} dashboard={null} />);

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
        dashboard={null}
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
