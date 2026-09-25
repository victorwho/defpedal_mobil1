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

const mapUrlSpy = vi.fn<(...args: unknown[]) => string>();
const captionSpy = vi.fn<(input: unknown) => string>();

// The privacy trim is deliberately NOT mocked. The previous version of this
// file stubbed it and then asserted that its own stubbed output was passed
// through — which passes identically whether or not the risk-segment overlay
// is trimmed, and is exactly why the P0-4 leak survived review
// (docs/plans/external-review-triage-2026-09-25.md). Only the URL and caption
// builders are spied, so the assertions below run against REAL geometry.
vi.mock('@defensivepedal/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@defensivepedal/core')>();
  return {
    ...actual,
    mapboxStaticImageUrl: (...args: unknown[]) => mapUrlSpy(...args),
    buildShareCaption: (input: unknown) => captionSpy(input),
  };
});

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
// App store — only used to read the current locale for the card's date label.
// Mocked so the test doesn't construct the real persisted store.
// ---------------------------------------------------------------------------

vi.mock('../../store/appStore', () => ({
  useAppStore: { getState: () => ({ locale: 'en' }) },
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useShareRide } = await import('../useShareRide');

// Real haversine (the core module is spread-preserved by the mock above), used
// to assert the trim distance rather than trusting a stub.
const { haversineDistance } = await import('@defensivepedal/core');

/** True when `list` contains a coordinate equal to `target` (exact tuple match). */
const containsCoord = (
  list: readonly [number, number][],
  target: readonly [number, number],
): boolean => list.some(([lon, lat]) => lon === target[0] && lat === target[1]);

/** Metres between two [lon, lat] tuples. */
const metersApart = (
  a: readonly [number, number],
  b: readonly [number, number],
): number => haversineDistance([a[1], a[0]], [b[1], b[0]]);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGINAL_COORDS: [number, number][] = [
  [26.1, 44.43],
  [26.11, 44.44],
  [26.12, 44.45],
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
      // Bailed before doing any work: no map image was built either.
      expect(mapUrlSpy).not.toHaveBeenCalled();
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

      // Real trim: neither raw endpoint may reach the map image.
      expect(mapUrlSpy).toHaveBeenCalledTimes(1);
      const mapArgs = mapUrlSpy.mock.calls[0][0] as { coords: [number, number][] };
      expect(mapArgs.coords.length).toBeGreaterThanOrEqual(2);

      const rawStart = ORIGINAL_COORDS[0];
      const rawEnd = ORIGINAL_COORDS[ORIGINAL_COORDS.length - 1];
      expect(containsCoord(mapArgs.coords, rawStart)).toBe(false);
      expect(containsCoord(mapArgs.coords, rawEnd)).toBe(false);

      // ...and the drawn line begins/ends roughly the trim radius inside them.
      expect(metersApart(mapArgs.coords[0], rawStart)).toBeGreaterThan(150);
      expect(
        metersApart(mapArgs.coords[mapArgs.coords.length - 1], rawEnd),
      ).toBeGreaterThan(150);
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

    it('passes optional metadata to the caption builder', async () => {
      const { result } = renderHook(() => useShareRide());

      await act(async () => {
        await result.current.share({ ...baseInput, safetyScore: 87 });
      });

      const captionArg = captionSpy.mock.calls[0][0] as { safetyScore?: number };
      expect(captionArg.safetyScore).toBe(87);
    });

    // ---------------------------------------------------------------------
    // P0-4 regression. `mapboxStaticImageUrl` draws ONLY the risk segments
    // when any are present, so an untrimmed overlay put the rider's real
    // start and end — their front door — into a PNG bound for Instagram,
    // while the pins sat 200 m inside. Feed RAW segments (the planned route,
    // which is what feedback.tsx actually supplies) and assert the raw
    // endpoints do not survive.
    // ---------------------------------------------------------------------
    it('strips the raw endpoints from the risk-segment overlay', async () => {
      const { result } = renderHook(() => useShareRide());

      const rawStart = ORIGINAL_COORDS[0];
      const rawEnd = ORIGINAL_COORDS[ORIGINAL_COORDS.length - 1];

      // Spans the whole planned route, endpoints included.
      const rawRiskSegments = [
        {
          color: '#FF0000',
          coords: [
            rawStart,
            [26.103, 44.433],
            [26.11, 44.44],
            [26.115, 44.445],
            rawEnd,
          ] as [number, number][],
        },
      ];

      await act(async () => {
        await result.current.share({ ...baseInput, riskSegments: rawRiskSegments });
      });

      const args = mapUrlSpy.mock.calls[0][0] as {
        coords: [number, number][];
        riskSegments?: { coords: [number, number][]; color: string }[];
      };

      // The overlay is what gets drawn, so it is what must be clean.
      const emitted = args.riskSegments ?? [];
      for (const seg of emitted) {
        expect(containsCoord(seg.coords, rawStart)).toBe(false);
        expect(containsCoord(seg.coords, rawEnd)).toBe(false);
        for (const point of seg.coords) {
          expect(metersApart(point, rawStart)).toBeGreaterThanOrEqual(200);
          expect(metersApart(point, rawEnd)).toBeGreaterThanOrEqual(200);
        }
      }

      // Interior geometry must survive — a trim that emptied the overlay would
      // pass the assertions above while silently destroying the feature.
      expect(emitted).toHaveLength(1);
      expect(emitted[0].coords.length).toBeGreaterThanOrEqual(2);
      expect(emitted[0].color).toBe('#FF0000');
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
