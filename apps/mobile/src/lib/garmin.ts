/**
 * garmin — "Send to Garmin Connect" hand-off for GPX exports (Android).
 *
 * The Garmin Connect app imports a GPX opened via ACTION_VIEW as a course
 * and auto-syncs it to the user's paired watch/computer. Firing an explicit
 * intent at the Garmin package skips the generic share sheet, giving Garmin
 * owners a near-one-tap path (they confirm the import inside Garmin's app).
 *
 * iOS has no explicit-intent equivalent — `isGarminConnectInstalled` returns
 * false there and callers fall back to the ordinary share sheet, where
 * Garmin Connect appears as a target if installed.
 *
 * Module loading: sync `require()` behind the `hasExpoNativeModule` guard —
 * the project-standard pattern (see CLAUDE.md Notifications §1/§3). Metro
 * inlines `require('literal')` into the main bundle as a static dependency;
 * `await import()` would create an async split point whose chunk fetch dies
 * with the Metro USB tether in dev (observed 2026-07-27) and has a history
 * of silent failure in Hermes release bytecode (see useShareRide.ts).
 * The require is routed through an injectable loader so unit tests can
 * substitute a mock (vi.mock does not intercept runtime `require()`).
 *
 * Requires:
 *   - `expo-intent-launcher` (native module — guard per error-log #21b/#23b)
 *   - a `<queries><package .../></queries>` entry for the Garmin package in
 *     AndroidManifest.xml (Android 11+ package visibility)
 */
import { Platform } from 'react-native';
// Static import — resolved in the main bundle; the Hermes-safe pattern
// proven by useShareRide.ts.
import * as FileSystem from 'expo-file-system/legacy';

import { hasExpoNativeModule } from './expoNativeModule';

export const GARMIN_CONNECT_PACKAGE = 'com.garmin.android.apps.connectmobile';

const GPX_MIME_TYPE = 'application/gpx+xml';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION — lets Garmin read our FileProvider URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

type IntentLauncherModule = {
  startActivityAsync: (
    activityAction: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  getApplicationIconAsync?: (packageName: string) => Promise<string>;
};

type IntentLauncherLoader = () => IntentLauncherModule;

let loadIntentLauncher: IntentLauncherLoader = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-intent-launcher') as IntentLauncherModule;

/** Test-only: substitutes the module loader (vi.mock can't intercept require). */
export const setIntentLauncherLoaderForTesting = (
  loader: IntentLauncherLoader,
): void => {
  loadIntentLauncher = loader;
  _launcher = undefined;
};

let _launcher: IntentLauncherModule | null | undefined;
const getIntentLauncher = (): IntentLauncherModule | null => {
  if (Platform.OS !== 'android') return null;
  if (!hasExpoNativeModule('ExpoIntentLauncher')) return null;
  if (_launcher !== undefined) return _launcher;
  try {
    _launcher = loadIntentLauncher();
  } catch {
    _launcher = null;
  }
  return _launcher;
};

// Session-scoped cache — installed state doesn't flip mid-session often
// enough to matter, and the probe does a native round-trip.
let _installedPromise: Promise<boolean> | null = null;

/**
 * Whether the Garmin Connect Android app is installed. Fails soft to false
 * (iOS, missing native module, probe error) so callers degrade to the
 * generic share sheet.
 */
export const isGarminConnectInstalled = (): Promise<boolean> => {
  if (_installedPromise) return _installedPromise;
  _installedPromise = (async () => {
    const launcher = getIntentLauncher();
    if (!launcher || typeof launcher.getApplicationIconAsync !== 'function') {
      return false;
    }
    try {
      const icon = await launcher.getApplicationIconAsync(GARMIN_CONNECT_PACKAGE);
      return typeof icon === 'string' && icon.length > 0;
    } catch {
      return false;
    }
  })();
  return _installedPromise;
};

/** Test-only: resets the session caches. */
export const resetGarminInstalledCacheForTesting = (): void => {
  _installedPromise = null;
  _launcher = undefined;
};

/**
 * Opens the given GPX file directly in Garmin Connect via an explicit
 * ACTION_VIEW intent. Returns false when the hand-off can't happen (module
 * absent, app missing, content-URI failure) — callers should fall back to
 * the generic share sheet.
 *
 * @param fileUri Local `file://` URI of the written GPX.
 */
export const sendGpxToGarminConnect = async (fileUri: string): Promise<boolean> => {
  const launcher = getIntentLauncher();
  if (!launcher) return false;

  try {
    // FileProvider content:// URI — other apps can't read our file:// paths.
    const contentUri = await FileSystem.getContentUriAsync(fileUri);

    await launcher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: GPX_MIME_TYPE,
      packageName: GARMIN_CONNECT_PACKAGE,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return true;
  } catch {
    return false;
  }
};
