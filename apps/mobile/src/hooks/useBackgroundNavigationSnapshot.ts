import type { NavigationLocationSample } from '@defensivepedal/core';
import { useCallback, useEffect, useState } from 'react';

import {
  type BackgroundNavigationStatus,
  getBackgroundNavigationStatus,
  getPersistedNavigationLocation,
  getPersistedNavigationLocationHistory,
} from '../lib/backgroundNavigation';

type BackgroundNavigationSnapshot = {
  status: BackgroundNavigationStatus;
  latestLocation: NavigationLocationSample | null;
  locationHistory: NavigationLocationSample[];
  refresh: () => void;
};

const DEFAULT_STATUS: BackgroundNavigationStatus = {
  status: 'idle',
  updatedAt: new Date(0).toISOString(),
  error: null,
};

export const useBackgroundNavigationSnapshot = (): BackgroundNavigationSnapshot => {
  const [status, setStatus] = useState<BackgroundNavigationStatus>(DEFAULT_STATUS);
  const [latestLocation, setLatestLocation] = useState<NavigationLocationSample | null>(null);
  const [locationHistory, setLocationHistory] = useState<NavigationLocationSample[]>([]);

  const refresh = useCallback(() => {
    let cancelled = false;
    void (async () => {
      const [nextStatus, nextLocation, nextHistory] = await Promise.all([
        getBackgroundNavigationStatus(),
        getPersistedNavigationLocation(),
        getPersistedNavigationLocationHistory(),
      ]);
      if (cancelled) return;
      setStatus(nextStatus);
      setLatestLocation(nextLocation);
      setLocationHistory(nextHistory);
    })();
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    status,
    latestLocation,
    locationHistory,
    refresh,
  };
};
