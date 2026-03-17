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

const readJson = <T>(key: string): T | null => {
  const rawValue = keyValueStorage.getString(key);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  keyValueStorage.setString(key, JSON.stringify(value));
};

export const getPersistedNavigationLocation = (): NavigationLocationSample | null =>
  readJson<NavigationLocationSample>(BACKGROUND_LOCATION_KEY);

export const getPersistedNavigationLocationHistory = (): NavigationLocationSample[] =>
  readJson<NavigationLocationSample[]>(BACKGROUND_LOCATION_HISTORY_KEY) ?? [];

export const persistNavigationLocationSample = (sample: NavigationLocationSample) => {
  writeJson(BACKGROUND_LOCATION_KEY, sample);

  const history = getPersistedNavigationLocationHistory();
  const lastSample = history[history.length - 1];
  const nextHistory =
    lastSample?.timestamp === sample.timestamp
      ? history.map((entry, index) => (index === history.length - 1 ? sample : entry))
      : [...history, sample].slice(-MAX_BACKGROUND_LOCATION_HISTORY);

  writeJson(BACKGROUND_LOCATION_HISTORY_KEY, nextHistory);
};

export const getBackgroundNavigationStatus = (): BackgroundNavigationStatus =>
  readJson<BackgroundNavigationStatus>(BACKGROUND_STATUS_KEY) ?? createStatus('idle');

export const persistBackgroundNavigationStatus = (
  status: BackgroundNavigationStatus['status'],
  error?: string | null,
) => {
  writeJson(BACKGROUND_STATUS_KEY, createStatus(status, error));
};

const formatLocationError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Background navigation failed.';

if (!TaskManager.isTaskDefined(BACKGROUND_NAVIGATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_NAVIGATION_TASK, async ({ data, error }) => {
    if (error) {
      persistBackgroundNavigationStatus('error', error.message);
      return;
    }

    const payload = data as { locations?: Location.LocationObject[] } | undefined;
    const lastLocation = payload?.locations?.[payload.locations.length - 1];

    if (!lastLocation) {
      return;
    }

    persistNavigationLocationSample({
      coordinate: {
        lat: lastLocation.coords.latitude,
        lon: lastLocation.coords.longitude,
      },
      accuracyMeters: lastLocation.coords.accuracy ?? null,
      speedMetersPerSecond: lastLocation.coords.speed ?? null,
      heading: lastLocation.coords.heading ?? null,
      timestamp: lastLocation.timestamp,
    });
    persistBackgroundNavigationStatus('active');
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
  persistBackgroundNavigationStatus('starting');

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

    persistBackgroundNavigationStatus('active');
  } catch (error) {
    persistBackgroundNavigationStatus('error', formatLocationError(error));
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

    persistBackgroundNavigationStatus('idle');
  } catch (error) {
    persistBackgroundNavigationStatus('error', formatLocationError(error));
    throw error;
  }
};
