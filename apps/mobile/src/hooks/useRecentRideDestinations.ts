/**
 * Hook: useRecentRideDestinations
 *
 * Returns the 3 most recent distinct ride destinations for the current user.
 * Server-backed for authenticated users, falls back to local store for
 * anonymous users / offline.
 */
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteSuggestion, RideRecentDestination } from '@defensivepedal/core';

import { mobileApi } from '../lib/api';
import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useAppStore } from '../store/appStore';

/** Convert a server RideRecentDestination to the AutocompleteSuggestion shape
 *  that SearchBar expects. */
const toSuggestion = (d: RideRecentDestination): AutocompleteSuggestion => ({
  id: `ride-${d.coordinates.lat}-${d.coordinates.lon}`,
  label: d.label,
  primaryText: d.label.split(',')[0]?.trim() ?? d.label,
  secondaryText: d.label.split(',').slice(1).join(',').trim() || undefined,
  coordinates: d.coordinates,
});

export const useRecentRideDestinations = () => {
  const auth = useAuthSessionOptional();
  const isAuthenticated = Boolean(auth?.user) && !auth?.isAnonymous;

  const query = useQuery({
    queryKey: ['recent-destinations'],
    queryFn: () => mobileApi.getRecentDestinations(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  // Fallback: local store (first 3) for anonymous / offline / error
  const localRecents = useAppStore((s) => s.recentDestinations);

  if (isAuthenticated && query.data && query.data.length > 0) {
    return query.data.map(toSuggestion);
  }

  // Local fallback — first 3
  return localRecents.slice(0, 3) as AutocompleteSuggestion[];
};
