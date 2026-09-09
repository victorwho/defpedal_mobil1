// @vitest-environment happy-dom
/**
 * MapStageScreen's sheet contract.
 *
 * This exists because of a real device-test failure: `/loop-planner` passed its
 * four controls, its results list and every notice as `children` WITHOUT
 * `useBottomSheet`, and the component silently dropped all of it. The screen
 * shipped to testers showing a title and one button.
 *
 * Nothing else could have caught it. Typecheck is happy — `children` is a valid
 * prop. Lint is happy. Even the bundle-content check passed, because the code
 * was in the bundle; it just never rendered. Only running the component, or a
 * phone, could see it.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// MapStageScreen pulls useTheme from the design-system BARREL, which re-exports
// every atom, molecule and organism — including ones with Flow syntax Vite
// cannot parse, and fonts.ts which require()s .ttf binaries (error-log #42).
// Mocking the barrel short-circuits that entire tree; the sheet only needs two
// colours and the mode.
vi.mock('../../design-system', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: { bgDeep: '#111827', bgPrimary: '#1F2937', borderDefault: '#374151' },
  }),
}));

// react-native-safe-area-context ships source Vite cannot parse, and is not in
// the alias list the way react-native itself is.
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Keep the sheet's spring animations out of the assertions.
vi.mock('../../design-system/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

import { MapStageScreen, resolveDragTarget } from '../MapStageScreen';

const stubMap = () => React.createElement('div', null, 'map');
const child = () => React.createElement('div', null, 'controls');
const footer = () => React.createElement('div', null, 'find loops');

describe('MapStageScreen children visibility', () => {
  it('drops children when the sheet is not opted into', () => {
    // Documented behaviour, not a bug — but it is the trap, so pin it.
    render(
      React.createElement(
        MapStageScreen,
        { map: stubMap() },
        child(),
      ),
    );
    expect(screen.queryByText('controls')).toBeNull();
  });

  it('renders children once the sheet is opted into and opened', () => {
    render(
      React.createElement(
        MapStageScreen,
        { map: stubMap(), useBottomSheet: true, initiallyExpanded: true },
        child(),
      ),
    );
    expect(screen.getByText('controls')).toBeTruthy();
  });

  it('keeps children behind the handle when the sheet starts collapsed', () => {
    // The default every other map screen relies on: map-first, drag up for
    // detail. Changing it would alter route-preview and course-import.
    render(
      React.createElement(
        MapStageScreen,
        { map: stubMap(), useBottomSheet: true },
        child(),
      ),
    );
    expect(screen.queryByText('controls')).toBeNull();
  });

  it('renders the footer with or without a sheet', () => {
    // This is why the broken screen still looked half-alive: the footer button
    // rendered while everything above it was gone.
    render(
      React.createElement(
        MapStageScreen,
        { map: stubMap(), footer: footer() },
        child(),
      ),
    );
    expect(screen.getByText('find loops')).toBeTruthy();
    expect(screen.queryByText('controls')).toBeNull();
  });

  it('renders the map in every configuration', () => {
    render(
      React.createElement(
        MapStageScreen,
        { map: stubMap(), useBottomSheet: true, initiallyExpanded: true },
        child(),
      ),
    );
    expect(screen.getByText('map')).toBeTruthy();
  });
});

describe('sheet detents', () => {
  it('renders children at the mid detent, not just when fully expanded', () => {
    // The mid detent is where the loop planner rests once results arrive: the
    // map stays the subject and the list is still readable. Gating content on
    // "fully expanded" would make it an empty strip.
    render(
      <MapStageScreen
        map={<div>map</div>}
        useBottomSheet
        enableMidDetent
        detent="mid"
      >
        <div>results list</div>
      </MapStageScreen>,
    );
    expect(screen.getByText('results list')).toBeTruthy();
  });

  it('hides children when driven to collapsed', () => {
    // What the search does while loops draw onto the map.
    render(
      <MapStageScreen
        map={<div>map</div>}
        useBottomSheet
        enableMidDetent
        detent="collapsed"
        peekContent={<div>Finding loops</div>}
      >
        <div>results list</div>
      </MapStageScreen>,
    );
    expect(screen.queryByText('results list')).toBeNull();
    expect(screen.getByText('Finding loops')).toBeTruthy();
  });

  it('follows a controlled detent change', () => {
    const { rerender } = render(
      <MapStageScreen map={<div>map</div>} useBottomSheet enableMidDetent detent="collapsed">
        <div>results list</div>
      </MapStageScreen>,
    );
    expect(screen.queryByText('results list')).toBeNull();
    rerender(
      <MapStageScreen map={<div>map</div>} useBottomSheet enableMidDetent detent="mid">
        <div>results list</div>
      </MapStageScreen>,
    );
    expect(screen.getByText('results list')).toBeTruthy();
  });

  it('leaves an uncontrolled sheet exactly as it was', () => {
    // course-import and route-preview pass neither new prop; their sheet must
    // still open when told to and stay binary.
    render(
      <MapStageScreen map={<div>map</div>} useBottomSheet initiallyExpanded>
        <div>course detail</div>
      </MapStageScreen>,
    );
    expect(screen.getByText('course detail')).toBeTruthy();
  });
});

/**
 * The drag-release rule.
 *
 * Reported from preview v0.2.154: route preview's sheet "has become hard to
 * pull up". It had. faa19c8 replaced a direction rule (80dp either way) with
 * pure nearest-detent, to reach the loop planner's new middle detent. On a
 * TWO-detent sheet the nearest boundary is the midpoint between the peek strip
 * and 65% of the screen, so a pull-up had to travel ~190dp instead of 80dp and
 * anything shorter sprang back to collapsed.
 *
 * Heights below are the real ones for a 800dp window: collapsed is
 * HANDLE_HEIGHT + PEEK_CONTENT_HEIGHT, expanded is EXPANDED_RATIO * 800.
 */
describe('drag release', () => {
  const HEIGHTS: Record<string, number> = { collapsed: 108, mid: 360, expanded: 520 };
  const heightFor = (detent: string) => HEIGHTS[detent]!;
  const twoDetent = ['collapsed', 'expanded'] as const;
  const threeDetent = ['collapsed', 'mid', 'expanded'] as const;

  const release = (ladder: readonly string[], current: string, dy: number, vy = 0) =>
    resolveDragTarget({
      ladder: [...ladder] as never,
      current: current as never,
      heightFor: heightFor as never,
      dy,
      vy,
    });

  it('opens a two-detent sheet on a pull-up that clears the threshold', () => {
    // THE REGRESSION. 100dp up is a deliberate drag but lands nowhere near the
    // expanded height, so pure proximity sent it back to collapsed.
    expect(release(twoDetent, 'collapsed', -100)).toBe('expanded');
  });

  it('stays put when the drag was too small to be a decision', () => {
    expect(release(twoDetent, 'collapsed', -40)).toBe('collapsed');
    expect(release(twoDetent, 'expanded', 40)).toBe('expanded');
  });

  it('treats a fast flick as deliberate even when it barely travelled', () => {
    expect(release(twoDetent, 'collapsed', -20, -1.4)).toBe('expanded');
  });

  it('collapses on a deliberate downward drag', () => {
    expect(release(twoDetent, 'expanded', 120)).toBe('collapsed');
  });

  it('lands on the middle detent when the finger stopped near it', () => {
    // 260dp up from 108 releases at 368, next to mid (360).
    expect(release(threeDetent, 'collapsed', -260)).toBe('mid');
  });

  it('lets a long drag skip the middle detent', () => {
    // 420dp up releases at 528, past expanded.
    expect(release(threeDetent, 'collapsed', -420)).toBe('expanded');
  });

  it('never moves the wrong way, however the heights fall', () => {
    // Proximity may carry a gesture further, never backwards past the start.
    expect(release(threeDetent, 'mid', -90)).toBe('expanded');
    expect(release(threeDetent, 'mid', 90)).toBe('collapsed');
  });
});
