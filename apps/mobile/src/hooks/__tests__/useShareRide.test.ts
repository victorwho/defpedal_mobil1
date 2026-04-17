// @vitest-environment happy-dom
/**
 * useShareRide — Unit Tests
 *
 * Verifies offline gating, privacy-zone trimming before map URL build, and
 * end-to-end orchestration on the online happy path.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Core module spies
// ---------------------------------------------------------------------------

const trimSpy = vi.fn<(coords: [number, number][], trim?: number) => [number, number][]>();
const mapUrlSpy = vi.fn<(...args: unknown[]) => string>();
const captionSpy = vi.fn<(input: unknown) => string>();

vi.mock('@defensivepedal/core', () => ({
  trimPrivacyZone: (...args: [[number, number][], number?]) => trimSpy(...args),
  mapboxStaticImageUrl: (...args: unknown[]) => mapUrlSpy(...args),
  buildShareCaption: (input: unknown) => captionSpy(input),
}));

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

vi.mock('../../lib/env', () => ({
  mobileEnv: { mapboxPublicToken: 'pk.test' },
}));

// ---------------------------------------------------------------------------
// shareImage — the final I/O boundary
// ---------------------------------------------------------------------------

const shareImageSpy = vi.fn<() => Promise<{ shared: boolean; savedToLibrary: boolean }>>();

vi.mock('../../lib/shareImage', () => ({
  shareImage: (...args: unknown[]) => shareImageSpy(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

let mockIsOnline = true;

vi.mock('../../providers/ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: mockIsOnline }),
}));

// ---------------------------------------------------------------------------
// Capture host — asserts the shape of the RN element handed to it
// ---------------------------------------------------------------------------

const captureSpy = vi.fn<() => Promise<string>>();

vi.mock('../../providers/OffScreenCaptureHost', () => ({
  useCaptureHost: () => ({ capture: (...args: unknown[]) => captureSpy(...(args as [])) }),
}));

// ---------------------------------------------------------------------------
// expo-file-system — mocked to return a local file:// URI without touching
// the real native module (expo-modules-core uses __DEV__ which isn't defined
// in the test runtime).
// ---------------------------------------------------------------------------

const downloadSpy = vi.fn<
  (url: string, dest: string) => Promise<{ uri: string; status: number }>
>();

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  downloadAsync: (url: string, dest: string) => downloadSpy(url, dest),
}));

// ---------------------------------------------------------------------------
// RideShareCard placeholder — Phase 3 will ship the real one.
// ---------------------------------------------------------------------------

vi.mock('../../components/share/RideShareCard', () => ({
  RideShareCard: (props: unknown) => props,
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useShareRide } = await import('../useShareRide');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGINAL_COORDS: [number, number][] = [
  [26.1, 44.43],
  [26.11, 44.44],
  [26.12, 44.45],
];
const TRIMMED_COORDS: [number, number][] = [
  [26.105, 44.435],
  [26.115, 44.445],
];

const MAP_URL = 'https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/mocked';
const CAPTION = 'I just rode 8 km in 30 min on Defensive Pedal. 1.0 kg CO₂ saved. #DefensivePedal #SaferCycling';
const FILE_URI = 'file:///tmp/ride-share.png';

const baseInput = {
  coords: ORIGINAL_COORDS,
  distanceKm: 8,
  durationMinutes: 30,
  co2SavedKg: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockIsOnline = true;

  trimSpy.mockReset().mockReturnValue(TRIMMED_COORDS);
  mapUrlSpy.mockReset().mockReturnValue(MAP_URL);
  captionSpy.mockReset().mockReturnValue(CAPTION);
  captureSpy.mockReset().mockResolvedValue(FILE_URI);
  shareImageSpy.mockReset().mockResolvedValue({ shared: true, savedToLibrary: true });
  downloadSpy
    .mockReset()
    .mockResolvedValue({ uri: 'file:///mock/cache/share-map.png', status: 200 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useShareRide', () => {
  describe('offline', () => {
    it('returns shared=false and sets offline toast, does not capture', async () => {
      mockIsOnline = false;
      const { result } = renderHook(() => useShareRide());

      let res: { shared: boolean; savedToLibrary: boolean } | undefined;
      await act(async () => {
        res = await result.current.share(baseInput);
      });

      expect(res).toEqual({ shared: false, savedToLibrary: false });
      expect(result.current.toastMessage).toBe('No connection — try again when online');
      expect(captureSpy).not.toHaveBeenCalled();
      expect(shareImageSpy).not.toHaveBeenCalled();
      expect(trimSpy).not.toHaveBeenCalled();
    });

    it('consumeToast clears the offline message', async () => {
      mockIsOnline = false;
      const { result } = renderHook(() => useShareRide());

      await act(async () => {
        await result.current.share(baseInput);
      });

      expect(result.current.toastMessage).not.toBeNull();

      act(() => result.current.consumeToast());
      expect(result.current.toastMessage).toBeNull();
    });
  });

  describe('online happy path', () => {
    it('trims privacy zone before building map URL', async () => {
      const { result } = renderHook(() => useShareRide());

      await act(async () => {
        await result.current.share(baseInput);
      });

      // Privacy trim called with 200m
      expect(trimSpy).toHaveBeenCalledWith(ORIGINAL_COORDS, 200);

      // Map URL gets TRIMMED coords, not originals
      expect(mapUrlSpy).toHaveBeenCalledTimes(1);
      const mapArgs = mapUrlSpy.mock.calls[0][0] as { coords: [number, number][] };
      expect(mapArgs.coords).toBe(TRIMMED_COORDS);
      expect(mapArgs.coords).not.toBe(ORIGINAL_COORDS);
    });

    it('captures the share card and forwards the uri to shareImage', async () => {
      const { result } = renderHook(() => useShareRide());

      await act(async () => {
        await result.current.share(baseInput);
      });

      expect(captureSpy).toHaveBeenCalledTimes(1);
      expect(shareImageSpy).toHaveBeenCalledWith(FILE_URI, CAPTION);
    });

    it('returns shared=true/savedToLibrary=true on success', async () => {
      const { result } = renderHook(() => useShareRide());

      let res: { shared: boolean; savedToLibrary: boolean } | undefined;
      await act(async () => {
        res = await result.current.share(baseInput);
      });

      expect(res).toEqual({ shared: true, savedToLibrary: true });
    });

    it('passes risk segments and optional metadata to map URL builder', async () => {
      const { result } = renderHook(() => useShareRide());
      const riskSegments = [{ coords: TRIMMED_COORDS, color: '#FF0000' }];

      await act(async () => {
        await result.current.share({ ...baseInput, riskSegments, safetyScore: 87 });
      });

      const args = mapUrlSpy.mock.calls[0][0] as {
        coords: [number, number][];
        riskSegments?: unknown;
      };
      expect(args.riskSegments).toEqual(riskSegments);

      // Caption input carries the safety score through
      const captionArg = captionSpy.mock.calls[0][0] as { safetyScore?: number };
      expect(captionArg.safetyScore).toBe(87);
    });
  });

  describe('failure modes', () => {
    it('capture error sets toast and returns shared=false', async () => {
      captureSpy.mockRejectedValueOnce(new Error('native module missing'));
      const { result } = renderHook(() => useShareRide());

      let res: { shared: boolean; savedToLibrary: boolean } | undefined;
      await act(async () => {
        res = await result.current.share(baseInput);
      });

      expect(res).toEqual({ shared: false, savedToLibrary: false });
      expect(result.current.toastMessage).toBe('native module missing');
      expect(shareImageSpy).not.toHaveBeenCalled();
    });
  });
});
