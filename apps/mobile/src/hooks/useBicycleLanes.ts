import type { Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import {
  fetchBicycleLanesNearRoute,
  type BicycleLaneSegment,
} from '../lib/bicycle-lanes';

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes — lanes don't change

/**
 * Fetches bicycle lane geometries near the route via the Overpass API.
 * Returns LineString segments for rendering on the map.
 */
export const useBicycleLanes = (
  origin: Coordinate | null,
  destination: Coordinate | null,
): {
  laneSegments: readonly BicycleLaneSegment[];
  isLoading: boolean;
} => {
  const enabled =
    origin !== null &&
    destination !== null &&
    origin.lat !== 0 &&
    origin.lon !== 0 &&
    destination.lat !== 0 &&
    destination.lon !== 0;

  const query = useQuery({
    queryKey: [
      'bicycle-lanes',
      origin?.lat,
      origin?.lon,
      destination?.lat,
      destination?.lon,
    ],
    queryFn: () => fetchBicycleLanesNearRoute(origin!, destination!),
    enabled,
    staleTime: STALE_TIME_MS,
  });

  return {
    laneSegments: query.data ?? [],
    isLoading: query.isLoading,
  };
};
