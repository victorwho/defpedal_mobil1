import type { CityHeartbeat } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';
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

const useRawHeartbeat = (lat: number | null, lon: number | null) =>
  useQuery<CityHeartbeat>({
    queryKey: [HEARTBEAT_KEY, lat, lon],
    queryFn: () => mobileApi.getCityHeartbeat(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------
// Combined hook
// ---------------------------------------------------------------------------

export interface CityHeartbeatState {
  readonly heartbeat: CityHeartbeat | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

export const useCityHeartbeat = (): CityHeartbeatState => {
  const { location, permissionStatus } = useCurrentLocation();

  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const localityQuery = useLocalityName(lat, lon);
  const heartbeatQuery = useRawHeartbeat(lat, lon);

  if (permissionStatus === 'denied') {
    return { heartbeat: null, isLoading: false, error: null, refetch: () => {} };
  }

  const isLoading = localityQuery.isLoading || heartbeatQuery.isLoading;

  const error =
    localityQuery.error instanceof Error
      ? localityQuery.error.message
      : heartbeatQuery.error instanceof Error
        ? heartbeatQuery.error.message
        : null;

  if (!heartbeatQuery.data) {
    return { heartbeat: null, isLoading, error, refetch: heartbeatQuery.refetch };
  }

  const heartbeat: CityHeartbeat = {
    ...heartbeatQuery.data,
    localityName: localityQuery.data ?? heartbeatQuery.data.localityName,
  };

  return { heartbeat, isLoading, error, refetch: heartbeatQuery.refetch };
};
