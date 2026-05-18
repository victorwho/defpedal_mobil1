import { describe, expect, it } from 'vitest';

import type { RouteFeature, NearbyHazard } from './contracts';
import {
  HAZARD_DEDUP_RADIUS_METERS,
  MAX_VISIBLE_FEATURE_ALERTS,
  ROUTE_FEATURE_ALERT_CONFIG,
  computeApproachingFeatures,
  dedupeRouteFeaturesAgainstHazards,
} from './routeFeatures';

const makeFeature = (overrides: Partial<RouteFeature> = {}): RouteFeature => ({
  id: 'route-0-feature-semafor-0',
  type: 'semafor',
  tier: 'caution',
  lat: 44.43,
  lon: 26.1,
  distanceAlongRouteMeters: 100,
  lengthMeters: null,
  ...overrides,
});

const makeHazard = (overrides: Partial<NearbyHazard> = {}): NearbyHazard => ({
  id: 'haz-1',
  lat: 44.43,
  lon: 26.1,
  hazardType: 'dangerous_intersection',
  createdAt: '2026-01-01T00:00:00Z',
  confirmCount: 1,
  denyCount: 0,
  score: 1,
  userVote: null,
  expiresAt: '2026-02-01T00:00:00Z',
  lastConfirmedAt: null,
  description: null,
  ...overrides,
});

describe('dedupeRouteFeaturesAgainstHazards', () => {
  it('returns all features when there are no hazards', () => {
    const features = [makeFeature(), makeFeature({ id: 'f2', lat: 44.44 })];
    expect(dedupeRouteFeaturesAgainstHazards(features, [])).toEqual(features);
  });

  it('returns an empty array when there are no features', () => {
    expect(dedupeRouteFeaturesAgainstHazards([], [makeHazard()])).toEqual([]);
  });

  it('drops a feature with a hazard at the exact same coordinate', () => {
    const feature = makeFeature();
    const hazard = makeHazard({ lat: feature.lat, lon: feature.lon });
    expect(dedupeRouteFeaturesAgainstHazards([feature], [hazard])).toEqual([]);
  });

  it('keeps a feature whose nearest hazard is just outside the radius', () => {
    const feature = makeFeature();
    // ~30m east at this latitude — outside the 25m default.
    const hazard = makeHazard({ lat: feature.lat, lon: feature.lon + 0.0004 });
    const result = dedupeRouteFeaturesAgainstHazards([feature], [hazard]);
    expect(result).toHaveLength(1);
  });

  it('drops a feature whose nearest hazard is inside the radius', () => {
    const feature = makeFeature();
    // ~10m east at this latitude — inside the 25m default.
    const hazard = makeHazard({ lat: feature.lat, lon: feature.lon + 0.00013 });
    expect(dedupeRouteFeaturesAgainstHazards([feature], [hazard])).toEqual([]);
  });

  it('honours a custom radius', () => {
    const feature = makeFeature();
    // ~30m east — outside default 25m but inside an explicit 50m.
    const hazard = makeHazard({ lat: feature.lat, lon: feature.lon + 0.0004 });
    expect(dedupeRouteFeaturesAgainstHazards([feature], [hazard], 50)).toEqual([]);
  });

  it('preserves input order for features that survive dedup', () => {
    const features = [
      makeFeature({ id: 'a', lat: 44.43, lon: 26.10 }),
      makeFeature({ id: 'b', lat: 44.44, lon: 26.11 }),
      makeFeature({ id: 'c', lat: 44.45, lon: 26.12 }),
    ];
    const hazards = [makeHazard({ lat: 44.44, lon: 26.11 })];
    const result = dedupeRouteFeaturesAgainstHazards(features, hazards);
    expect(result.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('exposes a default radius constant', () => {
    expect(HAZARD_DEDUP_RADIUS_METERS).toBe(25);
  });
});

describe('ROUTE_FEATURE_ALERT_CONFIG', () => {
  it('configures every route-feature type', () => {
    for (const type of [
      'tunnel',
      'bridge',
      'semafor',
      'left_turn_no_intersection',
      'railway_crossing',
    ] as const) {
      expect(ROUTE_FEATURE_ALERT_CONFIG[type]).toBeDefined();
    }
  });

  it('escalates warning-tier features to assertive a11y live regions', () => {
    expect(ROUTE_FEATURE_ALERT_CONFIG.left_turn_no_intersection.a11yLiveRegion).toBe('assertive');
    expect(ROUTE_FEATURE_ALERT_CONFIG.railway_crossing.a11yLiveRegion).toBe('assertive');
  });

  it('keeps tunnel silent (no haptic, polite a11y)', () => {
    expect(ROUTE_FEATURE_ALERT_CONFIG.tunnel.haptic).toBe(false);
    expect(ROUTE_FEATURE_ALERT_CONFIG.tunnel.a11yLiveRegion).toBe('polite');
  });

  it('triggers railway alerts furthest out (≥150m) due to safety-critical stop', () => {
    expect(ROUTE_FEATURE_ALERT_CONFIG.railway_crossing.showAtMeters).toBeGreaterThanOrEqual(150);
  });
});

describe('computeApproachingFeatures', () => {
  const baseFeature = (overrides: Partial<RouteFeature> = {}): RouteFeature => ({
    id: 'f1',
    type: 'semafor',
    tier: 'caution',
    lat: 44.43,
    lon: 26.1,
    distanceAlongRouteMeters: 1000,
    lengthMeters: null,
    ...overrides,
  });

  it('returns empty array when route has no features', () => {
    expect(computeApproachingFeatures([], 100)).toEqual([]);
  });

  it('hides features further away than the type-specific show distance', () => {
    // Semafor shows at 100m. Rider at 800m, feature at 1000m → 200m ahead → hidden.
    const feature = baseFeature({ distanceAlongRouteMeters: 1000 });
    expect(computeApproachingFeatures([feature], 800)).toEqual([]);
  });

  it('reveals a semafor feature once within 100m', () => {
    // Rider at 950m, semafor at 1000m → 50m ahead → visible.
    const feature = baseFeature({ distanceAlongRouteMeters: 1000 });
    const result = computeApproachingFeatures([feature], 950);
    expect(result).toHaveLength(1);
    expect(result[0].metersAhead).toBeCloseTo(50);
  });

  it('keeps a feature visible until the rider is past the dismiss buffer', () => {
    // Tunnel shows at 200m, dismisses 10m past. Rider 5m past → still visible.
    const feature = baseFeature({ type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1000 });
    const result = computeApproachingFeatures([feature], 1005);
    expect(result).toHaveLength(1);
    expect(result[0].metersAhead).toBeCloseTo(-5);
  });

  it('dismisses a feature once past the dismiss buffer', () => {
    const feature = baseFeature({ type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1000 });
    expect(computeApproachingFeatures([feature], 1015)).toEqual([]);
  });

  it('sorts approaching features by absolute distance, closest first', () => {
    const features = [
      baseFeature({ id: 'far', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1180 }),  // tunnel shows at 200m, 180m ahead
      baseFeature({ id: 'near', type: 'semafor', tier: 'caution', distanceAlongRouteMeters: 1030 }), // 30m ahead
      baseFeature({ id: 'just_passed', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 995 }), // 5m past
    ];
    const result = computeApproachingFeatures(features, 1000);
    expect(result.map((r) => r.feature.id)).toEqual(['just_passed', 'near', 'far']);
  });

  it('honours per-type show distances independently', () => {
    // Tunnel at 195m ahead (within tunnel's 200m window).
    // Semafor at 195m ahead (outside semafor's 100m window).
    const features = [
      baseFeature({ id: 'tunnel', type: 'tunnel', tier: 'info', distanceAlongRouteMeters: 1195 }),
      baseFeature({ id: 'semafor', type: 'semafor', tier: 'caution', distanceAlongRouteMeters: 1195 }),
    ];
    const result = computeApproachingFeatures(features, 1000);
    expect(result.map((r) => r.feature.id)).toEqual(['tunnel']);
  });

  it('exposes a visible-count cap constant', () => {
    expect(MAX_VISIBLE_FEATURE_ALERTS).toBe(2);
  });
});
