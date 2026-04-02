import type { CommunityStats } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';
import { useCurrentLocation } from './useCurrentLocation';

const LOCALITY_KEY = 'reverse-geocode-locality';
const COMMUNITY_STATS_KEY = 'community-stats';

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
// Community stats from API
// ---------------------------------------------------------------------------

const useRawCommunityStats = (lat: number | null, lon: number | null) =>
  useQuery<CommunityStats>({
    queryKey: [COMMUNITY_STATS_KEY, lat, lon],
    queryFn: () => mobileApi.getCommunityStats(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------
// Combined hook
// ---------------------------------------------------------------------------

type CommunityStatsState = {
  stats: CommunityStats | null;
  isLoading: boolean;
  error: string | null;
};

export const useCommunityStats = (): CommunityStatsState => {
  const { location, permissionStatus } = useCurrentLocation();

  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const localityQuery = useLocalityName(lat, lon);
  const statsQuery = useRawCommunityStats(lat, lon);

  // Location permission denied — return graceful fallback
  if (permissionStatus === 'denied') {
    return { stats: null, isLoading: false, error: null };
  }

  const isLoading = localityQuery.isLoading || statsQuery.isLoading;

  const error =
    localityQuery.error instanceof Error
      ? localityQuery.error.message
      : statsQuery.error instanceof Error
        ? statsQuery.error.message
        : null;

  if (!statsQuery.data) {
    return { stats: null, isLoading, error };
  }

  const stats: CommunityStats = {
    ...statsQuery.data,
    localityName: localityQuery.data ?? statsQuery.data.localityName,
  };

  return { stats, isLoading, error };
};
