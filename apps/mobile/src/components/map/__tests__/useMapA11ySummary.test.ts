// @vitest-environment happy-dom
/**
 * Tests for useMapA11ySummary — the hook that produces a textual
 * description of map state for assistive technology.
 *
 * The hook has two outputs:
 *  - `label`: static, always-current summary.
 *  - `liveRegionText`: transient transition text, emitted only on meaningful
 *    state changes (hazard proximity bucket crossing, off-route toggle).
 */
import type { HazardType, RiskSegment, RouteOption } from '@defensivepedal/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Translator mock: returns "key|vars-json" so assertions can check both the
// translation key chosen and interpolation payload without relying on the
// real locale file.
vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}|${JSON.stringify(vars)}` : key,
}));

import { useMapA11ySummary } from '../useMapA11ySummary';
import type { MapA11yInput } from '../useMapA11ySummary';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRoute = (overrides: Partial<RouteOption> = {}): RouteOption => ({
  id: overrides.id ?? 'r1',
  source: 'custom_osrm',
  routingEngineVersion: '1',
  routingProfileVersion: '1',
  mapDataVersion: '1',
  riskModelVersion: '1',
  geometryPolyline6: '',
  distanceMeters: 5000,
  durationSeconds: 1200,
  adjustedDurationSeconds: 1200,
  totalClimbMeters: 80,
  steps: [],
  riskSegments: [],
  warnings: [],
  ...overrides,
});

const makeRiskSegment = (
  id: string,
  category: string,
  coords: readonly [number, number][],
): RiskSegment => ({
  id,
  riskScore: 0,
  riskCategory: category,
  color: '#000',
  geometry: { type: 'LineString', coordinates: coords as [number, number][] },
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// label output
// ---------------------------------------------------------------------------

describe('useMapA11ySummary — label', () => {
  it('returns only the empty fallback when there is no selected route', () => {
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning' }),
    );
    expect(result.current.label).toContain('mapA11y.empty');
    expect(result.current.liveRegionText).toBeNull();
  });

  it('mentions user location when known', () => {
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning', userLocationKnown: true }),
    );
    expect(result.current.label).toContain('mapA11y.userLocationKnown');
  });

  it('includes route distance + duration + climb for a route with climb', () => {
    const route = makeRoute({ totalClimbMeters: 80 });
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning', selectedRoute: route }),
    );
    expect(result.current.label).toContain('mapA11y.routeWithClimb');
    expect(result.current.label).toContain('5.0 km');
  });

  it('uses the no-climb summary when totalClimbMeters is 0 or null', () => {
    const route = makeRoute({ totalClimbMeters: 0 });
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning', selectedRoute: route }),
    );
    expect(result.current.label).toContain('mapA11y.routeSummary');
    expect(result.current.label).not.toContain('mapA11y.routeWithClimb');
  });

  it('appends navigating-mode remaining-distance phrase', () => {
    const route = makeRoute();
    const { result } = renderHook(() =>
      useMapA11ySummary({
        mode: 'navigating',
        selectedRoute: route,
        remainingDistanceMeters: 2400,
      }),
    );
    expect(result.current.label).toContain('mapA11y.navigating');
    expect(result.current.label).toContain('2.4 km');
  });

  it('appends hazard-count phrase (pluralized) when hazards are present', () => {
    const route = makeRoute();

    const { result: one } = renderHook(() =>
      useMapA11ySummary({
        mode: 'planning',
        selectedRoute: route,
        hazardsOnRoute: 1,
      }),
    );
    expect(one.current.label).toContain('mapA11y.hazardsOnRoute_one');

    const { result: many } = renderHook(() =>
      useMapA11ySummary({
        mode: 'planning',
        selectedRoute: route,
        hazardsOnRoute: 4,
      }),
    );
    expect(many.current.label).toContain('mapA11y.hazardsOnRoute_other');
    expect(many.current.label).toContain('"count":4');
  });

  it('includes a risk-mix phrase when riskSegments exist', () => {
    const route = makeRoute({
      riskSegments: [
        makeRiskSegment('s1', 'Safe', [
          [0, 0],
          [0, 0.01],
        ]),
        makeRiskSegment('s2', 'Risky', [
          [0, 0.01],
          [0, 0.011],
        ]),
      ],
    });
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning', selectedRoute: route }),
    );
    expect(result.current.label).toContain('mapA11y.riskBreakdown');
  });

  it('skips the risk-mix phrase when riskSegments is empty', () => {
    const route = makeRoute({ riskSegments: [] });
    const { result } = renderHook(() =>
      useMapA11ySummary({ mode: 'planning', selectedRoute: route }),
    );
    expect(result.current.label).not.toContain('mapA11y.riskBreakdown');
  });
});

// ---------------------------------------------------------------------------
// liveRegionText — state transitions
// ---------------------------------------------------------------------------

describe('useMapA11ySummary — liveRegionText transitions', () => {
  it('is null in the quiet state', () => {
    const { result } = renderHook(() =>
      useMapA11ySummary({
        mode: 'navigating',
        selectedRoute: makeRoute(),
      }),
    );
    expect(result.current.liveRegionText).toBeNull();
  });

  it('fires once when off-route becomes true', () => {
    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          isOffRoute: false,
        } as MapA11yInput,
      },
    );
    expect(result.current.liveRegionText).toBeNull();

    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        isOffRoute: true,
      });
    });
    expect(result.current.liveRegionText).toContain('mapA11y.offRouteEntered');
  });

  it('announces "back on route" exactly once after off-route clears', () => {
    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          isOffRoute: true,
        } as MapA11yInput,
      },
    );
    expect(result.current.liveRegionText).toContain('mapA11y.offRouteEntered');

    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        isOffRoute: false,
      });
    });
    expect(result.current.liveRegionText).toContain('mapA11y.offRouteCleared');
  });

  it('announces hazard when entering the 200 m window', () => {
    const hazard = {
      id: 'h1',
      hazardType: 'pothole' as HazardType,
      distanceMeters: 180,
    };

    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          nearestApproachingHazard: null,
        } as MapA11yInput,
      },
    );
    expect(result.current.liveRegionText).toBeNull();

    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        nearestApproachingHazard: hazard,
      });
    });
    expect(result.current.liveRegionText).toContain('mapA11y.hazardUpcoming');
  });

  it('re-announces the same hazard when the 50 m distance bucket changes', () => {
    const makeHazard = (distanceMeters: number) => ({
      id: 'h1',
      hazardType: 'pothole' as HazardType,
      distanceMeters,
    });

    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          nearestApproachingHazard: makeHazard(180),
        } as MapA11yInput,
      },
    );
    const firstText = result.current.liveRegionText;
    expect(firstText).toContain('"distance":180');

    // Same bucket (150-199 m) — no re-announcement.
    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        nearestApproachingHazard: makeHazard(160),
      });
    });
    expect(result.current.liveRegionText).toBe(firstText);

    // Crossed into 100-149 m bucket — re-announces with new distance.
    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        nearestApproachingHazard: makeHazard(120),
      });
    });
    expect(result.current.liveRegionText).toContain('"distance":120');
    expect(result.current.liveRegionText).not.toBe(firstText);
  });

  it('does not announce a hazard when suppressHazardLive is true', () => {
    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          nearestApproachingHazard: null,
        } as MapA11yInput,
      },
    );

    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        nearestApproachingHazard: {
          id: 'h1',
          hazardType: 'pothole' as HazardType,
          distanceMeters: 80,
        },
        suppressHazardLive: true,
      });
    });
    expect(result.current.liveRegionText).toBeNull();
  });

  it('ignores hazards outside the default 200 m window', () => {
    const { result, rerender } = renderHook(
      (props: MapA11yInput) => useMapA11ySummary(props),
      {
        initialProps: {
          mode: 'navigating',
          selectedRoute: makeRoute(),
          nearestApproachingHazard: null,
        } as MapA11yInput,
      },
    );

    act(() => {
      rerender({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        nearestApproachingHazard: {
          id: 'h1',
          hazardType: 'pothole' as HazardType,
          distanceMeters: 350,
        },
      });
    });
    expect(result.current.liveRegionText).toBeNull();
  });

  it('prioritizes off-route over an approaching hazard', () => {
    const { result } = renderHook(() =>
      useMapA11ySummary({
        mode: 'navigating',
        selectedRoute: makeRoute(),
        isOffRoute: true,
        nearestApproachingHazard: {
          id: 'h1',
          hazardType: 'pothole' as HazardType,
          distanceMeters: 80,
        },
      }),
    );
    expect(result.current.liveRegionText).toContain('mapA11y.offRouteEntered');
    expect(result.current.liveRegionText).not.toContain('mapA11y.hazardUpcoming');
  });
});
