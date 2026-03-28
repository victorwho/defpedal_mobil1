import { router } from 'expo-router';

import type { TabKey } from '../design-system/organisms/BottomNav';
import { useAppStore } from '../store/appStore';

/**
 * Handle bottom nav tab press with navigation-aware routing.
 * If the user has an active navigation session, "Map" returns to /navigation
 * instead of /route-planning so the trip continues.
 */
export const handleTabPress = (tab: TabKey) => {
  if (tab === 'map') {
    const { appState, navigationSession } = useAppStore.getState();
    if (appState === 'NAVIGATING' && navigationSession) {
      router.replace('/navigation' as any);
    } else {
      router.replace('/route-planning' as any);
    }
  } else if (tab === 'history') {
    router.replace('/history' as any);
  } else if (tab === 'community') {
    router.replace('/community' as any);
  } else if (tab === 'profile') {
    router.replace('/profile' as any);
  }
};
