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
 * Mirrors the guard pattern in `push-notifications.ts` and the lazy-require
 * discipline enforced by `.claude/error-log.md` errors #2, #21, #23.
 *
 * Note: We use `await import()` for the Expo modules rather than `require()`
 * because `require()` of Expo modules triggers eager resolution of transitive
 * dependencies (some with side effects) at module-load time, which can throw
 * outside of a try/catch boundary. Dynamic `import()` is deferred and its
 * rejection is catchable.
 */
import { NativeModules } from 'react-native';

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

// ---------------------------------------------------------------------------
// Native module guards
// ---------------------------------------------------------------------------

/**
 * expo-sharing + expo-media-library register via Expo Modules API
 * (`globalThis.expo.modules.ExpoSharing`), NOT the classic RN bridge.
 * See error-log #21. Probe presence via `requireOptionalNativeModule`
 * from `expo-modules-core` — returns null when the native side is absent.
 *
 * `NativeModules[name]` is kept as a belt-and-braces fallback for builds
 * where the Expo Modules runtime is not installed.
 */
type OptionalNativeProbe = (name: string) => unknown | null;

let _probe: OptionalNativeProbe | null | undefined;
let _probePromise: Promise<OptionalNativeProbe | null> | null = null;
const getNativeProbe = async (): Promise<OptionalNativeProbe | null> => {
  if (_probe !== undefined) return _probe;
  // Serialise concurrent callers onto a single import promise — prevents
  // two concurrent `import('expo-modules-core')` evaluations racing each
  // other, which in some test runtimes hits the un-mocked module path.
  if (_probePromise) return _probePromise;
  _probePromise = (async () => {
    try {
      const mod = (await import('expo-modules-core')) as unknown as {
        requireOptionalNativeModule?: OptionalNativeProbe;
      };
      _probe = typeof mod.requireOptionalNativeModule === 'function'
        ? mod.requireOptionalNativeModule
        : null;
    } catch {
      _probe = null;
    }
    return _probe;
  })();
  return _probePromise;
};

const hasExpoNative = async (name: string): Promise<boolean> => {
  const probe = await getNativeProbe();
  if (typeof probe !== 'function') {
    return Boolean(NativeModules[name]);
  }
  try {
    return probe(name) != null;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Lazy-loaded JS wrappers
// ---------------------------------------------------------------------------

type SharingModule = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (url: string, options?: Record<string, unknown>) => Promise<void>;
};

type MediaLibraryModule = {
  requestPermissionsAsync: () => Promise<{ status: string; granted: boolean }>;
  saveToLibraryAsync: (localUri: string) => Promise<void>;
};

let _sharing: SharingModule | null | undefined;
let _sharingPromise: Promise<SharingModule | null> | null = null;
const getSharing = async (): Promise<SharingModule | null> => {
  if (!(await hasExpoNative('ExpoSharing'))) return null;
  if (_sharing !== undefined) return _sharing;
  if (_sharingPromise) return _sharingPromise;
  _sharingPromise = (async () => {
    try {
      const mod = (await import('expo-sharing')) as unknown as SharingModule;
      _sharing = mod;
    } catch {
      _sharing = null;
    }
    return _sharing;
  })();
  return _sharingPromise;
};

let _media: MediaLibraryModule | null | undefined;
let _mediaPromise: Promise<MediaLibraryModule | null> | null = null;
const getMediaLibrary = async (): Promise<MediaLibraryModule | null> => {
  if (!(await hasExpoNative('ExpoMediaLibrary'))) return null;
  if (_media !== undefined) return _media;
  if (_mediaPromise) return _mediaPromise;
  _mediaPromise = (async () => {
    try {
      const mod = (await import('expo-media-library')) as unknown as MediaLibraryModule;
      _media = mod;
    } catch {
      _media = null;
    }
    return _media;
  })();
  return _mediaPromise;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const tryShare = async (fileUri: string, caption: string): Promise<boolean> => {
  const Sharing = await getSharing();
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

    // Expo's shareAsync resolves normally even on user cancel — we treat
    // that as a successful share attempt (the sheet was shown).
    await Sharing.shareAsync(fileUri, {
      mimeType: 'image/png',
      dialogTitle: caption || 'Share your ride',
    });
    return true;
  } catch (error: unknown) {
    logWarn('shareImage: shareAsync failed', error);
    return false;
  }
};

const trySaveToLibrary = async (fileUri: string): Promise<boolean> => {
  const MediaLibrary = await getMediaLibrary();
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
