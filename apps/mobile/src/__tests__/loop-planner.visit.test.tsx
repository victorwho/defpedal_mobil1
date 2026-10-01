// @vitest-environment happy-dom
//
// Visiting the Loop planner — by any path — must record that the rider has
// found loops, or the app-open Loop intro keeps nagging riders who already use
// them. The intro's own tests cannot see this: only rendering the screen does.
//
// Everything that needs a device (map, GPS, network, native modules) is
// stubbed; the store and the intro's real decision logic are not.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() },
  useLocalSearchParams: () => ({}),
}));
vi.mock('../components/map', () => ({ RouteMap: () => null }));
vi.mock('../components/MapStageScreen', () => ({
  MapStageScreen: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/PlusPaywallHost', () => ({ PlusPaywallHost: () => null }));
vi.mock('../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: null, refreshLocation: vi.fn(), isLoading: false }),
}));
vi.mock('../hooks/useLockOrientation', () => ({ useLockOrientation: () => undefined }));
vi.mock('../hooks/useShareRoute', () => ({ useShareRoute: () => ({ share: vi.fn() }) }));
vi.mock('../providers/ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: true }),
}));
vi.mock('../lib/api', () => ({ mobileApi: {} }));
vi.mock('../lib/mapbox-search', () => ({ reverseGeocodeUrbanEdgeMeters: vi.fn() }));
vi.mock('../lib/loop-generator', () => ({ searchLoops: vi.fn() }));
vi.mock('../lib/loop-ride', () => ({ beginLoopRide: vi.fn() }));
vi.mock('../lib/loopStorage', () => ({ readSavedLoop: vi.fn(), writeSavedLoop: vi.fn() }));
vi.mock('../lib/telemetry', () => ({ telemetry: { capture: vi.fn(), captureError: vi.fn() } }));

import { EMPTY_LOOP_INTRO_STATE, hasUsedLoops, shouldShowLoopIntro } from '../lib/loop-intro';
import { useAppStore } from '../store/appStore';
import LoopPlannerScreen from '../../app/loop-planner';

const renderPlanner = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoopPlannerScreen />
    </QueryClientProvider>,
  );

beforeEach(() => {
  useAppStore.setState({
    hasOpenedLoopPlanner: false,
    savedLoops: [],
    loopIntro: EMPTY_LOOP_INTRO_STATE,
  });
});

describe('Loop planner visit', () => {
  it('retires the app-open Loop intro', () => {
    const introWouldShow = () =>
      shouldShowLoopIntro({
        state: useAppStore.getState().loopIntro,
        hasUsedLoops: hasUsedLoops({
          hasOpenedLoopPlanner: useAppStore.getState().hasOpenedLoopPlanner,
          savedLoopCount: useAppStore.getState().savedLoops.length,
        }),
        countryCode: 'RO',
        onboardingCompleted: true,
        appState: 'IDLE',
        now: new Date(),
      });

    expect(introWouldShow()).toBe(true);
    renderPlanner();
    expect(introWouldShow()).toBe(false);
  });
});
