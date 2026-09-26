/**
 * useCurrentLocation — ONE shared GPS read, shared by every consumer.
 *
 * ⚠️ This hook is mounted from 13 places (7 hooks plus 6 screens), and it used
 * to hold per-instance state: each instance ran its own
 * `getForegroundPermissionsAsync`, possibly its own
 * `requestForegroundPermissionsAsync`, and its own `getCurrentPositionAsync` on
 * mount. A screen that composes several of these hooks therefore woke the GPS
 * several times over for one answer — and asked the OS for permission several
 * times over, which is the part a rider can actually see.
 *
 * Two mechanisms, because they cover different cases:
 *
 *   * IN-FLIGHT COALESCING. Concurrent callers share one promise, so N hooks
 *     mounting in the same tick produce exactly one permission check and one
 *     position read. This is the storm the defect was about.
 *   * A SHORT FRESHNESS WINDOW. A consumer mounting within
 *     `FRESH_FOR_MS` of the last successful fix reuses it instead of waking the
 *     GPS again. Deliberately short: this hook is a "where am I roughly"
 *     source — turn-by-turn uses `useForegroundNavigationLocation`, which keeps
 *     its own continuous watch — so a rider who has genuinely moved still gets
 *     a new fix on the next screen, and `refreshLocation()` always forces one.
 *
 * The public shape is unchanged, so no call site needed touching.
 *
 * A consequence worth knowing: because a remount no longer re-reads GPS, the
 * location-keyed TanStack query keys stop churning. `useActivityFeed` rounds its
 * key for the same reason and its cross-key cache lookup stays as the belt to
 * this braces.
 */
import type { Coordinate } from '@defensivepedal/core';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { getDevMockLocation } from '../lib/devMockLocation';

type PermissionStatus = Location.PermissionStatus | 'undetermined';

type CurrentLocationState = {
  location: Coordinate | null;
  accuracyMeters: number | null;
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  error: string | null;
  refreshLocation: () => Promise<void>;
};

type SharedSnapshot = {
  location: Coordinate | null;
  accuracyMeters: number | null;
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  error: string | null;
};

const getLocationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to resolve the current location.';

/** How long a successful fix may be reused by a newly mounted consumer. */
const FRESH_FOR_MS = 15_000;

/**
 * How long an in-flight read may absorb further callers.
 *
 * ⚠️ This bound is the whole reason coalescing is safe. A read can hang
 * indefinitely and legitimately — `requestForegroundPermissionsAsync` waits on a
 * human, and `getCurrentPositionAsync` can sit indoors for a long time — so
 * sharing a promise with no expiry would let ONE stuck read wedge the location
 * source for every consumer for the rest of the session, with `refreshLocation()`
 * handing back the same dead promise. That is strictly worse than the
 * per-instance behaviour this replaced. Simultaneous mounts are milliseconds
 * apart, so a few seconds is all the coalescing ever needs.
 */
const COALESCE_WINDOW_MS = 5_000;

// ---- Module-level shared state ---------------------------------------------

const INITIAL: SharedSnapshot = {
  location: null,
  accuracyMeters: null,
  permissionStatus: 'undetermined',
  isLoading: true,
  error: null,
};

let snapshot: SharedSnapshot = INITIAL;
let resolvedAt = 0;
let inFlight: Promise<void> | null = null;
let inFlightStartedAt = 0;
const subscribers = new Set<(next: SharedSnapshot) => void>();

const publish = (next: SharedSnapshot): void => {
  snapshot = next;
  // Copied before iterating: a subscriber that unmounts in response to a new
  // value would otherwise mutate the set mid-iteration.
  for (const notify of [...subscribers]) notify(next);
};

const readLocation = async (): Promise<void> => {
  publish({ ...snapshot, isLoading: true, error: null });

  // Dev/preview-only fake GPS (Diagnostics > Fake GPS location). Returns null
  // on production builds — see lib/devMockLocation.ts.
  const mock = getDevMockLocation();
  if (mock) {
    resolvedAt = Date.now();
    publish({
      location: mock,
      accuracyMeters: 5,
      permissionStatus: 'granted' as Location.PermissionStatus,
      isLoading: false,
      error: null,
    });
    return;
  }

  try {
    const currentPermission = await Location.getForegroundPermissionsAsync();
    const nextPermission =
      currentPermission.status === 'granted'
        ? currentPermission
        : await Location.requestForegroundPermissionsAsync();

    if (nextPermission.status !== 'granted') {
      publish({
        location: null,
        accuracyMeters: null,
        permissionStatus: nextPermission.status,
        isLoading: false,
        error: 'Location permission is required to use the rider’s current position.',
      });
      return;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    resolvedAt = Date.now();
    publish({
      location: {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      },
      accuracyMeters: position.coords.accuracy ?? null,
      permissionStatus: nextPermission.status,
      isLoading: false,
      error: null,
    });
  } catch (locationError) {
    publish({
      location: null,
      accuracyMeters: null,
      permissionStatus: snapshot.permissionStatus,
      isLoading: false,
      error: getLocationErrorMessage(locationError),
    });
  }
};

/**
 * Resolve the location, sharing any read already running.
 *
 * `force` is what `refreshLocation()` passes — an explicit refresh must never be
 * answered from the freshness window, or a pull-to-refresh would do nothing.
 */
const resolveShared = (force: boolean): Promise<void> => {
  if (inFlight && Date.now() - inFlightStartedAt < COALESCE_WINDOW_MS) return inFlight;

  if (
    !force &&
    snapshot.location !== null &&
    Date.now() - resolvedAt < FRESH_FOR_MS &&
    !getDevMockLocation()
  ) {
    return Promise.resolve();
  }

  inFlightStartedAt = Date.now();
  const started = readLocation().finally(() => {
    // Only clear if this read is still the current one. A read that outlived the
    // coalesce window has been superseded, and must not clear its successor.
    if (inFlight === started) inFlight = null;
  });
  inFlight = started;
  return started;
};

/** Test-only: drop the shared fix so each test starts from nothing. */
export const __resetCurrentLocationForTests = (): void => {
  snapshot = INITIAL;
  resolvedAt = 0;
  inFlight = null;
  inFlightStartedAt = 0;
  subscribers.clear();
};

export const useCurrentLocation = (): CurrentLocationState => {
  const [state, setState] = useState<SharedSnapshot>(snapshot);

  useEffect(() => {
    const notify = (next: SharedSnapshot) => setState(next);
    subscribers.add(notify);
    // Adopt whatever is already known before any await — a consumer mounting
    // beside an in-flight read should not render as if nothing were happening.
    setState(snapshot);
    void resolveShared(false);

    return () => {
      subscribers.delete(notify);
    };
  }, []);

  return {
    ...state,
    refreshLocation: () => resolveShared(true),
  };
};
