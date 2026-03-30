import type { Coordinate, NearbyHazard } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

const REFETCH_INTERVAL_MS = 60_000; // re-fetch every 60 seconds
const STALE_TIME_MS = 30_000;
const RADIUS_METERS = 1000;

/**
 * Fetches nearby hazards from the API, refetching periodically during navigation.
 * Only active when `enabled` is true (i.e., navigation is in progress).
 */
export const useNearbyHazards = (
  userCoordinate: Coordinate | null,
  enabled: boolean,
  radiusMeters: number = RADIUS_METERS,
): {
  hazards: readonly NearbyHazard[];
  isLoading: boolean;
} => {
  const query = useQuery({
    queryKey: [
      'nearby-hazards',
      userCoordinate?.lat.toFixed(3),
      userCoordinate?.lon.toFixed(3),
      radiusMeters,
    ],
    queryFn: () =>
      mobileApi.getNearbyHazards(
        userCoordinate!.lat,
        userCoordinate!.lon,
        radiusMeters,
      ),
    enabled: enabled && userCoordinate !== null,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  return {
    hazards: query.data ?? [],
    isLoading: query.isLoading,
  };
};
