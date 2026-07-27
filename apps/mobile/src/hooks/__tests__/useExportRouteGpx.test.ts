// @vitest-environment happy-dom
/**
 * useExportRouteGpx — Unit Tests
 *
 * Verifies the decode → write → share-sheet pipeline, degenerate-polyline
 * guarding, and error surfacing via toastMessage. File-system and sharing
 * boundaries are mocked; the GPX string itself is produced by the real
 * builder so content assertions stay honest.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { encodePolyline } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

const writeSpy = vi.fn<(uri: string, content: string) => Promise<void>>();
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  writeAsStringAsync: (uri: string, content: string) => writeSpy(uri, content),
}));

const shareFileSpy = vi.fn<(uri: string, opts: unknown) => Promise<boolean>>();
vi.mock('../../lib/shareImage', () => ({
  shareFile: (uri: string, opts: unknown) => shareFileSpy(uri, opts),
}));

// t() passthrough — assertions target keys, not copy, so locale files can
// evolve without breaking this suite.
vi.mock('../useTranslation', () => ({
  useT: () => (key: string) => key,
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useExportRouteGpx } = await import('../useExportRouteGpx');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const geometryPolyline6 = encodePolyline([
  [26.1, 44.43],
  [26.105, 44.435],
  [26.11, 44.44],
]);

const baseRoute = {
  id: 'route-1',
  source: 'custom_osrm' as const,
  routingEngineVersion: 'v1',
  routingProfileVersion: 'v1',
  mapDataVersion: 'v1',
  riskModelVersion: 'v1',
  geometryPolyline6,
  distanceMeters: 5000,
  durationSeconds: 900,
  adjustedDurationSeconds: 900,
  totalClimbMeters: 42,
  elevationProfile: [80, 85, 90],
  steps: [],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
};

const baseInput = {
  route: baseRoute,
  origin: { lat: 44.43, lon: 26.1 },
  destination: { lat: 44.44, lon: 26.11 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  writeSpy.mockReset().mockResolvedValue(undefined);
  shareFileSpy.mockReset().mockResolvedValue(true);
});

describe('useExportRouteGpx — happy path', () => {
  it('writes the GPX file to cache and opens the share sheet', async () => {
    const { result } = renderHook(() => useExportRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx(baseInput);
    });

    expect(outcome).toMatchObject({ exported: true });
    expect(writeSpy).toHaveBeenCalledTimes(1);

    const [uri, content] = writeSpy.mock.calls[0]!;
    expect(uri).toMatch(/^file:\/\/\/mock\/cache\/defensive-pedal-route-\d+\.gpx$/);
    expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(content).toContain('<gpx version="1.1" creator="Defensive Pedal"');
    // Real polyline round-trip: decoded coordinates land as lat/lon attrs.
    expect(content).toContain('<trkpt lat="44.43" lon="26.1">');
    // elevationProfile is 1:1 with the decoded polyline → <ele> per point.
    expect(content).toContain('<ele>80</ele>');
    expect(content).toContain('<ele>90</ele>');

    expect(shareFileSpy).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({
        mimeType: 'application/gpx+xml',
        uti: 'com.topografix.gpx',
        dialogTitle: 'preview.exportGpxDialogTitle',
      }),
    );
    expect(result.current.toastMessage).toBeNull();
  });

  it('renders origin, via, and destination waypoints', async () => {
    const { result } = renderHook(() => useExportRouteGpx());

    await act(async () => {
      await result.current.exportGpx({
        ...baseInput,
        waypoints: [{ lat: 44.435, lon: 26.105 }],
      });
    });

    const [, content] = writeSpy.mock.calls[0]!;
    expect(content).toContain('<name>preview.gpxStart</name>');
    expect(content).toContain('<name>preview.gpxVia 1</name>');
    expect(content).toContain('<name>preview.gpxDestination</name>');
    expect(content).toContain('<wpt lat="44.435" lon="26.105">');
  });
});

describe('useExportRouteGpx — failure paths', () => {
  it('rejects a degenerate (single-point) polyline without touching disk', async () => {
    const { result } = renderHook(() => useExportRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx({
        ...baseInput,
        route: {
          ...baseRoute,
          geometryPolyline6: encodePolyline([[26.1, 44.43]]),
        },
      });
    });

    expect(outcome).toEqual({ exported: false, reason: 'invalid_route' });
    expect(writeSpy).not.toHaveBeenCalled();
    expect(shareFileSpy).not.toHaveBeenCalled();
    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');
  });

  it('surfaces a toast when the share sheet is unavailable', async () => {
    shareFileSpy.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useExportRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx(baseInput);
    });

    expect(outcome).toEqual({ exported: false, reason: 'unavailable' });
    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');
  });

  it('surfaces the error message when the file write fails', async () => {
    writeSpy.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useExportRouteGpx());

    let outcome: Awaited<ReturnType<typeof result.current.exportGpx>> | undefined;
    await act(async () => {
      outcome = await result.current.exportGpx(baseInput);
    });

    expect(outcome).toEqual({ exported: false, reason: 'error' });
    expect(result.current.toastMessage).toBe('disk full');
    expect(shareFileSpy).not.toHaveBeenCalled();
  });

  it('consumeToast clears the toast message', async () => {
    shareFileSpy.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useExportRouteGpx());

    await act(async () => {
      await result.current.exportGpx(baseInput);
    });
    expect(result.current.toastMessage).toBe('preview.exportGpxFailed');

    act(() => {
      result.current.consumeToast();
    });
    expect(result.current.toastMessage).toBeNull();
  });
});
