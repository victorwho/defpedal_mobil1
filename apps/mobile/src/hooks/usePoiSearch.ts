import type { Coordinate } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchPoiSearchResults, type SearchedPoi } from '../lib/poi-search';

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes
const GC_TIME_MS = 15 * 60 * 1000; // 15 minutes

type PoiVisibility = {
  hydration: boolean;
  repair: boolean;
  restroom: boolean;
  bikeRental: boolean;
  bikeParking: boolean;
  supplies: boolean;
};

/**
 * Fetches POIs from Mapbox Search Box API for all enabled categories.
 * Each category is a separate query so toggling one doesn't refetch others.
 * Results are combined into a single flat array for rendering.
 */
export const usePoiSearch = (
  origin: Coordinate | null,
  destination: Coordinate | null,
  visibility: PoiVisibility | undefined,
): {
  searchedPois: readonly SearchedPoi[];
  isLoading: boolean;
} => {
  const originKey = origin ? `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}` : 'null';
  const destKey = destination ? `${destination.lat.toFixed(3)},${destination.lon.toFixed(3)}` : 'null';

  const hydration = useQuery({
    queryKey: ['poi-search', 'hydration', originKey, destKey],
    queryFn: () => fetchPoiSearchResults('hydration', origin, destination),
    enabled: visibility?.hydration ?? false,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });

  const supplies = useQuery({
    queryKey: ['poi-search', 'supplies', originKey, destKey],
    queryFn: () => fetchPoiSearchResults('supplies', origin, destination),
    enabled: visibility?.supplies ?? false,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  });

  const searchedPois = useMemo(
    () => [
      ...(hydration.data ?? []),
      ...(supplies.data ?? []),
    ],
    [hydration.data, supplies.data],
  );

  const isLoading =
    (visibility?.hydration && hydration.isLoading) ||
    (visibility?.supplies && supplies.isLoading) ||
    false;

  return { searchedPois, isLoading };
};
