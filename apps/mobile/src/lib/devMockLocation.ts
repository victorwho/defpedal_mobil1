import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coordinate } from '@defensivepedal/core';

import { mobileEnv } from './env';

/**
 * Dev/preview-only fake GPS location (Diagnostics > "Fake GPS location").
 *
 * Lets a tester exercise location-dependent behavior — the onboarding region
 * gate, quiz-country resolution, the search country filter, routing coverage
 * dispatch — from any city without an Android mock-location app.
 *
 * PRODUCTION GUARANTEE: every entry point re-checks `mobileEnv.appEnv` at
 * call time. In a production build `getDevMockLocation()` always returns
 * `null` and `setDevMockLocation()` is a no-op, so the feature is inert even
 * though the code ships in the bundle (same runtime-gating pattern as the
 * Diagnostics review-prompt dev hook). Locked by devMockLocation.test.ts —
 * do not remove the production checks.
 *
 * Consumers: `useCurrentLocation` (planning origin, quiz coords, feeds) and
 * `regionGate.detectCountryCode` (onboarding gate). The mocked coordinates
 * flow into the real downstream logic — including the platform reverse
 * geocoder, which resolves any world coordinate regardless of where the
 * device actually is — so the whole pipeline behaves as if the rider were
 * there. Live-navigation GPS (`useForegroundNavigationLocation`) is
 * intentionally NOT mocked: riding simulation is out of scope.
 */

const STORAGE_KEY = 'devMockLocation.v1';

const isProduction = (): boolean => mobileEnv.appEnv === 'production';

let cached: Coordinate | null = null;

const loadFromStorage = async (): Promise<void> => {
  if (isProduction()) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { lat?: unknown; lon?: unknown };
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lon)
    ) {
      cached = { lat: parsed.lat, lon: parsed.lon };
    }
  } catch {
    // Dev tool — a broken persisted value just means "no mock".
  }
};

// Warm the cache at module import (fire-and-forget) so the mock survives an
// app restart and is ready before the first GPS read. GPS consumers run
// after permission checks / provider mounts, well past this microtask.
void loadFromStorage();

/** The active fake location, or `null` when off — ALWAYS `null` in production. */
export const getDevMockLocation = (): Coordinate | null =>
  isProduction() ? null : cached;

/** Set (or clear with `null`) the fake location. No-op in production. */
export const setDevMockLocation = async (coord: Coordinate | null): Promise<void> => {
  if (isProduction()) return;
  cached = coord;
  try {
    if (coord) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(coord));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Persistence is best-effort; the in-memory value still applies.
  }
};

/** Test hook — module-level cache would otherwise leak between tests. */
export const resetDevMockLocationForTests = (): void => {
  cached = null;
};
