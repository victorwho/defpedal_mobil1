import { useQuery } from '@tanstack/react-query';
import type { TripStatsDashboard } from '@defensivepedal/core';

import { mobileApi } from '../lib/api';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type StatsPeriod = 'week' | 'month' | 'all';

export function useStatsDashboard() {
  const { user } = useAuthSession();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return useQuery<TripStatsDashboard>({
    queryKey: ['stats-dashboard'],
    queryFn: () => mobileApi.getStatsDashboard(tz),
    enabled: Boolean(user),
    staleTime: 120_000,
  });
}
