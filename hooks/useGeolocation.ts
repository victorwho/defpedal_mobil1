
import { useState, useEffect, useRef } from 'react';
import type { GeolocationCoordinates } from '../types';

export const useGeolocation = (isWatching: boolean) => {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setLocation(position.coords);
      setError(null);
    };

    const handleError = (error: GeolocationPositionError) => {
      setError(`Error getting location: ${error.message}`);
    };

    if (isWatching) {
      // Start watching position
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      // Get a single position update
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy: true }
      );
      // And clear any existing watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      // Cleanup: clear watch when component unmounts or isWatching becomes false
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isWatching]);

  return { location, error };
};
