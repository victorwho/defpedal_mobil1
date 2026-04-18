// @vitest-environment happy-dom
/**
 * useShareRoute — Unit Tests
 *
 * Verifies offline gating, API-error surfacing via toastMessage, and the
 * happy-path POST → Share.share() flow with the universal link.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

// Connectivity toggle — flip per-test by mutating this closure variable.
let mockIsOnline = true;
vi.mock('../../providers/ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: mockIsOnline }),
}));

// mobileApi.createRouteShare — injected so we can control happy/error.
const createRouteShareSpy =
  vi.fn<
    (payload: unknown) => Promise<{
      id: string;
      code: string;
      source: 'planned';
      appUrl: string;
      webUrl: string;
      createdAt: string;
      expiresAt: string;
    }>
  >();
vi.mock('../../lib/api', () => ({
  mobileApi: {
    createRouteShare: (payload: unknown) => createRouteShareSpy(payload),
  },
}));

// React Native's Share — the native share sheet is the final I/O boundary.
const shareShareSpy = vi.fn<
  () => Promise<
    | { action: 'sharedAction'; activityType: string | null }
    | { action: 'dismissedAction' }
  >
>();
vi.mock('react-native', () => ({
  Share: {
    share: (...args: unknown[]) => shareShareSpy(...(args as [])),
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { useShareRoute } = await import('../useShareRoute');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseRoute = {
  id: 'route-1',
  source: 'custom_osrm' as const,
  routingEngineVersion: 'v1',
  routingProfileVersion: 'v1',
  mapDataVersion: 'v1',
  riskModelVersion: 'v1',
  geometryPolyline6: 'abcdefg',
  distanceMeters: 5000,
  durationSeconds: 900,
  adjustedDurationSeconds: 900,
  totalClimbMeters: null,
  steps: [],
  riskSegments: [],
  warnings: [],
};

const baseInput = {
  route: baseRoute,
  origin: { lat: 44.43, lon: 26.1 },
  destination: { lat: 44.44, lon: 26.11 },
  routingMode: 'safe' as const,
};

const happyCreated = {
  id: 'share-1',
  code: 'abcd1234',
  source: 'planned' as const,
  appUrl: 'https://routes.defensivepedal.com/r/abcd1234',
  webUrl: 'https://routes.defensivepedal.com/r/abcd1234',
  createdAt: '2026-04-18T10:00:00.000Z',
  expiresAt: '2026-05-18T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockIsOnline = true;
  createRouteShareSpy.mockReset().mockResolvedValue(happyCreated);
  shareShareSpy
    .mockReset()
    .mockResolvedValue({ action: 'sharedAction', activityType: null });
});

describe('useShareRoute — offline', () => {
  it('short-circuits with offline toast message when not connected', async () => {
    mockIsOnline = false;
    const { result } = renderHook(() => useShareRoute());

    let out: Awaited<ReturnType<typeof result.current.share>> | undefined;
    await act(async () => {
      out = await result.current.share(baseInput);
    });

    expect(out).toEqual({ shared: false, reason: 'offline' });
    expect(result.current.toastMessage).toBe(
      'You are offline. Try again when connected.',
    );
    expect(createRouteShareSpy).not.toHaveBeenCalled();
    expect(shareShareSpy).not.toHaveBeenCalled();
  });

  it('consumeToast clears the toast message', async () => {
    mockIsOnline = false;
    const { result } = renderHook(() => useShareRoute());

    await act(async () => {
      await result.current.share(baseInput);
    });
    expect(result.current.toastMessage).not.toBeNull();

    act(() => {
      result.current.consumeToast();
    });
    expect(result.current.toastMessage).toBeNull();
  });
});

describe('useShareRoute — happy path', () => {
  it('POSTs the expected payload shape with routingMode passthrough', async () => {
    const { result } = renderHook(() => useShareRoute());

    await act(async () => {
      await result.current.share({ ...baseInput, routingMode: 'flat' });
    });

    expect(createRouteShareSpy).toHaveBeenCalledTimes(1);
    const payload = createRouteShareSpy.mock.calls[0]![0] as {
      source: string;
      route: {
        origin: { lat: number; lon: number };
        destination: { lat: number; lon: number };
        geometryPolyline6: string;
        distanceMeters: number;
        durationSeconds: number;
        routingMode: string;
      };
    };
    expect(payload.source).toBe('planned');
    expect(payload.route.origin).toEqual({ lat: 44.43, lon: 26.1 });
    expect(payload.route.destination).toEqual({ lat: 44.44, lon: 26.11 });
    expect(payload.route.geometryPolyline6).toBe('abcdefg');
    expect(payload.route.distanceMeters).toBe(5000);
    expect(payload.route.durationSeconds).toBe(900);
    expect(payload.route.routingMode).toBe('flat');
  });

  it('opens Share.share with the universal link and returns shared:true', async () => {
    const { result } = renderHook(() => useShareRoute());

    let out: Awaited<ReturnType<typeof result.current.share>> | undefined;
    await act(async () => {
      out = await result.current.share(baseInput);
    });

    expect(shareShareSpy).toHaveBeenCalledTimes(1);
    const [shareContent] = shareShareSpy.mock.calls[0]! as unknown as [
      { message: string; url: string; title: string },
      unknown,
    ];
    expect(shareContent.url).toBe(happyCreated.webUrl);
    expect(shareContent.message).toContain(happyCreated.webUrl);
    expect(shareContent.title).toBe('Share this route');

    expect(out).toEqual({
      shared: true,
      dismissedAction: null,
      share: happyCreated,
    });
    expect(result.current.toastMessage).toBeNull();
  });

  it('propagates the activityType when iOS returns a share target', async () => {
    shareShareSpy.mockResolvedValue({
      action: 'sharedAction',
      activityType: 'com.apple.UIKit.activity.Message',
    });
    const { result } = renderHook(() => useShareRoute());

    let out: Awaited<ReturnType<typeof result.current.share>> | undefined;
    await act(async () => {
      out = await result.current.share(baseInput);
    });

    expect(out).toMatchObject({
      shared: true,
      dismissedAction: 'com.apple.UIKit.activity.Message',
    });
  });

  it('returns shared:false/dismissed when the user cancels the sheet', async () => {
    shareShareSpy.mockResolvedValue({ action: 'dismissedAction' });
    const { result } = renderHook(() => useShareRoute());

    let out: Awaited<ReturnType<typeof result.current.share>> | undefined;
    await act(async () => {
      out = await result.current.share(baseInput);
    });

    expect(out).toEqual({ shared: false, reason: 'dismissed' });
    // Successful-but-dismissed should NOT trigger the error toast.
    expect(result.current.toastMessage).toBeNull();
  });

  it('builds a caption that mentions the destination label when provided', async () => {
    const { result } = renderHook(() => useShareRoute());

    await act(async () => {
      await result.current.share({ ...baseInput, destinationLabel: 'The park' });
    });

    const [shareContent] = shareShareSpy.mock.calls[0]! as unknown as [
      { message: string },
      unknown,
    ];
    expect(shareContent.message).toContain('to The park');
  });
});

describe('useShareRoute — API error', () => {
  it('surfaces the API error as a toast message and returns shared:false', async () => {
    createRouteShareSpy.mockRejectedValue(new Error('Server rejected request.'));
    const { result } = renderHook(() => useShareRoute());

    let out: Awaited<ReturnType<typeof result.current.share>> | undefined;
    await act(async () => {
      out = await result.current.share(baseInput);
    });

    expect(out).toEqual({
      shared: false,
      reason: 'error',
      message: 'Server rejected request.',
    });
    expect(result.current.toastMessage).toBe('Server rejected request.');
    expect(shareShareSpy).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error has no message', async () => {
    createRouteShareSpy.mockRejectedValue(new Error(''));
    const { result } = renderHook(() => useShareRoute());

    await act(async () => {
      await result.current.share(baseInput);
    });

    expect(result.current.toastMessage).toBe(
      'Couldn\u2019t share this route. Try again.',
    );
  });
});
