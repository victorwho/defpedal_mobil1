import type { Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import {
  fetchBicycleParkingNearRoute,
  type BicycleParkingLocation,
} from '../lib/bicycle-parking';

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
const GC_TIME_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches bicycle parking locations near the route via the Overpass API.
 * Data is cached for 5 minutes per origin/destination pair.
 */
export const useBicycleParking = (
  origin: Coordinate | null,
  destination: Coordinate | null,
): {
  parkingLocations: readonly BicycleParkingLocation[];
  isLoading: boolean;
} => {
  const enabled = origin !== null && destination !== null;

  const query = useQuery({
    queryKey: [
      'bicycle-parking',
      origin?.lat,
      origin?.lon,
      destination?.lat,
      destination?.lon,
    ],
    queryFn: () =>
      fetchBicycleParkingNearRoute(origin!, destination!),
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });

  return {
    parkingLocations: query.data ?? [],
    isLoading: query.isLoading,
  };
};
