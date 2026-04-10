import type { TiersResponse } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

/** Fetches tier definitions + user's XP state. Same pattern as useBadges. */
export function useTiers() {
  return useQuery<TiersResponse>({
    queryKey: ['tiers'],
    queryFn: () => mobileApi.fetchTiers(),
    staleTime: 5 * 60_000,
  });
}
