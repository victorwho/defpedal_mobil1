import type {
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardResponse,
} from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';
import { useCurrentLocation } from './useCurrentLocation';

const LEADERBOARD_KEY = 'leaderboard';

// ---------------------------------------------------------------------------
// Raw leaderboard data from API
// ---------------------------------------------------------------------------

const useRawLeaderboard = (
  lat: number | null,
  lon: number | null,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
) =>
  useQuery<LeaderboardResponse>({
    queryKey: [LEADERBOARD_KEY, lat, lon, metric, period],
    queryFn: () => mobileApi.fetchLeaderboard(lat!, lon!, metric, period),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------
// Combined hook
// ---------------------------------------------------------------------------

export interface LeaderboardState {
  readonly data: LeaderboardResponse | undefined;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refetch: () => void;
}

export const useLeaderboard = (
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
): LeaderboardState => {
  const { location, permissionStatus } = useCurrentLocation();

  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const leaderboardQuery = useRawLeaderboard(lat, lon, metric, period);

  if (permissionStatus === 'denied') {
    return { data: undefined, isLoading: false, error: null, refetch: () => {} };
  }

  const isLoading = leaderboardQuery.isLoading;

  const error =
    leaderboardQuery.error instanceof Error
      ? leaderboardQuery.error.message
      : null;

  return {
    data: leaderboardQuery.data,
    isLoading,
    error,
    refetch: leaderboardQuery.refetch,
  };
};
