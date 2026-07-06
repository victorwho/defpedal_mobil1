import type { CityHeartbeat } from '@defensivepedal/core';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';
import { useAppStore } from '../store/appStore';
import { useCurrentLocation } from './useCurrentLocation';

const HEARTBEAT_KEY = 'city-heartbeat';
const LOCALITY_KEY = 'reverse-geocode-locality';

// ---------------------------------------------------------------------------
// Locality name (cached 10 min — city doesn't change often)
// ---------------------------------------------------------------------------

const useLocalityName = (lat: number | null, lon: number | null) =>
  useQuery<string | null>({
    queryKey: [LOCALITY_KEY, lat, lon],
    queryFn: () => mobileApi.reverseGeocodeLocality(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 10 * 60_000,
  });

// ---------------------------------------------------------------------------
// Raw heartbeat data from API
// ---------------------------------------------------------------------------

const useRawHeartbeat = (lat: number | null, lon: number | null, placeholder: CityHeartbeat | null) =>
  useQuery<CityHeartbeat>({
    queryKey: [HEARTBEAT_KEY, lat, lon],
    queryFn: () => mobileApi.getCityHeartbeat(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60_000,
    placeholderData: placeholder ?? undefined,
  });

// ---------------------------------------------------------------------------
// Combined hook
// ---------------------------------------------------------------------------

export interface CityHeartbeatState {
  readonly heartbeat: CityHeartbeat | null;
  readonly isLoading: boolean;
  /** True when showing cached data while a fresh fetch is in-flight */
  readonly isRefreshing: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

export const useCityHeartbeat = (): CityHeartbeatState => {
  const { location, permissionStatus } = useCurrentLocation();
  const cachedCityHeartbeat = useAppStore((s) => s.cachedCityHeartbeat);
  const setCachedCityHeartbeat = useAppStore((s) => s.setCachedCityHeartbeat);

  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const localityQuery = useLocalityName(lat, lon);
  const heartbeatQuery = useRawHeartbeat(lat, lon, cachedCityHeartbeat);

  // Persist fresh (non-placeholder) data to the store so the next open shows
  // it immediately instead of a blank spinner.
  useEffect(() => {
    if (heartbeatQuery.data && !heartbeatQuery.isPlaceholderData) {
      setCachedCityHeartbeat(heartbeatQuery.data);
    }
  }, [heartbeatQuery.data, heartbeatQuery.isPlaceholderData, setCachedCityHeartbeat]);

  if (permissionStatus === 'denied') {
    return { heartbeat: null, isLoading: false, isRefreshing: false, error: null, refetch: () => {} };
  }

  // isLoading is only true on the very first fetch (no data at all yet).
  // isRefreshing is true when showing cached/placeholder data while re-fetching.
  const isLoading = localityQuery.isLoading || heartbeatQuery.isLoading;
  const isRefreshing =
    !isLoading &&
    heartbeatQuery.isFetching &&
    (heartbeatQuery.isPlaceholderData || !!heartbeatQuery.data);

  const error =
    localityQuery.error instanceof Error
      ? localityQuery.error.message
      : heartbeatQuery.error instanceof Error
        ? heartbeatQuery.error.message
        : null;

  if (!heartbeatQuery.data) {
    return { heartbeat: null, isLoading, isRefreshing, error, refetch: heartbeatQuery.refetch };
  }

  const heartbeat: CityHeartbeat = {
    ...heartbeatQuery.data,
    localityName: localityQuery.data ?? heartbeatQuery.data.localityName,
  };

  return { heartbeat, isLoading, isRefreshing, error, refetch: heartbeatQuery.refetch };
};
