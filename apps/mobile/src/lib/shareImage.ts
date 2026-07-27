/**
 * shareImage — platform-safe wrapper around `expo-sharing` + `expo-media-library`.
 *
 * Exposes the app's share sheet with a generated PNG + saves the image to the
 * device camera roll. Both operations fail soft:
 *
 *   - If the native module isn't present in the APK (dev build without a
 *     native rebuild), returns `{shared: false, savedToLibrary: false}` and
 *     logs a warning rather than crashing.
 *   - If the user cancels the share sheet, `Sharing.shareAsync` resolves
 *     normally on Expo — cancellation is not an error.
 *   - If the media-library permission is denied, the function still reports
 *     the share outcome truthfully rather than throwing.
 *
 * Module loading: sync `require()` behind the `hasExpoNativeModule` guard —
 * the project-standard pattern (CLAUDE.md Notifications §1/§3, errors #2,
 * #21, #23). Metro inlines `require('literal')` into the main bundle as a
 * static dependency. This file previously used `await import()`, which
 * creates an async split point whose chunk fetch dies with the Metro USB
 * tether in dev (observed 2026-07-27: "expo-sharing native module
 * unavailable" on a build where the module was present) and has a history
 * of silent failure in Hermes release bytecode (see useShareRide.ts).
 * Requires are routed through injectable loaders so unit tests can
 * substitute mocks (vi.mock does not intercept runtime `require()`).
 */
import { hasExpoNativeModule } from './expoNativeModule';

// Lightweight warn helper — centralised so tests can silence it and production
// builds can swap in a remote logger without touching call-sites.
const logWarn = (message: string, error?: unknown): void => {
  // eslint-disable-next-line no-console
  if (error !== undefined) console.warn(message, error);
  // eslint-disable-next-line no-console
  else console.warn(message);
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareImageResult {
  readonly shared: boolean;
  readonly savedToLibrary: boolean;
}

type SharingModule = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (url: string, options?: Record<string, unknown>) => Promise<void>;
};

type MediaLibraryModule = {
  requestPermissionsAsync: () => Promise<{ status: string; granted: boolean }>;
  saveToLibraryAsync: (localUri: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Guarded sync module loading (injectable for tests)
// ---------------------------------------------------------------------------

let loadSharingModule: () => SharingModule = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sharing') as SharingModule;
let loadMediaLibraryModule: () => MediaLibraryModule = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-media-library') as MediaLibraryModule;

let _sharing: SharingModule | null | undefined;
let _media: MediaLibraryModule | null | undefined;

/** Test-only: substitutes module loaders and clears caches. */
export const setShareModuleLoadersForTesting = (loaders: {
  sharing?: () => SharingModule;
  mediaLibrary?: () => MediaLibraryModule;
}): void => {
  if (loaders.sharing) loadSharingModule = loaders.sharing;
  if (loaders.mediaLibrary) loadMediaLibraryModule = loaders.mediaLibrary;
  _sharing = undefined;
  _media = undefined;
};

const getSharing = (): SharingModule | null => {
  if (!hasExpoNativeModule('ExpoSharing')) return null;
  if (_sharing !== undefined) return _sharing;
  try {
    _sharing = loadSharingModule();
  } catch {
    _sharing = null;
  }
  return _sharing;
};

const getMediaLibrary = (): MediaLibraryModule | null => {
  if (!hasExpoNativeModule('ExpoMediaLibrary')) return null;
  if (_media !== undefined) return _media;
  try {
    _media = loadMediaLibraryModule();
  } catch {
    _media = null;
  }
  return _media;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const tryShare = async (fileUri: string, caption: string): Promise<boolean> =>
  shareFile(fileUri, {
    mimeType: 'image/png',
    dialogTitle: caption || 'Share your ride',
  });

const trySaveToLibrary = async (fileUri: string): Promise<boolean> => {
  const MediaLibrary = getMediaLibrary();
  if (!MediaLibrary) {
    logWarn('shareImage: expo-media-library native module unavailable');
    return false;
  }

  try {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted && permission.status !== 'granted') {
      return false;
    }
    await MediaLibrary.saveToLibraryAsync(fileUri);
    return true;
  } catch (error: unknown) {
    logWarn('shareImage: saveToLibraryAsync failed', error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Warms the sharing module. With sync require the module lives in the main
 * bundle, so this is nearly free — kept as the mount-time hook contract so
 * a future loading-strategy change stays behind this seam.
 */
export function preloadSharing(): void {
  getSharing();
}

export interface ShareFileOptions {
  readonly mimeType: string;
  readonly dialogTitle: string;
  /** iOS Uniform Type Identifier, e.g. 'com.topografix.gpx'. */
  readonly uti?: string;
}

/**
 * Presents the system share sheet for an arbitrary local file. Never throws;
 * returns `false` when the native module is absent, the sheet is unavailable,
 * or `shareAsync` fails.
 *
 * Expo's `shareAsync` resolves normally even on user cancel — we treat that
 * as a successful share attempt (the sheet was shown).
 */
export async function shareFile(
  fileUri: string,
  options: ShareFileOptions,
): Promise<boolean> {
  const Sharing = getSharing();
  if (!Sharing) {
    logWarn('shareImage: expo-sharing native module unavailable');
    return false;
  }

  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      logWarn('shareImage: Sharing.isAvailableAsync returned false');
      return false;
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: options.mimeType,
      dialogTitle: options.dialogTitle,
      ...(options.uti ? { UTI: options.uti } : {}),
    });
    return true;
  } catch (error: unknown) {
    logWarn('shareImage: shareAsync failed', error);
    return false;
  }
}

/**
 * Presents the system share sheet for the given local PNG file and saves the
 * image to the device's camera roll (when permission granted). Never throws.
 *
 * @param fileUri   Local `file://` URI produced by the off-screen capture host.
 * @param caption   Human-readable caption to hand to the share sheet dialog.
 */
export async function shareImage(
  fileUri: string,
  caption: string,
): Promise<ShareImageResult> {
  const [shared, savedToLibrary] = await Promise.all([
    tryShare(fileUri, caption),
    trySaveToLibrary(fileUri),
  ]);
  return { shared, savedToLibrary };
}
