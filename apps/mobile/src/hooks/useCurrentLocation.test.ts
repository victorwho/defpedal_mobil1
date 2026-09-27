// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-location
const mockGetForegroundPermissionsAsync = vi.fn();
const mockRequestForegroundPermissionsAsync = vi.fn();
const mockGetCurrentPositionAsync = vi.fn();

vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) =>
    mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) =>
    mockGetCurrentPositionAsync(...args),
  Accuracy: { High: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

// Dev fake-GPS module — off by default; individual tests can arm it.
const mockGetDevMockLocation = vi.fn();
vi.mock('../lib/devMockLocation', () => ({
  getDevMockLocation: (...args: unknown[]) => mockGetDevMockLocation(...args),
}));

import { __resetCurrentLocationForTests, useCurrentLocation } from './useCurrentLocation';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDevMockLocation.mockReturnValue(null);
  // The hook is now ONE shared source, so its module state has to be cleared
  // between tests like any singleton's. Without this the first test — which
  // deliberately never resolves its permission promise — leaves an in-flight
  // read that every later test would adopt.
  __resetCurrentLocationForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCurrentLocation', () => {
  it('returns initial loading state', () => {
    // Make permissions never resolve so we stay in loading state
    mockGetForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCurrentLocation());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.permissionStatus).toBe('undetermined');
    expect(result.current.error).toBeNull();
  });

  it('returns the dev fake GPS location without touching permissions or the OS fix', async () => {
    mockGetDevMockLocation.mockReturnValue({ lat: 52.52, lon: 13.405 }); // Berlin

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toEqual({ lat: 52.52, lon: 13.405 });
    expect(result.current.permissionStatus).toBe('granted');
    expect(mockGetForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('fetches location when permission is already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 12.5 },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
    expect(result.current.accuracyMeters).toBe(12.5);
    expect(result.current.permissionStatus).toBe('granted');
    expect(result.current.error).toBeNull();
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 48.85, longitude: 2.35, accuracy: 8 },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toEqual({ lat: 48.85, lon: 2.35 });
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('sets error when permission is denied', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.permissionStatus).toBe('denied');
    expect(result.current.error).toBe(
      'Location permission is required to use the rider\u2019s current position.',
    );
  });

  it('handles getCurrentPositionAsync failure gracefully', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.error).toBe('GPS unavailable');
  });

  it('handles non-Error exceptions with a fallback message', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValue('something went wrong');

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Unable to resolve the current location.');
  });

  it('handles null accuracy from GPS', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: null },
    });

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.accuracyMeters).toBeNull();
    expect(result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
  });

  it('refreshLocation re-fetches location and clears previous error', async () => {
    // First call fails
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS fail'));

    const { result } = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('GPS fail');

    // Second call succeeds
    mockGetCurrentPositionAsync.mockResolvedValueOnce({
      coords: { latitude: 51.5, longitude: -0.12, accuracy: 5 },
    });

    await act(async () => {
      await result.current.refreshLocation();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.location).toEqual({ lat: 51.5, lon: -0.12 });
    expect(result.current.accuracyMeters).toBe(5);
  });
});

describe('useCurrentLocation — one shared read (P2)', () => {
  it('wakes the GPS ONCE for many simultaneous consumers', async () => {
    // The defect: this hook is mounted from 13 places, and a screen composing
    // several of them ran a permission check and a position read per instance.
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    const a = renderHook(() => useCurrentLocation());
    const b = renderHook(() => useCurrentLocation());
    const c = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(a.result.current.isLoading).toBe(false);
    });

    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(mockGetForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    // And all three see the answer, not just the one that triggered it.
    for (const h of [a, b, c]) {
      expect(h.result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
    }
  });

  it('reuses a fresh fix for a consumer mounting afterwards', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    const first = renderHook(() => useCurrentLocation());
    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
    });

    const second = renderHook(() => useCurrentLocation());

    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(1);
    // The late arrival gets the value immediately rather than a loading state.
    expect(second.result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
    expect(second.result.current.isLoading).toBe(false);
  });

  it('refreshLocation always reads again, even inside the freshness window', async () => {
    // An explicit refresh answered from cache would make pull-to-refresh a no-op.
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    const { result } = renderHook(() => useCurrentLocation());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 45.65, longitude: 25.6, accuracy: 8 },
    });
    await act(async () => {
      await result.current.refreshLocation();
    });

    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(result.current.location).toEqual({ lat: 45.65, lon: 25.6 });
  });

  it('re-reads for a screen mounted AFTER the freshness window — the rider moved', async () => {
    // The case the freshness window must not break. Reusing a fix forever would
    // mean route planning showed a stale origin for a rider who had cycled on.
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    const first = renderHook(() => useCurrentLocation());
    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
    });
    first.unmount();

    // Past the window, and the rider is now somewhere else.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_000);
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 45.65, longitude: 25.6, accuracy: 9 },
    });

    try {
      const second = renderHook(() => useCurrentLocation());
      await waitFor(() => {
        expect(second.result.current.location).toEqual({ lat: 45.65, lon: 25.6 });
      });
      expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('gives every consumer the same permission verdict when it is DENIED', async () => {
    // Six hooks and six screens branch on `permissionStatus`, and several render
    // an explicit "we need location" state from it. One shared read must deliver
    // the refusal to all of them, not just the one that happened to ask.
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const a = renderHook(() => useCurrentLocation());
    const b = renderHook(() => useCurrentLocation());

    await waitFor(() => {
      expect(a.result.current.isLoading).toBe(false);
    });

    for (const h of [a, b]) {
      expect(h.result.current.permissionStatus).toBe('denied');
      expect(h.result.current.location).toBeNull();
      expect(h.result.current.error).toBeTruthy();
    }
    // And it asked ONCE. Prompting per consumer is what a rider would notice.
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('survives a screen navigation cycle: unmount, remount, still resolves', async () => {
    // Expo Router keeps screens mounted under pushed routes and tears them down
    // on pop, so mount/unmount churn is the normal case rather than an edge one.
    // A stale subscriber left behind would update a dead component.
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    for (let i = 0; i < 3; i += 1) {
      const view = renderHook(() => useCurrentLocation());
      await waitFor(() => {
        expect(view.result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
      });
      view.unmount();
    }

    // Three mounts inside the freshness window: one GPS read between them.
    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('still honours the dev fake-GPS tool through the shared read', async () => {
    // Diagnostics > Fake GPS is how the region gate and quiz country get tested
    // on a preview build. A freshness window that cached over it would make the
    // tool look broken.
    mockGetDevMockLocation.mockReturnValue({ lat: 52.52, lon: 13.405 });

    const a = renderHook(() => useCurrentLocation());
    await waitFor(() => {
      expect(a.result.current.isLoading).toBe(false);
    });
    expect(a.result.current.location).toEqual({ lat: 52.52, lon: 13.405 });

    // Move the pin and mount another screen: it must see the NEW mock, not the
    // cached one, and must never touch the OS.
    mockGetDevMockLocation.mockReturnValue({ lat: 41.39, lon: 2.17 });
    const b = renderHook(() => useCurrentLocation());
    await waitFor(() => {
      expect(b.result.current.location).toEqual({ lat: 41.39, lon: 2.17 });
    });
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('a hung read cannot wedge the source forever', async () => {
    // ⚠️ The risk coalescing introduces. `requestForegroundPermissionsAsync`
    // waits on a human and `getCurrentPositionAsync` can hang indoors, so a
    // shared promise with no expiry would leave every consumer — and
    // refreshLocation() — holding a dead promise for the rest of the session.
    mockGetForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCurrentLocation());
    expect(result.current.isLoading).toBe(true);

    // Move the clock past the coalesce window. `Date.now` is spied rather than
    // faked with timers: the assertion has to await a real promise, and fake
    // timers would either hold that promise up or revert the clock before it
    // settled.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6_000);

    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 44.43, longitude: 26.1, accuracy: 10 },
    });

    try {
      await act(async () => {
        await result.current.refreshLocation();
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(result.current.location).toEqual({ lat: 44.43, lon: 26.1 });
  });
});
