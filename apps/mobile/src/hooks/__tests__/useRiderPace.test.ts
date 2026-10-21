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

beforeEach(() => {
  mockHistory.mockReset();
  useAppStore.setState({ ...DEFAULT_PACE_SLICE_STATE, isEbike: false });
});

describe('useRiderPace', () => {
  it('computes the pace from trip history and saves it', async () => {
    mockHistory.mockResolvedValue(HISTORY);
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    await waitFor(() => expect(result.current?.kmh).toBeCloseTo(30, 5));
    expect(useAppStore.getState().riderPaceSnapshot).toMatchObject({ personal: true, rideCount: 3 });
  });

  it('a failed history read keeps the saved pace', async () => {
    mockHistory.mockRejectedValue(new Error('offline'));
    useAppStore.setState({ riderPaceSnapshot: SAVED });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(result.current).toEqual(SAVED);
  });

  it('switched off: router time, and no history read', () => {
    useAppStore.setState({ paceEtaEnabled: false, riderPaceSnapshot: SAVED });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    expect(result.current).toBeNull();
    expect(mockHistory).not.toHaveBeenCalled();
  });

  it('E-bike selected: router time', () => {
    mockHistory.mockResolvedValue(HISTORY);
    useAppStore.setState({ isEbike: true, riderPaceSnapshot: SAVED });
    const { result } = renderHook(() => useRiderPace(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('the saved pace is cleared on account switch, the switch is not', () => {
    useAppStore.setState({ paceEtaEnabled: false, riderPaceSnapshot: SAVED });
    useAppStore.getState().resetUserScopedState();
    expect(useAppStore.getState().riderPaceSnapshot).toBeNull();
    expect(useAppStore.getState().paceEtaEnabled).toBe(false);
  });
});
