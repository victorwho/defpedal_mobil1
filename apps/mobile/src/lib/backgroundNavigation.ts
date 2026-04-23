import type { NavigationLocationSample } from '@defensivepedal/core';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { keyValueStorage } from './storage';

export const BACKGROUND_NAVIGATION_TASK = 'defensivepedal.background-navigation';

const BACKGROUND_LOCATION_KEY = 'defensivepedal.background-location';
const BACKGROUND_LOCATION_HISTORY_KEY = 'defensivepedal.background-location-history';
const BACKGROUND_STATUS_KEY = 'defensivepedal.background-status';
const MAX_BACKGROUND_LOCATION_HISTORY = 20;

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
): Promise<void> => {
  await writeJson(BACKGROUND_LOCATION_KEY, sample);

  const history = await getPersistedNavigationLocationHistory();
  const lastSample = history[history.length - 1];
  const nextHistory =
    lastSample?.timestamp === sample.timestamp
      ? history.map((entry, index) => (index === history.length - 1 ? sample : entry))
      : [...history, sample].slice(-MAX_BACKGROUND_LOCATION_HISTORY);

  await writeJson(BACKGROUND_LOCATION_HISTORY_KEY, nextHistory);
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
    const lastLocation = payload?.locations?.[payload.locations.length - 1];

    if (!lastLocation) {
      return;
    }

    await persistNavigationLocationSample({
      coordinate: {
        lat: lastLocation.coords.latitude,
        lon: lastLocation.coords.longitude,
      },
      accuracyMeters: lastLocation.coords.accuracy ?? null,
      speedMetersPerSecond: lastLocation.coords.speed ?? null,
      heading: lastLocation.coords.heading ?? null,
      timestamp: lastLocation.timestamp,
    });
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
