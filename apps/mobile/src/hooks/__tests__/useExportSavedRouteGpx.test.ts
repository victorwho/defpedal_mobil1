// @vitest-environment happy-dom
/**
 * useExportSavedRouteGpx — Unit Tests
 *
 * Verifies the offline gate, the route-calculation call built from the saved
 * parameters, the hand-off to the composed route-export hook (mocked), and
 * fetch-failure toasts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { SavedRoute } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

let mockIsOnline = true;
vi.mock('../../providers/ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: mockIsOnline }),
}));

const previewRouteSpy = vi.fn<
  (payload: unknown) => Promise<{ routes: Array<{ id: string }> }>
>();
vi.mock('../../lib/api', () => ({
  mobileApi: {
    previewRoute: (payload: unknown) => previewRouteSpy(payload),
  },
}));

vi.mock('../useTranslation', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: { locale: string }) => unknown) =>
    selector({ locale: 'en' }),
}));

// Composed route-export hook — mocked so this suite only covers the
// fetch stage; the build/write/share tail is covered by useExportRouteGpx's
// own suite.
const exportGpxSpy = vi.fn<
  (input: unknown) => Promise<{ exported: boolean; fileUri?: string }>
>();
let mockExportToast: string | null = null;
const consumeExportToastSpy = vi.fn();
vi.mock('../useExportRouteGpx', () => ({
  useExportRouteGpx: () => ({
    exportGpx: (input: unknown) => exportGpxSpy(input),
    isExporting: false,
    toastMessage: mockExportToast,
    consumeToast: consumeExportToastSpy,
  }),
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useExportSavedRouteGpx } = await import('../useExportSavedRouteGpx');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const savedRoute: SavedRoute = {
  id: 'saved-1',
  name: 'Morning commute',
  origin: { lat: 44.43, lon: 26.1 },
  destination: { lat: 44.44, lon: 26.11 },
  waypoints: [{ lat: 44.435, lon: 26.105 }],
  mode: 'safe',
  avoidUnpaved: true,
  avoidHills: false,
  createdAt: '2026-07-01T10:00:00.000Z',
  lastUsedAt: '2026-07-20T10:00:00.000Z',
};

const fetchedRoute = { id: 'route-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockIsOnline = true;
  mockExportToast = null;
  previewRouteSpy.mockReset().mockResolvedValue({ routes: [fetchedRoute] });
  exportGpxSpy
    .mockReset()
    .mockResolvedValue({ exported: true, fileUri: 'file:///mock/route.gpx' });
  consumeExportToastSpy.mockReset();
});

describe('useExportSavedRouteGpx', () => {
  it('calculates the route from the saved parameters, then exports it under the saved name', async () => {
    const { result } = renderHook(() => useExportSavedRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportSavedRoute>> | undefined;
    await act(async () => {
      outcome = await result.current.exportSavedRoute(savedRoute);
    });

    expect(previewRouteSpy).toHaveBeenCalledWith({
      origin: savedRoute.origin,
      destination: savedRoute.destination,
      waypoints: savedRoute.waypoints,
      mode: 'safe',
      avoidUnpaved: true,
      avoidHills: false,
      locale: 'en',
    });
    expect(exportGpxSpy).toHaveBeenCalledWith({
      route: fetchedRoute,
      origin: savedRoute.origin,
      destination: savedRoute.destination,
      waypoints: savedRoute.waypoints,
      name: 'Morning commute',
    });
    expect(outcome).toEqual({ exported: true, fileUri: 'file:///mock/route.gpx' });
    expect(result.current.exportingRouteId).toBeNull();
  });

  it('short-circuits with an offline toast when not connected', async () => {
    mockIsOnline = false;
    const { result } = renderHook(() => useExportSavedRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportSavedRoute>> | undefined;
    await act(async () => {
      outcome = await result.current.exportSavedRoute(savedRoute);
    });

    expect(outcome).toEqual({ exported: false, reason: 'offline' });
    expect(previewRouteSpy).not.toHaveBeenCalled();
    expect(exportGpxSpy).not.toHaveBeenCalled();
    expect(result.current.toastMessage).toBe('preview.exportGpxOffline');
  });

  it('surfaces a toast when the calculation returns no routes', async () => {
    previewRouteSpy.mockResolvedValueOnce({ routes: [] });
    const { result } = renderHook(() => useExportSavedRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportSavedRoute>> | undefined;
    await act(async () => {
      outcome = await result.current.exportSavedRoute(savedRoute);
    });

    expect(outcome).toEqual({ exported: false, reason: 'fetch_failed' });
    expect(exportGpxSpy).not.toHaveBeenCalled();
    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');
  });

  it('surfaces the fetch error message when the calculation throws', async () => {
    previewRouteSpy.mockRejectedValueOnce(new Error('Route is too long for fast routing.'));
    const { result } = renderHook(() => useExportSavedRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportSavedRoute>> | undefined;
    await act(async () => {
      outcome = await result.current.exportSavedRoute(savedRoute);
    });

    expect(outcome).toEqual({ exported: false, reason: 'fetch_failed' });
    expect(result.current.toastMessage).toBe('Route is too long for fast routing.');
    expect(result.current.exportingRouteId).toBeNull();
  });

  it('consumeToast clears both the fetch toast and the composed export toast', async () => {
    mockIsOnline = false;
    const { result } = renderHook(() => useExportSavedRouteGpx());

    await act(async () => {
      await result.current.exportSavedRoute(savedRoute);
    });
    expect(result.current.toastMessage).toBe('preview.exportGpxOffline');

    act(() => {
      result.current.consumeToast();
    });
    expect(result.current.toastMessage).toBeNull();
    expect(consumeExportToastSpy).toHaveBeenCalled();
  });
});
