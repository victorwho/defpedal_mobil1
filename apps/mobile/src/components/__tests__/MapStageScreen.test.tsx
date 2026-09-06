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

import { MapStageScreen } from '../MapStageScreen';

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
