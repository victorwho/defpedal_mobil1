// @vitest-environment happy-dom
/**
 * garmin — Unit Tests
 *
 * Verifies platform/native-module gating, installed-app detection via the
 * icon probe, the explicit ACTION_VIEW hand-off (content URI + mime +
 * package + grant-read flag), and fail-soft behavior everywhere.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

let mockPlatformOS = 'android';
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  return {
    ...actual,
    Platform: {
      get OS() {
        return mockPlatformOS;
      },
    },
  };
});

let mockHasNativeModule = true;
vi.mock('../expoNativeModule', () => ({
  hasExpoNativeModule: () => mockHasNativeModule,
}));

// Loader seam — vi.mock can't intercept the SUT's runtime require().
const startActivitySpy = vi.fn<
  (action: string, params?: Record<string, unknown>) => Promise<unknown>
>();
const getIconSpy = vi.fn<(packageName: string) => Promise<string>>();
const launcherMock = {
  startActivityAsync: (action: string, params?: Record<string, unknown>) =>
    startActivitySpy(action, params),
  getApplicationIconAsync: (packageName: string) => getIconSpy(packageName),
};

const getContentUriSpy = vi.fn<(uri: string) => Promise<string>>();
vi.mock('expo-file-system/legacy', () => ({
  getContentUriAsync: (uri: string) => getContentUriSpy(uri),
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const {
  GARMIN_CONNECT_PACKAGE,
  isGarminConnectInstalled,
  resetGarminInstalledCacheForTesting,
  sendGpxToGarminConnect,
  setIntentLauncherLoaderForTesting,
} = await import('../garmin');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPlatformOS = 'android';
  mockHasNativeModule = true;
  startActivitySpy.mockReset().mockResolvedValue(undefined);
  getIconSpy.mockReset().mockResolvedValue('base64-icon-data');
  getContentUriSpy
    .mockReset()
    .mockResolvedValue('content://com.defensivepedal.mobile.dev.fileprovider/cache/route.gpx');
  setIntentLauncherLoaderForTesting(() => launcherMock);
  resetGarminInstalledCacheForTesting();
});

describe('isGarminConnectInstalled', () => {
  it('returns true when the icon probe answers with data', async () => {
    await expect(isGarminConnectInstalled()).resolves.toBe(true);
    expect(getIconSpy).toHaveBeenCalledWith(GARMIN_CONNECT_PACKAGE);
  });

  it('returns false when the app is absent (empty icon)', async () => {
    getIconSpy.mockResolvedValueOnce('');
    await expect(isGarminConnectInstalled()).resolves.toBe(false);
  });

  it('returns false on iOS without touching the launcher', async () => {
    mockPlatformOS = 'ios';
    await expect(isGarminConnectInstalled()).resolves.toBe(false);
    expect(getIconSpy).not.toHaveBeenCalled();
  });

  it('returns false when the native module is missing', async () => {
    mockHasNativeModule = false;
    await expect(isGarminConnectInstalled()).resolves.toBe(false);
  });

  it('returns false when the probe throws', async () => {
    getIconSpy.mockRejectedValueOnce(new Error('boom'));
    await expect(isGarminConnectInstalled()).resolves.toBe(false);
  });

  it('caches the result for the session', async () => {
    await isGarminConnectInstalled();
    await isGarminConnectInstalled();
    expect(getIconSpy).toHaveBeenCalledTimes(1);
  });
});

describe('sendGpxToGarminConnect', () => {
  it('fires an explicit ACTION_VIEW at the Garmin package with the content URI', async () => {
    const sent = await sendGpxToGarminConnect('file:///cache/route.gpx');

    expect(sent).toBe(true);
    expect(getContentUriSpy).toHaveBeenCalledWith('file:///cache/route.gpx');
    expect(startActivitySpy).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://com.defensivepedal.mobile.dev.fileprovider/cache/route.gpx',
      type: 'application/gpx+xml',
      packageName: GARMIN_CONNECT_PACKAGE,
      flags: 1,
    });
  });

  it('returns false on iOS', async () => {
    mockPlatformOS = 'ios';
    await expect(sendGpxToGarminConnect('file:///cache/route.gpx')).resolves.toBe(false);
    expect(startActivitySpy).not.toHaveBeenCalled();
  });

  it('returns false when the intent launch throws (app uninstalled mid-flow)', async () => {
    startActivitySpy.mockRejectedValueOnce(new Error('ActivityNotFound'));
    await expect(sendGpxToGarminConnect('file:///cache/route.gpx')).resolves.toBe(false);
  });

  it('returns false when the content URI cannot be created', async () => {
    getContentUriSpy.mockRejectedValueOnce(new Error('no provider'));
    await expect(sendGpxToGarminConnect('file:///cache/route.gpx')).resolves.toBe(false);
    expect(startActivitySpy).not.toHaveBeenCalled();
  });
});
