import type { NavigationLocationSample } from '@defensivepedal/core';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { keyValueStorage } from './storage';

export const BACKGROUND_NAVIGATION_TASK = 'defensivepedal.background-navigation';

const BACKGROUND_LOCATION_KEY = 'defensivepedal.background-location';
const BACKGROUND_LOCATION_HISTORY_KEY = 'defensivepedal.background-location-history';
const BACKGROUND_STATUS_KEY = 'defensivepedal.background-status';
// Holds the screen-off / process-dead samples until the foreground merges
// them into the trip trail. At ~1 sample / 2 s (timeInterval below), 20
// covered only ~40 s — anything longer overflowed and was lost (review
// 2026-06-12). 1000 covers ~30+ min of locked riding; the JSON stays small
// (~6 numeric fields/sample) and the foreground merge drains it regularly.
const MAX_BACKGROUND_LOCATION_HISTORY = 1000;

export type BackgroundNavigationStatus = {
  status: 'idle' | 'starting' | 'active' | 'error';
  updatedAt: string;
  error?: string | null;
};

const createStatus = (
  status: BackgroundNavigationStatus['status'],
  error?: string | null,
): BackgroundNavigationStatus => ({
  status,
  updatedAt: new Date().toISOString(),
  error: error ?? null,
});

const readJson = async <T>(key: string): Promise<T | null> => {
  const rawValue = await keyValueStorage.getString(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
};

const writeJson = async (key: string, value: unknown): Promise<void> => {
  await keyValueStorage.setString(key, JSON.stringify(value));
};

export const getPersistedNavigationLocation = (): Promise<NavigationLocationSample | null> =>
  readJson<NavigationLocationSample>(BACKGROUND_LOCATION_KEY);

export const getPersistedNavigationLocationHistory = async (): Promise<
  NavigationLocationSample[]
> => (await readJson<NavigationLocationSample[]>(BACKGROUND_LOCATION_HISTORY_KEY)) ?? [];

export const persistNavigationLocationSample = async (
  sample: NavigationLocationSample,
): Promise<void> => persistNavigationLocationSamples([sample]);

/**
 * Append a batch of background samples in a single read-modify-write.
 *
 * The OS can deliver several queued locations per task callback (Doze /
 * deferred updates), so the task must persist EVERY location, not just the
 * last (review 2026-06-12). De-dups against the existing tail by timestamp so
 * a redelivered batch doesn't double-count, and ring-buffers at the cap.
 */
export const persistNavigationLocationSamples = async (
  samples: readonly NavigationLocationSample[],
): Promise<void> => {
  if (samples.length === 0) return;

  // Latest single sample (used by the foreground-resume / diagnostics reads).
  await writeJson(BACKGROUND_LOCATION_KEY, samples[samples.length - 1]);

  const history = await getPersistedNavigationLocationHistory();
  const seen = new Set(history.map((entry) => entry.timestamp));
  const merged = [...history];
  for (const sample of samples) {
    if (seen.has(sample.timestamp)) continue;
    seen.add(sample.timestamp);
    merged.push(sample);
  }

  await writeJson(
    BACKGROUND_LOCATION_HISTORY_KEY,
    merged.slice(-MAX_BACKGROUND_LOCATION_HISTORY),
  );
};

/**
 * Clear the persisted background trail. Called at ride start so a previous
 * ride's samples can't leak into the new trip's breadcrumb merge, and at ride
 * stop once the trail has been drained.
 */
export const clearPersistedNavigationHistory = async (): Promise<void> => {
  await keyValueStorage.delete(BACKGROUND_LOCATION_HISTORY_KEY);
  await keyValueStorage.delete(BACKGROUND_LOCATION_KEY);
};

export const getBackgroundNavigationStatus = async (): Promise<BackgroundNavigationStatus> =>
  (await readJson<BackgroundNavigationStatus>(BACKGROUND_STATUS_KEY)) ?? createStatus('idle');

export const persistBackgroundNavigationStatus = async (
  status: BackgroundNavigationStatus['status'],
  error?: string | null,
): Promise<void> => {
  await writeJson(BACKGROUND_STATUS_KEY, createStatus(status, error));
};

const formatLocationError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Background navigation failed.';

if (!TaskManager.isTaskDefined(BACKGROUND_NAVIGATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_NAVIGATION_TASK, async ({ data, error }) => {
    if (error) {
      await persistBackgroundNavigationStatus('error', error.message);
      return;
    }

    const payload = data as { locations?: Location.LocationObject[] } | undefined;
    const locations = payload?.locations ?? [];

    if (locations.length === 0) {
      return;
    }

    // Persist EVERY location in the batch, not just the last — the OS can
    // deliver several queued fixes per callback under Doze (review 2026-06-12).
    await persistNavigationLocationSamples(
      locations.map((location) => ({
        coordinate: {
          lat: location.coords.latitude,
          lon: location.coords.longitude,
        },
        accuracyMeters: location.coords.accuracy ?? null,
        speedMetersPerSecond: location.coords.speed ?? null,
        heading: location.coords.heading ?? null,
        timestamp: location.timestamp,
      })),
    );
    await persistBackgroundNavigationStatus('active');
  });
}

const ensurePermissions = async () => {
  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  const resolvedForegroundPermission =
    foregroundPermission.status === 'granted'
      ? foregroundPermission
      : await Location.requestForegroundPermissionsAsync();

  if (resolvedForegroundPermission.status !== 'granted') {
    throw new Error('Foreground location permission is required for navigation.');
  }

  const backgroundPermission = await Location.getBackgroundPermissionsAsync();
  const resolvedBackgroundPermission =
    backgroundPermission.status === 'granted'
      ? backgroundPermission
      : await Location.requestBackgroundPermissionsAsync();

  if (resolvedBackgroundPermission.status !== 'granted') {
    throw new Error('Background location permission is required for lock-screen navigation.');
  }
};

export const startBackgroundNavigationUpdates = async () => {
  await persistBackgroundNavigationStatus('starting');

  try {
    await ensurePermissions();

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_NAVIGATION_TASK,
    );

    if (!alreadyStarted) {
      // Fresh ride — drop any leftover trail from a previous ride so the
      // breadcrumb merge can't import stale samples (review 2026-06-12).
      await clearPersistedNavigationHistory();
      await Location.startLocationUpdatesAsync(BACKGROUND_NAVIGATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        activityType: Location.ActivityType.Fitness,
        distanceInterval: 5,
        timeInterval: 2000,
        pausesUpdatesAutomatically: false,
        deferredUpdatesDistance: 0,
        deferredUpdatesInterval: 0,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Defensive Pedal navigation active',
          notificationBody:
            'Tracking your ride so turn-by-turn navigation stays available in the background.',
          // Stop the foreground location service when the user swipes the app
          // away from recents (onTaskRemoved). Without this it defaulted to
          // false, and START_REDELIVER_INTENT restarted the service after
          // process death — leaking the persistent notification + GPS battery
          // drain until reboot (review 2026-06-12). A system kill for memory
          // (task NOT removed) still restarts and resumes the ride.
          killServiceOnDestroy: true,
        },
      });
    }

    await persistBackgroundNavigationStatus('active');
  } catch (error) {
    await persistBackgroundNavigationStatus('error', formatLocationError(error));
    throw error;
  }
};

export const stopBackgroundNavigationUpdates = async () => {
  try {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_NAVIGATION_TASK,
    );

    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_NAVIGATION_TASK);
    }

    await persistBackgroundNavigationStatus('idle');
  } catch (error) {
    await persistBackgroundNavigationStatus('error', formatLocationError(error));
    throw error;
  }
};
