import type { NavigationLocationSample } from '@defensivepedal/core';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import {
  getPersistedNavigationLocation,
  persistNavigationLocationSample,
} from '../lib/backgroundNavigation';

type PermissionStatus = Location.PermissionStatus | 'undetermined';

type ForegroundNavigationLocationState = {
  sample: NavigationLocationSample | null;
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  error: string | null;
  refreshLocation: () => Promise<void>;
};

const getLocationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to resolve the rider location.';

const toNavigationSample = (position: Location.LocationObject): NavigationLocationSample => ({
  coordinate: {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
  },
  accuracyMeters: position.coords.accuracy ?? null,
  speedMetersPerSecond: position.coords.speed ?? null,
  heading: position.coords.heading ?? null,
  timestamp: position.timestamp,
});

export const useForegroundNavigationLocation = (
  enabled: boolean,
): ForegroundNavigationLocationState => {
  const [sample, setSample] = useState<NavigationLocationSample | null>(
    getPersistedNavigationLocation(),
  );
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refreshLocation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const nextPermission =
        currentPermission.status === 'granted'
          ? currentPermission
          : await Location.requestForegroundPermissionsAsync();

      setPermissionStatus(nextPermission.status);

      if (nextPermission.status !== 'granted') {
        setSample(null);
        setError('Location permission is required for live navigation updates.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const nextSample = toNavigationSample(position);
      setSample(nextSample);
      persistNavigationLocationSample(nextSample);
    } catch (locationError) {
      setError(getLocationErrorMessage(locationError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let subscription: Location.LocationSubscription | null = null;

    if (!enabled) {
      setIsLoading(false);
      return () => {
        subscription?.remove();
      };
    }

    const startWatching = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const currentPermission = await Location.getForegroundPermissionsAsync();
        const nextPermission =
          currentPermission.status === 'granted'
            ? currentPermission
            : await Location.requestForegroundPermissionsAsync();

        if (!isMounted) {
          return;
        }

        setPermissionStatus(nextPermission.status);

        if (nextPermission.status !== 'granted') {
          setSample(null);
          setError('Location permission is required for live navigation updates.');
          setIsLoading(false);
          return;
        }

        const initialPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });

        if (!isMounted) {
          return;
        }

        setSample(toNavigationSample(initialPosition));
        persistNavigationLocationSample(toNavigationSample(initialPosition));
        setIsLoading(false);

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            distanceInterval: 5,
            timeInterval: 2000,
            mayShowUserSettingsDialog: true,
          },
          (position) => {
            if (!isMounted) {
              return;
            }

            const nextSample = toNavigationSample(position);
            setSample(nextSample);
            persistNavigationLocationSample(nextSample);
            setError(null);
            setIsLoading(false);
          },
        );
      } catch (locationError) {
        if (!isMounted) {
          return;
        }

        setError(getLocationErrorMessage(locationError));
        setIsLoading(false);
      }
    };

    void startWatching();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [enabled]);

  return {
    sample,
    permissionStatus,
    isLoading,
    error,
    refreshLocation,
  };
};
