import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type { TripStatsDashboard } from '@defensivepedal/core';

import { mobileApi } from '../lib/api';
import { useAuthSession } from '../providers/AuthSessionProvider';

export type StatsPeriod = 'week' | 'month' | 'all';

export function useStatsDashboard() {
  const { user } = useAuthSession();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const query = useQuery<TripStatsDashboard>({
    queryKey: ['stats-dashboard'],
    queryFn: () => mobileApi.getStatsDashboard(tz),
    enabled: Boolean(user),
    // 30s instead of 2min — same backstop pattern as ['trip-history'].
    // BottomNav screens stay mounted, so without refetch-on-focus a cached
    // value can outlive a freshly-recorded trip. useFocusEffect below is
    // the primary refresh trigger; staleTime is the silent fallback.
    staleTime: 30_000,
  });

  // Refetch every time the host screen (History / Trips) gains focus so
  // a trip that synced after the user last viewed stats appears
  // immediately on tab-switch back, instead of waiting for staleTime.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void query.refetch();
    }, [user, query]),
  );

  return query;
}
