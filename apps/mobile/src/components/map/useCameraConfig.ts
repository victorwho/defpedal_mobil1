import type { Coordinate } from '@defensivepedal/core';
import { useMemo } from 'react';
import { DEFAULT_CENTER } from './constants';
import type { DecodedRoute } from './types';

type UseCameraConfigParams = {
  recenterKey: number;
  userLocation?: Coordinate | null;
  followUser: boolean;
  selectedRoute: DecodedRoute | null;
  trailCoordinates?: readonly [number, number][];
  destination?: Coordinate;
};

/**
 * Derives the camera center coordinate based on follow state,
 * selected route, trail midpoint, and destination.
 */
export const useCameraConfig = ({
  recenterKey,
  userLocation,
  followUser,
  selectedRoute,
  trailCoordinates,
  destination,
}: UseCameraConfigParams): [number, number] => {
  const trailMidpoint = useMemo<[number, number] | null>(() => {
    if (!trailCoordinates || trailCoordinates.length < 2) return null;
    const mid = trailCoordinates[Math.floor(trailCoordinates.length / 2)];
    return mid ?? null;
  }, [trailCoordinates]);

  const cameraCoordinate =
    recenterKey > 0 && userLocation
      ? ([userLocation.lon, userLocation.lat] as [number, number])
      : followUser && userLocation
        ? ([userLocation.lon, userLocation.lat] as [number, number])
        : selectedRoute?.coordinates[Math.floor(selectedRoute.coordinates.length / 2)] ??
          trailMidpoint ??
          (destination ? ([destination.lon, destination.lat] as [number, number]) : null) ??
          (userLocation ? ([userLocation.lon, userLocation.lat] as [number, number]) : null) ??
          DEFAULT_CENTER;

  return cameraCoordinate;
};
