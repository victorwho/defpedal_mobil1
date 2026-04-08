import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-router
vi.mock('expo-router', () => ({
  router: {
    replace: vi.fn(),
    push: vi.fn(),
  },
}));

// Mock the store
vi.mock('../store/appStore', () => ({
  useAppStore: {
    getState: vi.fn(),
  },
}));

import { handleTabPress } from './navigation-helpers';
import { router } from 'expo-router';
import { useAppStore } from '../store/appStore';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useAppStore.getState).mockReturnValue({
    appState: 'IDLE',
    navigationSession: null,
  } as any);
});

describe('handleTabPress', () => {
  it('navigates to route-planning for map tab when idle', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      appState: 'IDLE',
      navigationSession: null,
    } as any);

    handleTabPress('map');

    expect(router.replace).toHaveBeenCalledWith('/route-planning');
  });

  it('navigates to navigation screen for map tab when navigating', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      appState: 'NAVIGATING',
      navigationSession: { tripId: 'trip-1' },
    } as any);

    handleTabPress('map');

    expect(router.replace).toHaveBeenCalledWith('/navigation');
  });

  it('navigates to route-planning when navigating but no session', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      appState: 'NAVIGATING',
      navigationSession: null,
    } as any);

    handleTabPress('map');

    expect(router.replace).toHaveBeenCalledWith('/route-planning');
  });

  it('navigates to history for history tab', () => {
    handleTabPress('history');

    expect(router.replace).toHaveBeenCalledWith('/history');
  });

  it('navigates to community for community tab', () => {
    handleTabPress('community');

    expect(router.replace).toHaveBeenCalledWith('/community');
  });

  it('navigates to profile for profile tab', () => {
    handleTabPress('profile');

    expect(router.replace).toHaveBeenCalledWith('/profile');
  });

  it('navigates to route-planning for map tab in ROUTE_PREVIEW state', () => {
    vi.mocked(useAppStore.getState).mockReturnValue({
      appState: 'ROUTE_PREVIEW',
      navigationSession: null,
    } as any);

    handleTabPress('map');

    expect(router.replace).toHaveBeenCalledWith('/route-planning');
  });
});
