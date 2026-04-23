import { describe, expect, it, vi, beforeEach } from 'vitest';

import { keyValueStorage } from './storage';
import {
  cacheActiveRoute,
  loadCachedRoute,
  clearCachedRoute,
  type CachedRouteData,
} from './offlineRouteCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'defensivepedal-offline-route';

const makeCachedRoute = (overrides: Partial<CachedRouteData> = {}): CachedRouteData => ({
  routeId: 'route-abc',
  geometry: 'encoded-polyline-6',
  steps: [
    {
      id: 'step-1',
      instruction: 'Head north',
      streetName: 'Main St',
      distanceMeters: 500,
      durationSeconds: 60,
      maneuver: { type: 'depart', modifier: '', location: [26.1, 44.43] },
      mode: 'cycling',
    },
  ],
  distanceMeters: 5000,
  durationSeconds: 1200,
  originLabel: 'Home',
  destinationLabel: 'Work',
  routingMode: 'safe',
  waypoints: [],
  cachedAt: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('offlineRouteCache', () => {
  beforeEach(async () => {
    // Clear storage between tests
    await keyValueStorage.delete(STORAGE_KEY);
  });

  it('round-trips cached route data identically', async () => {
    const route = makeCachedRoute();

    await cacheActiveRoute(route);
    const loaded = await loadCachedRoute();

    expect(loaded).toEqual(route);
  });

  it('returns null when no cached data exists', async () => {
    const loaded = await loadCachedRoute();

    expect(loaded).toBeNull();
  });

  it('returns null after clearing cached data', async () => {
    const route = makeCachedRoute();

    await cacheActiveRoute(route);
    await clearCachedRoute();
    const loaded = await loadCachedRoute();

    expect(loaded).toBeNull();
  });

  it('handles corrupted JSON gracefully (returns null, does not throw)', async () => {
    await keyValueStorage.setString(STORAGE_KEY, '{{not valid json}}');

    const loaded = await loadCachedRoute();

    expect(loaded).toBeNull();
  });

  it('handles structurally invalid data gracefully (returns null, cleans up)', async () => {
    // Valid JSON but missing required fields
    await keyValueStorage.setString(STORAGE_KEY, JSON.stringify({ routeId: 'abc' }));

    const loaded = await loadCachedRoute();

    expect(loaded).toBeNull();
    // Should have cleaned up the invalid entry
    expect(await keyValueStorage.getString(STORAGE_KEY)).toBeNull();
  });

  it('validates routingMode is one of safe | fast | flat', async () => {
    const safeRoute = makeCachedRoute({ routingMode: 'safe' });
    await cacheActiveRoute(safeRoute);
    expect(await loadCachedRoute()).toEqual(safeRoute);

    const fastRoute = makeCachedRoute({ routingMode: 'fast' });
    await cacheActiveRoute(fastRoute);
    expect(await loadCachedRoute()).toEqual(fastRoute);

    const flatRoute = makeCachedRoute({ routingMode: 'flat' });
    await cacheActiveRoute(flatRoute);
    expect(await loadCachedRoute()).toEqual(flatRoute);
  });

  it('rejects invalid routingMode (e.g. turbo) and returns null', async () => {
    // Write raw storage with invalid routingMode to bypass TS types
    const invalidRoute = {
      ...makeCachedRoute(),
      routingMode: 'turbo',
    };
    await keyValueStorage.setString(STORAGE_KEY, JSON.stringify(invalidRoute));

    const loaded = await loadCachedRoute();

    expect(loaded).toBeNull();
    // Should have cleaned up the invalid entry
    expect(await keyValueStorage.getString(STORAGE_KEY)).toBeNull();
  });
});
