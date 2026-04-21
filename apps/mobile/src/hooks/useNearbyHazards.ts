import type { Coordinate, NearbyHazard } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import { mobileApi } from '../lib/api';
import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useAppStore } from '../store/appStore';

const REFETCH_INTERVAL_MS = 60_000; // re-fetch every 60 seconds
const STALE_TIME_MS = 30_000;
const RADIUS_METERS = 1000;

/**
 * Fetches nearby hazards from the API, refetching periodically during navigation.
 * Query key is user-scoped (`['nearby-hazards', userId, …]`) to prevent the
 * caller-specific `userVote` from leaking across accounts on sign-out + sign-in
 * (error-log #30). Client-side `expires_at` filter is defense-in-depth over the
 * server's WHERE clause. Local `userHazardVotes` overlay keeps an offline vote
 * visible until the queue drains and the next refetch confirms server state.
 */
export const useNearbyHazards = (
  userCoordinate: Coordinate | null,
  enabled: boolean,
  radiusMeters: number = RADIUS_METERS,
): {
  hazards: readonly NearbyHazard[];
  isLoading: boolean;
} => {
  const auth = useAuthSessionOptional();
  const userId = auth?.user?.id ?? null;

  const userHazardVotes = useAppStore(
    useShallow((state) => state.userHazardVotes),
  );

  const query = useQuery({
    queryKey: [
      'nearby-hazards',
      userId,
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

  const hazards = useMemo<readonly NearbyHazard[]>(() => {
    const raw = query.data ?? [];
    const now = Date.now();
    return raw.reduce<NearbyHazard[]>((acc, hazard) => {
      const expiresMs = hazard.expiresAt ? Date.parse(hazard.expiresAt) : 0;
      if (!expiresMs || expiresMs <= now) return acc;

      const localVote = userHazardVotes[hazard.id];
      if (localVote && localVote !== hazard.userVote) {
        acc.push({ ...hazard, userVote: localVote });
      } else {
        acc.push(hazard);
      }
      return acc;
    }, []);
  }, [query.data, userHazardVotes]);

  return {
    hazards,
    isLoading: query.isLoading,
  };
};
