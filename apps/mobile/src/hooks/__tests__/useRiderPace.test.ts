// @vitest-environment happy-dom
/**
 * The pace every ride time uses (docs/plans/adaptive-eta.md, Phase 1).
 * What is easy to get wrong: the saved pace must carry a cold start and a
 * failed history read, and the switch and E-bike must both turn it off.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHistory } = vi.hoisted(() => ({ mockHistory: vi.fn() }));
vi.mock('../../lib/api', () => ({ mobileApi: { getTripHistory: mockHistory } }));

import { useAppStore } from '../../store/appStore';
import { DEFAULT_PACE_SLICE_STATE } from '../../store/paceSlice';
import { useRiderPace } from '../useRiderPace';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

/** Three 20 km rides in 40 min: 30 km/h. */
const HISTORY = [0, 1, 2].map((i) => ({
  distanceMeters: 20_000,
  startedAt: `2026-10-0${i + 1}T08:00:00Z`,
  endedAt: `2026-10-0${i + 1}T08:40:00Z`,
}));
const SAVED = { kmh: 21, personal: true, rideCount: 9 };
const NONE = { kmh: 15, personal: false, rideCount: 0 };
const SAVED_PACES = { normal: SAVED, ebike: NONE };

beforeEach(() => {
  mockHistory.mockReset();
  useAppStore.setState({ ...DEFAULT_PACE_SLICE_STATE, isEbike: false });
});

describe('useRiderPace', () => {
  it('computes the pace from trip history and saves it', async () => {
    mockHistory.mockResolvedValue(HISTORY);
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    await waitFor(() => expect(result.current?.kmh).toBeCloseTo(30, 5));
    expect(useAppStore.getState().riderPaces?.normal).toMatchObject({ personal: true, rideCount: 3 });
  });

  it('a failed history read keeps the saved pace', async () => {
    mockHistory.mockRejectedValue(new Error('offline'));
    useAppStore.setState({ riderPaces: SAVED_PACES });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(result.current).toEqual(SAVED);
  });

  it('switched off: router time, and no history read', () => {
    useAppStore.setState({ paceEtaEnabled: false, riderPaces: SAVED_PACES });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    expect(result.current).toBeNull();
    expect(mockHistory).not.toHaveBeenCalled();
  });

  it('inactive (a past trip on the map): no pace, and no history read', () => {
    useAppStore.setState({ riderPaces: SAVED_PACES });
    const { result } = renderHook(() => useRiderPace({ active: false }), { wrapper });
    expect(result.current).toBeNull();
    expect(mockHistory).not.toHaveBeenCalled();
  });

  it('E-bike selected: the e-bike’s own pace once its rides are recorded', async () => {
    mockHistory.mockResolvedValue(HISTORY.map((r) => ({ ...r, isEbike: true })));
    useAppStore.setState({ isEbike: true });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    await waitFor(() => expect(result.current?.kmh).toBeCloseTo(30, 5));
  });

  it('E-bike selected, no e-bike rides recorded: router time', () => {
    mockHistory.mockResolvedValue(HISTORY);
    useAppStore.setState({ isEbike: true, riderPaces: SAVED_PACES });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('the saved pace is cleared on account switch, the switch is not', () => {
    useAppStore.setState({ paceEtaEnabled: false, riderPaces: SAVED_PACES });
    useAppStore.getState().resetUserScopedState();
    expect(useAppStore.getState().riderPaces).toBeNull();
    expect(useAppStore.getState().paceEtaEnabled).toBe(false);
  });
});
