// @vitest-environment happy-dom
/**
 * The elevation card must be dismissible FROM ITSELF.
 *
 * It is opened from the floating control rail, and when the card is tall
 * enough it covers the very button that opened it — which on a short screen
 * left a rider mid-ride with the chart stuck open and no way to close it
 * (reported from the road on preview v0.2.162).
 *
 * The fix deliberately is NOT "move the rail / shrink the card until they no
 * longer collide": that is screen-height arithmetic, and the same class of
 * reasoning is what put the rail on top of the maneuver panel one build
 * earlier. A card that carries its own escape cannot be trapped by any
 * layout. These specs pin that escape.
 *
 * Chart geometry itself is covered by ElevationProgressCard.test.tsx.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}` }),
    ),
  };
});

vi.mock('react-native-svg', () => {
  const React = require('react');
  const stub = (tag: string) => (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-svg': tag }, props.children as React.ReactNode);
  return {
    __esModule: true,
    default: stub('svg'),
    Svg: stub('svg'),
    Circle: stub('circle'),
    Defs: stub('defs'),
    LinearGradient: stub('lineargradient'),
    Stop: stub('stop'),
    Path: stub('path'),
    Line: stub('line'),
    Rect: stub('rect'),
  };
});

import { ElevationProgressCard } from '../ElevationProgressCard';

const PROFILE = [100, 120, 140, 130, 160, 150, 180, 170, 190, 200];

const renderCard = (
  props: Partial<React.ComponentProps<typeof ElevationProgressCard>> = {},
) =>
  render(
    <ElevationProgressCard
      elevationProfile={PROFILE}
      totalDistanceMeters={10_000}
      remainingDistanceMeters={4_000}
      isOffRoute={false}
      {...props}
    />,
  );

describe('ElevationProgressCard — dismissal', () => {
  it('renders a close control when onClose is supplied', () => {
    renderCard({ onClose: vi.fn() });
    expect(screen.getByTestId('elevation-close')).toBeTruthy();
  });

  it('fires onClose — the rider\'s only escape when the card covers the toggle', () => {
    const onClose = vi.fn();
    renderCard({ onClose });
    fireEvent.click(screen.getByTestId('elevation-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries an accessibility label rather than being an unlabelled glyph', () => {
    renderCard({ onClose: vi.fn() });
    expect(screen.getByTestId('elevation-close').getAttribute('aria-label')).toBe(
      'Hide elevation',
    );
  });

  it('omits the control entirely when the card is not dismissible', () => {
    // Keeps the card usable in any future read-only placement without
    // rendering a close button that would do nothing.
    renderCard();
    expect(screen.queryByTestId('elevation-close')).toBeNull();
  });

  it('still shows the close control while off-route', () => {
    // Off-route re-colours the card; it must not swallow the escape.
    renderCard({ onClose: vi.fn(), isOffRoute: true });
    expect(screen.getByTestId('elevation-close')).toBeTruthy();
  });
});
