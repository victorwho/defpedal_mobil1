// @vitest-environment happy-dom
/**
 * NavigationHUD — ManeuverCard + FooterCard.
 *
 * This is the most-looked-at component in the app and had no coverage at all
 * until the 2026-09-12 redesign (docs/plans/navigation-hud-redesign.md). The
 * properties pinned here are the ones that are invisible to typecheck and to
 * the bundle check, and that a rider would only discover mid-ride:
 *
 *   - the street line COLLAPSES when `streetName` is empty. GPX courses
 *     hardcode `streetName: ''` (packages/core/src/courseSteps.ts:75) because
 *     synthesized geometry cannot know street names, so a reserved-but-empty
 *     row is how an imported course ends up looking broken;
 *   - the "Then" row lives in ManeuverCard, NOT the footer — moving it is the
 *     whole point of the redesign, and a stray re-add would silently restore
 *     the duplication riders complained about;
 *   - End Ride is reachable from the footer, since the rail button that used
 *     to carry it is gone. If this callback stops firing, the only remaining
 *     way off the screen is the Android hardware back button.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NavigationStep } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    confirm: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    celebration: vi.fn(),
    destructiveConfirm: vi.fn(),
    snap: vi.fn(),
    fire: vi.fn(),
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) => {
    if (vars && Object.keys(vars).length > 0) {
      return `${key}:${JSON.stringify(vars)}`;
    }
    return key;
  },
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}` }),
    ),
  };
});

vi.mock('@expo/vector-icons', () => {
  const React = require('react');
  const Icon = ({ name }: { name: string }) =>
    React.createElement('span', { 'data-icon': name }, name);
  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    MaterialCommunityIcons: Icon,
    FontAwesome: Icon,
    FontAwesome5: Icon,
    Feather: Icon,
    AntDesign: Icon,
    Entypo: Icon,
  };
});

import { ManeuverCard, FooterCard } from '../NavigationHUD';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeStep = (over: Partial<NavigationStep> = {}): NavigationStep => ({
  id: 'step-1',
  instruction: 'Turn right onto Strada Traian',
  streetName: 'Strada Traian',
  distanceMeters: 102,
  durationSeconds: 30,
  maneuver: { type: 'turn', modifier: 'right', location: [26.1, 44.43] },
  mode: 'cycling',
  ...over,
});

const nextStep = makeStep({
  id: 'step-2',
  instruction: 'Turn left onto Calea Moșilor',
  streetName: 'Calea Moșilor',
  distanceMeters: 35,
  maneuver: { type: 'turn', modifier: 'left', location: [26.11, 44.44] },
});

const renderManeuver = (props: Partial<React.ComponentProps<typeof ManeuverCard>> = {}) =>
  render(
    <ManeuverCard
      currentStep={makeStep()}
      nextStep={null}
      distanceToManeuverMeters={102}
      {...props}
    />,
  );

const renderFooter = (props: Partial<React.ComponentProps<typeof FooterCard>> = {}) =>
  render(
    <FooterCard
      remainingDurationSeconds={14 * 60}
      remainingDistanceMeters={13_700}
      totalClimbMeters={137}
      speedKmh={18}
      onEndRide={vi.fn()}
      {...props}
    />,
  );

// ---------------------------------------------------------------------------
// ManeuverCard — the maneuver itself
// ---------------------------------------------------------------------------

describe('ManeuverCard — maneuver + distance', () => {
  it('renders the maneuver description and splits the distance from its unit', () => {
    renderManeuver();
    expect(screen.getByText('nav.maneuverShort.turnRight')).toBeTruthy();
    // Value and unit are separate nodes so they can be typeset at 36px / 13px.
    expect(screen.getByTestId('maneuver-distance-value').textContent).toBe('102');
    expect(screen.getByTestId('maneuver-distance-unit').textContent).toBe('m');
  });

  it('switches to kilometres on a long leg', () => {
    renderManeuver({ distanceToManeuverMeters: 2400 });
    expect(screen.getByTestId('maneuver-distance-value').textContent).toBe('2.4');
    expect(screen.getByTestId('maneuver-distance-unit').textContent).toBe('km');
  });

  it('falls back to the step distance when no live distance is available', () => {
    renderManeuver({ distanceToManeuverMeters: null });
    expect(screen.getByTestId('maneuver-distance-value').textContent).toBe('102');
  });

  it('keeps the spoken distance whole, not split, for screen readers', () => {
    renderManeuver();
    // A screen reader must hear "102 m", never the bare numeral.
    const label = screen.getByTestId('maneuver-card').getAttribute('aria-label') ?? '';
    expect(label).toContain('102 m');
  });
});

// ---------------------------------------------------------------------------
// ManeuverCard — street line (the GPX trap)
// ---------------------------------------------------------------------------

describe('ManeuverCard — street line', () => {
  it('shows the street name under the maneuver when the route has one', () => {
    renderManeuver();
    expect(screen.getByTestId('maneuver-street').textContent).toBe('Strada Traian');
  });

  it('omits the row entirely for a GPX course, which always has streetName ""', () => {
    // courseSteps.ts types this as `readonly streetName: ''`. Reserving the
    // row would leave a blank gap under every maneuver of an imported course.
    renderManeuver({ currentStep: makeStep({ streetName: '' }) });
    expect(screen.queryByTestId('maneuver-street')).toBeNull();
  });

  it('omits the row for a whitespace-only street name', () => {
    renderManeuver({ currentStep: makeStep({ streetName: '   ' }) });
    expect(screen.queryByTestId('maneuver-street')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ManeuverCard — the "Then" row
// ---------------------------------------------------------------------------

describe('ManeuverCard — "Then" row', () => {
  it('shows the next maneuver inside the same panel', () => {
    renderManeuver({ nextStep });
    expect(screen.getByTestId('maneuver-then')).toBeTruthy();
    expect(screen.getByTestId('maneuver-then-text').textContent).toBe('Calea Moșilor');
    expect(screen.getByTestId('maneuver-then-distance').textContent).toBe('35 m');
  });

  it('collapses on the last maneuver of a route', () => {
    renderManeuver({ nextStep: null });
    expect(screen.queryByTestId('maneuver-then')).toBeNull();
  });

  it('falls back to the maneuver description when the next street is unknown', () => {
    // Imported courses again — the description always resolves to something.
    renderManeuver({ nextStep: { ...nextStep, streetName: '' } });
    expect(screen.getByTestId('maneuver-then-text').textContent).toBe(
      'nav.maneuverShort.turnLeft',
    );
  });
});

// ---------------------------------------------------------------------------
// ManeuverCard — GPS / offline indicator
// ---------------------------------------------------------------------------

describe('ManeuverCard — GPS indicator', () => {
  it('reports a strong fix', () => {
    renderManeuver({ gpsAccuracyMeters: 5 });
    const label = screen.getByTestId('maneuver-gps').getAttribute('aria-label') ?? '';
    expect(label).toContain('nav.gpsStrong');
  });

  it('reports a poor fix and renders the pulsing icon', () => {
    renderManeuver({ gpsAccuracyMeters: 60 });
    const label = screen.getByTestId('maneuver-gps').getAttribute('aria-label') ?? '';
    expect(label).toContain('nav.gpsPoor');
    expect(screen.getByTestId('icon-navigate-outline')).toBeTruthy();
  });

  it('replaces the dot with an offline cloud when the network is gone', () => {
    renderManeuver({ isOffline: true });
    expect(screen.getByTestId('icon-cloud-offline-outline')).toBeTruthy();
  });

  it('is announced separately from the maneuver so it never mixes into the cue', () => {
    renderManeuver({ gpsAccuracyMeters: 5 });
    const summary = screen.getByTestId('maneuver-card').getAttribute('aria-label') ?? '';
    expect(summary).not.toContain('nav.gpsSignal');
  });
});

// ---------------------------------------------------------------------------
// ManeuverCard — tap to replay
// ---------------------------------------------------------------------------

describe('ManeuverCard — tap to replay', () => {
  it('fires onPress so a rider can repeat the spoken instruction', () => {
    const onPress = vi.fn();
    renderManeuver({ onPress });
    fireEvent.click(screen.getByTestId('maneuver-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FooterCard — hero + metrics
// ---------------------------------------------------------------------------

describe('FooterCard — hero + metrics', () => {
  it('leads with remaining time as the one hero number', () => {
    renderFooter();
    expect(screen.getByTestId('footer-hero-value').textContent).toBe('14');
    expect(screen.getByTestId('footer-hero-unit').textContent).toBe('min');
  });

  it('keeps speed beside the hero rather than on the control rail', () => {
    renderFooter();
    expect(screen.getByTestId('footer-speed-value').textContent).toBe('18');
  });

  it('shows an em dash when speed is unavailable', () => {
    renderFooter({ speedKmh: null });
    expect(screen.getByTestId('footer-speed-value').textContent).toBe('—');
  });

  it('renders exactly three metric cells — speed was promoted out of the row', () => {
    renderFooter();
    expect(screen.getAllByTestId(/^footer-metric-/)).toHaveLength(3);
    expect(screen.getByTestId('footer-metric-dist').textContent).toContain('13.7 km');
    expect(screen.getByTestId('footer-metric-climb').textContent).toContain('137 m');
  });

  it('marks a live climb without a tilde', () => {
    renderFooter({ isClimbLive: true });
    expect(screen.getByTestId('footer-metric-climb').textContent).not.toContain('~');
  });

  it('marks an estimated climb with a tilde', () => {
    renderFooter({ isClimbLive: false });
    expect(screen.getByTestId('footer-metric-climb').textContent).toContain('~');
  });

  it('renders an em dash for an unknown climb', () => {
    renderFooter({ totalClimbMeters: null });
    expect(screen.getByTestId('footer-metric-climb').textContent).toContain('—');
  });
});

// ---------------------------------------------------------------------------
// FooterCard — the "Then" row must NOT come back here
// ---------------------------------------------------------------------------

describe('FooterCard — no "then" content', () => {
  it('does not render a "then" strip, which now lives in ManeuverCard', () => {
    // Re-adding it here restores exactly the duplication riders reported.
    renderFooter();
    expect(screen.queryByTestId('footer-then')).toBeNull();
    expect(screen.queryByText('nav.then')).toBeNull();
  });

  it('ignores a stray nextStep, so a bad merge cannot resurrect the strip', () => {
    // @ts-expect-error — nextStep was deliberately removed from the props.
    renderFooter({ nextStep: { id: 'x', streetName: 'Somewhere' } });
    expect(screen.queryByText('nav.then')).toBeNull();
    expect(screen.queryByText('Somewhere')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FooterCard — End Ride
// ---------------------------------------------------------------------------

describe('FooterCard — End Ride', () => {
  it('fires onEndRide, the only on-screen way off this screen', () => {
    const onEndRide = vi.fn();
    renderFooter({ onEndRide });
    fireEvent.click(screen.getByTestId('footer-end-ride'));
    expect(onEndRide).toHaveBeenCalledTimes(1);
  });

  it('carries the End Ride accessibility label', () => {
    renderFooter();
    expect(screen.getByTestId('footer-end-ride').getAttribute('aria-label')).toBe(
      'nav.endRide',
    );
  });
});

// ---------------------------------------------------------------------------
// FooterCard — multi-stop
// ---------------------------------------------------------------------------

describe('FooterCard — multi-stop', () => {
  const nextStop = {
    stopIndex: 2,
    stopCount: 3,
    distanceMeters: 1200,
    durationSeconds: 5 * 60,
    climbMeters: 20,
  };

  it('retargets the primary metrics to the next stop', () => {
    renderFooter({ nextStop });
    expect(screen.getByTestId('footer-hero-value').textContent).toBe('5');
    expect(screen.getByTestId('footer-metric-dist').textContent).toContain('1.2 km');
  });

  it('shows the stop header and the total-to-finish line', () => {
    renderFooter({ nextStop });
    expect(screen.getByTestId('footer-stop-header')).toBeTruthy();
    expect(screen.getByTestId('footer-to-finish')).toBeTruthy();
  });

  it('keeps the End Ride column out of the stop header and to-finish bands', () => {
    // If the red column spanned the whole card it would become a ~160px slab
    // of danger red in multi-stop mode. It must sit in the middle band only.
    renderFooter({ nextStop });
    const band = screen.getByTestId('footer-main-band');
    expect(band.contains(screen.getByTestId('footer-end-ride'))).toBe(true);
    expect(band.contains(screen.getByTestId('footer-stop-header'))).toBe(false);
    expect(band.contains(screen.getByTestId('footer-to-finish'))).toBe(false);
  });

  it('renders the skip control and fires it', () => {
    const onSkipStop = vi.fn();
    renderFooter({ nextStop, onSkipStop });
    fireEvent.click(screen.getByTestId('footer-skip-stop'));
    expect(onSkipStop).toHaveBeenCalledTimes(1);
  });

  it('disables skip when offline, since a reroute needs the network', () => {
    const onSkipStop = vi.fn();
    renderFooter({ nextStop, onSkipStop, skipDisabled: true });
    fireEvent.click(screen.getByTestId('footer-skip-stop'));
    expect(onSkipStop).not.toHaveBeenCalled();
  });

  it('hides the stop header on a single-destination route', () => {
    renderFooter();
    expect(screen.queryByTestId('footer-stop-header')).toBeNull();
    expect(screen.queryByTestId('footer-to-finish')).toBeNull();
  });
});
