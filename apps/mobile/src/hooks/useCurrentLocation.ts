import type { Coordinate } from '@defensivepedal/core';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

type PermissionStatus = Location.PermissionStatus | 'undetermined';

type CurrentLocationState = {
  location: Coordinate | null;
  accuracyMeters: number | null;
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  error: string | null;
  refreshLocation: () => Promise<void>;
};

const getLocationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to resolve the current location.';

export const useCurrentLocation = (): CurrentLocationState => {
  const [location, setLocation] = useState<Coordinate | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState(true);
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
        setLocation(null);
        setAccuracyMeters(null);
        setError('Location permission is required to use the rider’s current position.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      });
      setAccuracyMeters(position.coords.accuracy ?? null);
    } catch (locationError) {
      setLocation(null);
      setAccuracyMeters(null);
      setError(getLocationErrorMessage(locationError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshLocation();
  }, []);

  return {
    location,
    accuracyMeters,
    permissionStatus,
    isLoading,
    error,
    refreshLocation,
  };
};
