import type { Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import {
  fetchBicycleRentalNearRoute,
  type BicycleRentalLocation,
} from '../lib/bicycle-rental';

const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches bicycle rental locations near the route via the Overpass API.
 * Data is cached for 5 minutes per origin/destination pair.
 */
export const useBicycleRental = (
  origin: Coordinate | null,
  destination: Coordinate | null,
): {
  rentalLocations: readonly BicycleRentalLocation[];
  isLoading: boolean;
} => {
  const enabled = origin !== null && destination !== null;

  const query = useQuery({
    queryKey: [
      'bicycle-rental',
      origin?.lat,
      origin?.lon,
      destination?.lat,
      destination?.lon,
    ],
    queryFn: async () => {
      // Small delay to avoid Overpass API rate limiting when parking query fires simultaneously
      await new Promise((r) => setTimeout(r, 1500));
      return fetchBicycleRentalNearRoute(origin!, destination!);
    },
    enabled,
    staleTime: STALE_TIME_MS,
    retry: 2,
  });

  return {
    rentalLocations: query.data ?? [],
    isLoading: query.isLoading,
  };
};
