// @vitest-environment happy-dom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockStartTrip = vi.fn();
const mockEndTrip = vi.fn();
const mockSaveTripTrack = vi.fn();
const mockVoteHazard = vi.fn();
const mockResolveTrip = vi.fn();
vi.mock('../lib/api', () => ({
  mobileApi: {
    startTrip: (...args: unknown[]) => mockStartTrip(...args),
    endTrip: (...args: unknown[]) => mockEndTrip(...args),
    saveTripTrack: (...args: unknown[]) => mockSaveTripTrack(...args),
    voteHazard: (...args: unknown[]) => mockVoteHazard(...args),
    resolveTrip: (...args: unknown[]) => mockResolveTrip(...args),
  },
}));

// The real env has no EXPO_PUBLIC_MOBILE_API_URL under vitest, and a falsy
// mobileApiUrl disables the manager entirely.
vi.mock('../lib/env', () => ({
  mobileEnv: { mobileApiUrl: 'https://api.test' },
}));

vi.mock('../lib/telemetry', () => ({
  telemetry: { capture: vi.fn(), captureError: vi.fn() },
}));

vi.mock('./ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

// `null` context deliberately does not gate the queue (provider absent).
vi.mock('./AuthSessionProvider', () => ({
  useAuthSessionOptional: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ENQUEUE_FLUSH_DEBOUNCE_MS, SYNC_INTERVAL_MS } from '../lib/offlineSyncHelpers';
import { useAppStore } from '../store/appStore';
import { OfflineMutationSyncManager } from './OfflineMutationSyncManager';

const TRIP_START_PAYLOAD = {
  clientTripId: 'client-trip-1',
  sessionId: 'session-1',
  startLocationText: 'Start',
  startCoordinate: { lat: 44.43, lon: 26.1 },
  destinationText: 'Destination',
  destinationCoordinate: { lat: 44.44, lon: 26.11 },
  distanceMeters: 2500,
  startedAt: '2026-07-29T10:00:00.000Z',
};

const resetQueueState = () => {
  useAppStore.setState({
    queuedMutations: [],
    tripServerIds: {},
    activeTripClientId: null,
  });
};

describe('OfflineMutationSyncManager — immediate drain on trip-critical enqueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetQueueState();
    mockStartTrip.mockResolvedValue({ tripId: 'srv-trip-1' });
    mockEndTrip.mockResolvedValue({ status: 'ok' });
    mockSaveTripTrack.mockResolvedValue({ status: 'ok' });
    mockVoteHazard.mockResolvedValue({ status: 'ok' });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    resetQueueState();
  });

  it('flushes a trip-critical mutation after the debounce, long before the 15s interval', async () => {
    const view = render(React.createElement(OfflineMutationSyncManager));
    // Let the empty mount flush settle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      useAppStore.getState().enqueueMutation('trip_start', TRIP_START_PAYLOAD);
    });
    expect(mockStartTrip).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ENQUEUE_FLUSH_DEBOUNCE_MS + 50);
    });

    expect(mockStartTrip).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queuedMutations).toHaveLength(0);
    view.unmount();
  });

  it('coalesces ride-end back-to-back enqueues into one drain and preserves ordering', async () => {
    const view = render(React.createElement(OfflineMutationSyncManager));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      const store = useAppStore.getState();
      store.enqueueMutation('trip_start', TRIP_START_PAYLOAD);
      store.enqueueMutation('trip_end', {
        clientTripId: 'client-trip-1',
        endedAt: '2026-07-29T10:30:00.000Z',
        reason: 'stopped',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ENQUEUE_FLUSH_DEBOUNCE_MS + 50);
    });

    expect(mockStartTrip).toHaveBeenCalledTimes(1);
    expect(mockEndTrip).toHaveBeenCalledTimes(1);
    // trip_end resolved against the server id returned by trip_start — no
    // resolve round-trip needed.
    expect(mockEndTrip).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'srv-trip-1' }),
    );
    expect(mockResolveTrip).not.toHaveBeenCalled();
    expect(useAppStore.getState().queuedMutations).toHaveLength(0);
    view.unmount();
  });

  it('does not kick for non-trip-critical mutations — they wait for the interval', async () => {
    const view = render(React.createElement(OfflineMutationSyncManager));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      useAppStore.getState().enqueueMutation('hazard_vote', {
        hazardId: 'hazard-1',
        direction: 'up',
        clientSubmittedAt: '2026-07-29T10:00:00.000Z',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mockVoteHazard).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    });
    expect(mockVoteHazard).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('stops kicking after unmount', async () => {
    const view = render(React.createElement(OfflineMutationSyncManager));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    view.unmount();

    act(() => {
      useAppStore.getState().enqueueMutation('trip_start', TRIP_START_PAYLOAD);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    });
    expect(mockStartTrip).not.toHaveBeenCalled();
  });
});
