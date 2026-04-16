/**
 * OfflineRouteCache — persists active route data using the project's
 * keyValueStorage (MMKV on device, memory fallback in tests).
 *
 * Separate from the Zustand store to provide a dedicated, lightweight cache
 * for route recovery after app restart during navigation.
 *
 * Excludes elevation and risk segments (acceptable fidelity loss).
 */
import type { NavigationStep } from '@defensivepedal/core';

import { keyValueStorage } from './storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedRouteData {
  readonly routeId: string;
  readonly geometry: string; // encoded polyline6
  readonly steps: readonly NavigationStep[];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly routingMode: 'safe' | 'fast' | 'flat';
  readonly waypoints: readonly { readonly lat: number; readonly lon: number; readonly label: string }[];
  readonly cachedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'defensivepedal-offline-route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isValidCachedRouteData = (data: unknown): data is CachedRouteData => {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const record = data as Record<string, unknown>;

  return (
    typeof record.routeId === 'string' &&
    typeof record.geometry === 'string' &&
    Array.isArray(record.steps) &&
    typeof record.distanceMeters === 'number' &&
    typeof record.durationSeconds === 'number' &&
    typeof record.originLabel === 'string' &&
    typeof record.destinationLabel === 'string' &&
    typeof record.routingMode === 'string' &&
    ['safe', 'fast', 'flat'].includes(record.routingMode as string) &&
    Array.isArray(record.waypoints) &&
    typeof record.cachedAt === 'string'
  );
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronous write (MMKV) wrapped in a Promise for a consistent async API.
 * Callers use `void cacheActiveRoute(...)` so the sync vs async distinction
 * is invisible at the call site.
 */
export async function cacheActiveRoute(data: CachedRouteData): Promise<void> {
  try {
    const json = JSON.stringify(data);
    keyValueStorage.setString(STORAGE_KEY, json);
  } catch {
    // Storage write failed — non-fatal, navigation continues without cache
  }
}

export async function loadCachedRoute(): Promise<CachedRouteData | null> {
  try {
    const json = keyValueStorage.getString(STORAGE_KEY);

    if (json === undefined) {
      return null;
    }

    const parsed: unknown = JSON.parse(json);

    if (!isValidCachedRouteData(parsed)) {
      // Corrupted data — clean up and return null
      keyValueStorage.delete(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    // Parse or read failure — return null, don't throw
    return null;
  }
}

export async function clearCachedRoute(): Promise<void> {
  try {
    keyValueStorage.delete(STORAGE_KEY);
  } catch {
    // Storage removal failed — non-fatal
  }
}
