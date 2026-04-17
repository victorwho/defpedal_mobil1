// @vitest-environment happy-dom
/**
 * shareImage — Unit Tests
 *
 * Verifies the native-module guard, happy-path share+save, permission-denied
 * save path, and cancellation semantics.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — state per-test via mockReset()
// ---------------------------------------------------------------------------

const sharingMocks = {
  isAvailableAsync: vi.fn<() => Promise<boolean>>(),
  shareAsync: vi.fn<(url: string, opts?: Record<string, unknown>) => Promise<void>>(),
};

const mediaLibraryMocks = {
  requestPermissionsAsync: vi.fn<() => Promise<{ status: string; granted: boolean }>>(),
  saveToLibraryAsync: vi.fn<(uri: string) => Promise<void>>(),
};

vi.mock('expo-sharing', () => sharingMocks);
vi.mock('expo-media-library', () => mediaLibraryMocks);

// Toggleable guard — each test controls which native modules exist
let nativeModulesPresent: Record<string, boolean> = {};

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: (name: string) => (nativeModulesPresent[name] ? {} : null),
}));

// ---------------------------------------------------------------------------
// Helper — fresh module import after resetting mocks so internal caches reset
// ---------------------------------------------------------------------------

const importShareImage = async () => {
  vi.resetModules();
  return (await import('../shareImage')) as typeof import('../shareImage');
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  sharingMocks.isAvailableAsync.mockReset().mockResolvedValue(true);
  sharingMocks.shareAsync.mockReset().mockResolvedValue(undefined);
  mediaLibraryMocks.requestPermissionsAsync
    .mockReset()
    .mockResolvedValue({ status: 'granted', granted: true });
  mediaLibraryMocks.saveToLibraryAsync.mockReset().mockResolvedValue(undefined);

  // Silence expected warn output during negative-path tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  nativeModulesPresent = {
    ExpoSharing: true,
    ExpoMediaLibrary: true,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shareImage', () => {
  it('happy path: both share + save succeed', async () => {
    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'I just rode 8 km.');

    expect(result).toEqual({ shared: true, savedToLibrary: true });
    expect(sharingMocks.shareAsync).toHaveBeenCalledWith(
      'file:///tmp/ride.png',
      expect.objectContaining({
        mimeType: 'image/png',
        dialogTitle: 'I just rode 8 km.',
      }),
    );
    expect(mediaLibraryMocks.saveToLibraryAsync).toHaveBeenCalledWith(
      'file:///tmp/ride.png',
    );
  });

  it('permission denied: share succeeds, save returns false', async () => {
    mediaLibraryMocks.requestPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
    });

    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'caption');

    expect(result).toEqual({ shared: true, savedToLibrary: false });
    expect(mediaLibraryMocks.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('native modules missing: both false, does not throw', async () => {
    nativeModulesPresent = { ExpoSharing: false, ExpoMediaLibrary: false };

    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'caption');

    expect(result).toEqual({ shared: false, savedToLibrary: false });
    expect(sharingMocks.shareAsync).not.toHaveBeenCalled();
    expect(mediaLibraryMocks.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('share sheet unavailable: shared=false but save still attempted', async () => {
    sharingMocks.isAvailableAsync.mockResolvedValueOnce(false);

    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'caption');

    expect(result).toEqual({ shared: false, savedToLibrary: true });
    expect(sharingMocks.shareAsync).not.toHaveBeenCalled();
    expect(mediaLibraryMocks.saveToLibraryAsync).toHaveBeenCalled();
  });

  it('shareAsync throwing does not reject the outer promise', async () => {
    sharingMocks.shareAsync.mockRejectedValueOnce(new Error('user cancelled'));

    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'caption');

    expect(result.shared).toBe(false);
    expect(result.savedToLibrary).toBe(true);
  });

  it('only expo-sharing missing: save still runs', async () => {
    nativeModulesPresent = { ExpoSharing: false, ExpoMediaLibrary: true };

    const { shareImage } = await importShareImage();
    const result = await shareImage('file:///tmp/ride.png', 'caption');

    expect(result).toEqual({ shared: false, savedToLibrary: true });
  });
});
