// @vitest-environment happy-dom
/**
 * useExportTripGpx — Unit Tests
 *
 * The write/share tail is mocked at the gpx-share boundary; the GPX content
 * comes from the real builder so assertions stay honest.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { TripHistoryItem } from '@defensivepedal/core';
import { encodePolyline } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

const writeShareSpy = vi.fn<
  (gpx: string, opts: unknown) => Promise<
    { ok: true; fileUri: string } | { ok: false; reason: 'unavailable' | 'error'; message?: string }
  >
>();
vi.mock('../../lib/gpx-share', () => ({
  writeAndShareGpx: (gpx: string, opts: unknown) => writeShareSpy(gpx, opts),
  preloadGpxShare: () => undefined,
}));

vi.mock('../useTranslation', () => ({
  useT: () => (key: string) => key,
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useExportTripGpx } = await import('../useExportTripGpx');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseTrip: TripHistoryItem = {
  id: 'row-1',
  tripId: 'abcdef1234567890',
  routingMode: 'safe',
  plannedRoutePolyline6: encodePolyline([
    [26.1, 44.43],
    [26.11, 44.44],
  ]),
  gpsBreadcrumbs: [
    { lat: 44.43, lon: 26.1 },
    { lat: 44.431, lon: 26.101 },
  ],
  endReason: 'completed',
  startedAt: '2026-07-27T08:30:00.000Z',
  endedAt: '2026-07-27T09:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  writeShareSpy
    .mockReset()
    .mockResolvedValue({ ok: true, fileUri: 'file:///mock/cache/ride.gpx' });
});

describe('useExportTripGpx — happy path', () => {
  it('builds the trip GPX with a localized dated name and shares it', async () => {
    const { result } = renderHook(() => useExportTripGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx({
        trip: baseTrip,
        trailElevations: [80, 85],
      });
    });

    expect(outcome).toEqual({
      exported: true,
      fileUri: 'file:///mock/cache/ride.gpx',
    });
    expect(writeShareSpy).toHaveBeenCalledTimes(1);

    const [gpx, opts] = writeShareSpy.mock.calls[0]!;
    expect(gpx).toContain('<name>history.gpxRideName 2026-07-27 - GPS Trail</name>');
    expect(gpx).toContain('<name>history.gpxRideName 2026-07-27 - Planned Route</name>');
    expect(gpx).toContain('<trkpt lat="44.43" lon="26.1"><ele>80</ele></trkpt>');
    expect(opts).toEqual({
      fileBaseName: 'defensive-pedal-ride',
      dialogTitle: 'history.exportGpxDialogTitle',
    });
    expect(result.current.toastMessage).toBeNull();
  });

  it('still exports a trip with no GPS trail via the planned polyline', async () => {
    const { result } = renderHook(() => useExportTripGpx());

    await act(async () => {
      await result.current.exportGpx({
        trip: { ...baseTrip, gpsBreadcrumbs: [] },
      });
    });

    const [gpx] = writeShareSpy.mock.calls[0]!;
    expect(gpx).not.toContain('GPS Trail');
    expect(gpx).toContain('Planned Route');
  });
});

describe('useExportTripGpx — failure paths', () => {
  it('rejects a trip with neither trail nor planned polyline', async () => {
    const { result } = renderHook(() => useExportTripGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx({
        trip: { ...baseTrip, gpsBreadcrumbs: [], plannedRoutePolyline6: undefined },
      });
    });

    expect(outcome).toEqual({ exported: false, reason: 'invalid_trip' });
    expect(writeShareSpy).not.toHaveBeenCalled();
    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');
  });

  it('surfaces the share-tail failure as a toast', async () => {
    writeShareSpy.mockResolvedValueOnce({ ok: false, reason: 'error', message: 'disk full' });
    const { result } = renderHook(() => useExportTripGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx({ trip: baseTrip });
    });

    expect(outcome).toEqual({ exported: false, reason: 'error' });
    expect(result.current.toastMessage).toBe('disk full');
  });

  it('falls back to the generic toast when the failure has no message', async () => {
    writeShareSpy.mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
    const { result } = renderHook(() => useExportTripGpx());

    await act(async () => {
      await result.current.exportGpx({ trip: baseTrip });
    });

    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');
  });
});
