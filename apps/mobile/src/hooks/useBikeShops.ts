import type { Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import {
  fetchBikeShopsNearRoute,
  type BikeShopLocation,
} from '../lib/bicycle-shops';

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes (shops don't change)

/**
 * Fetches bicycle shops/repair from OSM via Overpass API.
 * Only runs when the repair POI category is enabled.
 */
export const useBikeShops = (
  origin: Coordinate | null,
  destination: Coordinate | null,
  enabled: boolean,
): {
  shops: readonly BikeShopLocation[];
  isLoading: boolean;
} => {
  const queryEnabled =
    enabled &&
    origin !== null &&
    destination !== null &&
    origin.lat !== 0 &&
    origin.lon !== 0;

  const query = useQuery({
    queryKey: [
      'bike-shops',
      origin?.lat,
      origin?.lon,
      destination?.lat,
      destination?.lon,
    ],
    queryFn: () => fetchBikeShopsNearRoute(origin!, destination!),
    enabled: queryEnabled,
    staleTime: STALE_TIME_MS,
  });

  return {
    shops: query.data ?? [],
    isLoading: query.isLoading,
  };
};
