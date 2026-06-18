// @vitest-environment happy-dom
import type { RouteOption, RouteFeature, RoutePreviewResponse } from '@defensivepedal/core';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../store/appStore';
import { useApproachingRouteFeatures } from './useApproachingRouteFeatures';

const feature = (overrides: Partial<RouteFeature> = {}): RouteFeature => ({
  id: 'f1',
  type: 'semafor',
  tier: 'caution',
  lat: 44.43,
  lon: 26.1,
  distanceAlongRouteMeters: 1000,
  lengthMeters: null,
  ...overrides,
});

const buildRoute = (
  routeFeatures: RouteFeature[],
  distanceMeters = 2000,
): RouteOption => ({
  id: 'r1',
  source: 'custom_osrm',
  routingEngineVersion: 'v1',
  routingProfileVersion: 'v1',
  mapDataVersion: 'v1',
  riskModelVersion: 'v1',
  geometryPolyline6: 'abcdef',
  distanceMeters,
  durationSeconds: 600,
  adjustedDurationSeconds: 600,
  totalClimbMeters: null,
  steps: [],
  riskSegments: [],
  routeFeatures,
  warnings: [],
});

const buildPreview = (route: RouteOption): RoutePreviewResponse => ({
  routes: [route],
  selectedMode: 'safe',
  coverage: {
    countryCode: 'RO',
    status: 'supported',
    safeRouting: true,
    fastRouting: true,
  },
  generatedAt: new Date().toISOString(),
});

const arm = (
  route: RouteOption,
  remainingDistanceMeters: number,
  overrides: Partial<{
    accuracy: number | null;
    offRouteSince: string | null;
  }> = {},
) => {
  useAppStore.setState({
    appState: 'NAVIGATING',
    showRouteFeatures: true,
    routePreview: buildPreview(route),
    selectedRouteId: route.id,
    navigationSession: {
      sessionId: 's1',
      routeId: route.id,
      state: 'navigating',
      currentStepIndex: 0,
      isMuted: false,
      isFollowing: true,
      startedAt: new Date().toISOString(),
      remainingDistanceMeters,
      lastLocationAccuracyMeters: overrides.accuracy ?? 10,
      offRouteSince: overrides.offRouteSince ?? null,
      gpsBreadcrumbs: [],
    } as any,
  });
};

afterEach(() => {
  useAppStore.getState().resetFlow();
  useAppStore.setState({
    appState: 'IDLE',
    routePreview: null,
    selectedRouteId: null,
    navigationSession: null,
    showRouteFeatures: true,
  });
});

describe('useApproachingRouteFeatures', () => {
  beforeEach(() => {
    useAppStore.setState({ appState: 'IDLE' });
  });

  it('returns empty when not navigating', () => {
    const route = buildRoute([feature()]);
    useAppStore.setState({
      appState: 'IDLE',
      showRouteFeatures: true,
      routePreview: buildPreview(route),
      selectedRouteId: route.id,
    });
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toEqual([]);
    expect(result.current.hiddenCount).toBe(0);
  });

  it('returns empty when showRouteFeatures is off', () => {
    const route = buildRoute([feature({ distanceAlongRouteMeters: 1050 })]);
    arm(route, 1050);
    useAppStore.setState({ showRouteFeatures: false });
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toEqual([]);
  });

  it('surfaces a semafor feature inside its 100m window', () => {
    // Route is 2000m, semafor at 1000m, rider has 1050m remaining → at 950m.
    // 50m ahead of the semafor: within 100m window.
    const route = buildRoute([feature({ distanceAlongRouteMeters: 1000 })]);
    arm(route, 1050);
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toHaveLength(1);
    expect(result.current.visible[0].feature.id).toBe('f1');
    expect(result.current.visible[0].metersAhead).toBeCloseTo(50);
  });

  it('returns empty (no crash) when a hydrated route lacks routeFeatures', () => {
    // Regression: a routePreview persisted by a pre-v0.2.55 build (before
    // route-feature awareness) hydrates without routeFeatures, so the field is
    // `undefined` at runtime despite the type. Previously threw
    // "Cannot read property 'length' of undefined" mid-navigation (Sentry
    // d99b1306). Must now degrade silently to EMPTY.
    const route = buildRoute([feature({ distanceAlongRouteMeters: 1000 })]);
    delete (route as { routeFeatures?: unknown }).routeFeatures;
    arm(route, 1050);
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toEqual([]);
    expect(result.current.hiddenCount).toBe(0);
  });

  it('suppresses alerts while off-route', () => {
    const route = buildRoute([feature({ distanceAlongRouteMeters: 1000 })]);
    arm(route, 1050, { offRouteSince: new Date().toISOString() });
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toEqual([]);
  });

  it('suppresses alerts when GPS accuracy is degraded (>25m)', () => {
    const route = buildRoute([feature({ distanceAlongRouteMeters: 1000 })]);
    arm(route, 1050, { accuracy: 40 });
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toEqual([]);
  });

  it('caps visible alerts at 2 and reports overflow as hiddenCount', () => {
    // Tunnels show at 200m. Spread three tunnels all just ahead of rider.
    const tunnels = [
      feature({ id: 't1', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1010 }),
      feature({ id: 't2', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1030 }),
      feature({ id: 't3', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1060 }),
    ];
    const route = buildRoute(tunnels);
    arm(route, 1000); // rider at 1000m, all three within 200m window.
    const { result } = renderHook(() => useApproachingRouteFeatures());
    expect(result.current.visible).toHaveLength(2);
    expect(result.current.hiddenCount).toBe(1);
    // Closest first.
    expect(result.current.visible.map((v) => v.feature.id)).toEqual(['t1', 't2']);
  });
});
