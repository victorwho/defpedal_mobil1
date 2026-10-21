import { resolveEtaPace, riderPace, type RiderPace } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { mobileApi } from '../lib/api';
import { useAppStore } from '../store/appStore';

/**
 * The pace every ride time should use, or null for the router's time
 * (docs/plans/adaptive-eta.md, Phase 1). Pass it to `personalRideSeconds`.
 *
 * Reads trip history through the `['trip-history']` query the History
 * screens already share, so it adds no request. The result is saved to the
 * store, so a cold start or an offline ride still has the rider's pace while
 * the query is loading or failing.
 */
export const useRiderPace = (): RiderPace | null => {
  const enabled = useAppStore((s) => s.paceEtaEnabled);
  const isEbike = useAppStore((s) => s.isEbike);
  const snapshot = useAppStore((s) => s.riderPaceSnapshot);
  const setSnapshot = useAppStore((s) => s.setRiderPaceSnapshot);

  const history = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => mobileApi.getTripHistory(),
    staleTime: 5 * 60_000,
    enabled,
  });

  useEffect(() => {
    if (history.data) setSnapshot(riderPace(history.data));
  }, [history.data, setSnapshot]);

  return resolveEtaPace({ pace: snapshot, enabled, isEbike });
};
