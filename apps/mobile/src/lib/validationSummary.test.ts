import type { NavigationLocationSample, OfflineRegion } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import {
  summarizeBackgroundMovement,
  summarizeSelectedRouteOfflineReadiness,
} from './validationSummary';

const createLocationSample = (
  lat: number,
  lon: number,
  timestamp: number,
): NavigationLocationSample => ({
  coordinate: { lat, lon },
  timestamp,
  accuracyMeters: 5,
  heading: 180,
  speedMetersPerSecond: 4,
});

const createOfflineRegion = (
  overrides: Partial<OfflineRegion> = {},
): OfflineRegion => ({
  id: 'route-pack-safe-1',
  name: 'Selected route region',
  bbox: [26.08, 44.42, 26.11, 44.45],
  minZoom: 11,
  maxZoom: 16,
  status: 'ready',
  routeId: 'safe-1',
  updatedAt: '2026-03-16T12:00:00.000Z',
  ...overrides,
});

describe('summarizeBackgroundMovement', () => {
  it('returns a zero summary when there are no samples', () => {
    expect(summarizeBackgroundMovement([])).toEqual({
      sampleCount: 0,
      totalDistanceMeters: 0,
      straightLineDistanceMeters: 0,
      durationSeconds: 0,
      movementDetected: false,
      firstTimestamp: null,
      lastTimestamp: null,
    });
  });

  it('detects movement and reports distances across multiple samples', () => {
    const summary = summarizeBackgroundMovement([
      createLocationSample(44.4268, 26.1025, 1710400000000),
      createLocationSample(44.4274, 26.1031, 1710400030000),
      createLocationSample(44.4282, 26.104, 1710400060000),
    ]);

    expect(summary.sampleCount).toBe(3);
    expect(summary.totalDistanceMeters).toBeGreaterThan(150);
    expect(summary.straightLineDistanceMeters).toBeGreaterThan(100);
    expect(summary.durationSeconds).toBe(60);
    expect(summary.movementDetected).toBe(true);
    expect(summary.firstTimestamp).toBe(1710400000000);
    expect(summary.lastTimestamp).toBe(1710400060000);
  });
});

describe('summarizeSelectedRouteOfflineReadiness', () => {
  it('returns not ready when there is no selected route', () => {
    expect(summarizeSelectedRouteOfflineReadiness(null, [createOfflineRegion()])).toEqual({
      selectedRouteId: null,
      matchingRegionCount: 0,
      readyRegionCount: 0,
      isSelectedRouteReady: false,
      latestReadyAt: null,
    });
  });

  it('counts matching regions and the selected route readiness', () => {
    const summary = summarizeSelectedRouteOfflineReadiness('safe-1', [
      createOfflineRegion(),
      createOfflineRegion({
        id: 'route-pack-safe-1-download',
        status: 'downloading',
        updatedAt: '2026-03-16T11:55:00.000Z',
      }),
      createOfflineRegion({
        id: 'route-pack-safe-2',
        routeId: 'safe-2',
      }),
    ]);

    expect(summary).toEqual({
      selectedRouteId: 'safe-1',
      matchingRegionCount: 2,
      readyRegionCount: 1,
      isSelectedRouteReady: true,
      latestReadyAt: '2026-03-16T12:00:00.000Z',
    });
  });
});
