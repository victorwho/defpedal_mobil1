import type { NavigationLocationSample } from '@defensivepedal/core';
import { useEffect, useState } from 'react';

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

export const useBackgroundNavigationSnapshot = (): BackgroundNavigationSnapshot => {
  const [status, setStatus] = useState<BackgroundNavigationStatus>(
    getBackgroundNavigationStatus(),
  );
  const [latestLocation, setLatestLocation] = useState<NavigationLocationSample | null>(
    getPersistedNavigationLocation(),
  );
  const [locationHistory, setLocationHistory] = useState<NavigationLocationSample[]>(
    getPersistedNavigationLocationHistory(),
  );

  const refresh = () => {
    setStatus(getBackgroundNavigationStatus());
    setLatestLocation(getPersistedNavigationLocation());
    setLocationHistory(getPersistedNavigationLocationHistory());
  };

  useEffect(() => {
    refresh();
  }, []);

  return {
    status,
    latestLocation,
    locationHistory,
    refresh,
  };
};
