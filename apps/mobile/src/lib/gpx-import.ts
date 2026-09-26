/**
 * gpx-import — pick a `.gpx` file and read it off disk.
 *
 * The native-facing half of GPX import; all parsing lives in the pure
 * `gpx-parse.ts` so it stays testable without mocking Expo.
 *
 * `expo-document-picker` resolves its native module with `requireNativeModule`
 * at *import* time, which throws — uncatchably, on Android — when the module
 * is missing from the binary. So it is probed with `hasExpoNativeModule` and
 * then lazily `require`d, never imported at the top level. See error-log
 * #2/#2b/#21b, and note that `NativeModules.ExpoDocumentPicker` is NOT a valid
 * probe: it is `undefined` on the bridgeless preview/production builds even
 * when the module is present.
 */
// Static import of the legacy FileSystem API — a dynamic `await import()`
// fails silently in Hermes release bytecode on this project, and the rest of
// the codebase uses the legacy surface (see `gpx-share.ts`).
import * as FileSystem from 'expo-file-system/legacy';

import { hasExpoNativeModule } from './expoNativeModule';

/** Registered Expo module name — NOT the npm package name. */
const DOCUMENT_PICKER_MODULE = 'ExpoDocumentPicker';

export interface PickedGpxFile {
  readonly uri: string;
  /** File name as reported by the provider, e.g. `sunday-loop.gpx`. */
  readonly fileName: string;
}

export type PickGpxResult =
  | { readonly ok: true; readonly file: PickedGpxFile }
  | { readonly ok: false; readonly reason: 'cancelled' | 'unavailable' | 'error' };

interface DocumentPickerAsset {
  readonly uri: string;
  readonly name?: string;
}

interface DocumentPickerModule {
  getDocumentAsync: (options: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: DocumentPickerAsset[] | null;
  }>;
}

/** True when this build can actually open a file picker. */
export const isGpxImportAvailable = (): boolean =>
  hasExpoNativeModule(DOCUMENT_PICKER_MODULE);

/**
 * Open the system file picker for a GPX file.
 *
 * Deliberately requests a wildcard MIME filter rather than a GPX type.
 * Providers disagree
 * wildly about what a `.gpx` is — Drive says `application/octet-stream`, some
 * mail clients say `text/xml`, few say `application/gpx+xml` — and any file
 * whose reported type is outside the filter is shown greyed-out and
 * unselectable. Filtering would therefore hide real GPX files from the rider.
 * Content is the real gate: `parseGpx` rejects anything that is not GPX and
 * the screen shows a clear message.
 *
 * `copyToCacheDirectory` is required: a `content://` URI handed over by
 * another app is not readable by FileSystem directly.
 */
export const pickGpxFile = async (): Promise<PickGpxResult> => {
  if (!isGpxImportAvailable()) {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const picker = require('expo-document-picker') as DocumentPickerModule;

    const result = await picker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return { ok: false, reason: 'cancelled' };
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return { ok: false, reason: 'error' };
    }

    return {
      ok: true,
      file: { uri: asset.uri, fileName: asset.name ?? 'course.gpx' },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
};

/**
 * Largest GPX we will read into memory, in bytes.
 *
 * A real course is small: a 4-hour ride recorded at 1 Hz is ~14,000 points,
 * which is a couple of MB of XML at most. 20 MB is therefore generous for every
 * legitimate file while still bounded — the point is that the SIZE IS CHECKED,
 * because this reads a file the rider picked from anywhere on the device or from
 * a cloud provider, straight into a JavaScript string.
 */
const MAX_GPX_BYTES = 20 * 1024 * 1024;

/**
 * Read a picked file's text. Returns `null` on any failure.
 *
 * ⚠️ The size is checked BEFORE the read. `readAsStringAsync` materialises the
 * whole file as one string, so an oversized pick (a mis-tapped video, a database
 * dump, a zip bomb's expansion) was an out-of-memory crash rather than an error
 * the screen could show — and this is a `content://` URI from an arbitrary
 * provider, so nothing upstream had bounded it.
 *
 * An over-cap file returns `null`, which `course-import.tsx` renders as its
 * generic `course.errorRead`. That is deliberately not a new dedicated message:
 * "we could not read this file" is true, and it avoids three locales of copy for
 * a case a real course never hits.
 */
export const readGpxFile = async (uri: string): Promise<string | null> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    // The type says `size` is always present when the file exists, but this is a
    // `content://` URI from an arbitrary provider, so the runtime guard stays:
    // an UNKNOWN size is not a reason to refuse a file that is probably fine.
    // Only a size we positively know is too big stops the read.
    if (info.exists && typeof info.size === 'number' && info.size > MAX_GPX_BYTES) {
      return null;
    }
    return await FileSystem.readAsStringAsync(uri);
  } catch {
    return null;
  }
};

/**
 * Turn a file name into a course name: strip the extension and tidy the
 * separators exporters use. Only reached when the file carried no name of its
 * own.
 */
export const courseNameFromFileName = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.gpx$/i, '');
  const tidied = withoutExtension.replace(/[_-]+/g, ' ').trim();
  return tidied.length > 0 ? tidied : fileName;
};

// ---------------------------------------------------------------------------
// "Open with Defensive Pedal" — files handed to us by another app
// ---------------------------------------------------------------------------

/**
 * Does this URL look like a file another app asked us to open, rather than one
 * of our own deep links?
 *
 * Scheme is the whole test on purpose. A content URI from Drive or Gmail
 * carries no file extension to match on, and our own links are always
 * `https://routes.defensivepedal.com/...` or `defensivepedal*://...`, so
 * anything arriving as `content://` or `file://` reached us through the GPX
 * intent filters. If it turns out not to be GPX, `parseGpx` says so with a
 * clear message — a slightly generous match degrades to an honest error.
 */
export const isOpenableFileUri = (url: string): boolean =>
  /^(content|file):\/\//i.test(url.trim());

/** Best-effort display name from a URI; falls back to a generic course name. */
const fileNameFromUri = (url: string): string => {
  try {
    const withoutQuery = url.split('?')[0] ?? url;
    const segment = decodeURIComponent(withoutQuery.split('/').pop() ?? '');
    return /\.gpx$/i.test(segment) ? segment : 'course.gpx';
  } catch {
    return 'course.gpx';
  }
};

/**
 * Copy an incoming file into our own cache and return a stable path.
 *
 * Staging immediately is the point. Android grants read access to a
 * `content://` URI for the life of the receiving activity's task, so holding
 * the original URI while the rider finishes onboarding — or just backgrounds
 * the app — can leave us with a permission that has lapsed. Copying costs
 * milliseconds for a file this size and turns a borrowed handle into
 * something we own.
 *
 * Returns `null` when the file cannot be read at all, which the caller
 * surfaces as a normal import error.
 */
export const stageIncomingGpx = async (
  url: string,
): Promise<PickedGpxFile | null> => {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return null;

  const fileName = fileNameFromUri(url);
  const target = `${cacheDir}incoming-course-${Date.now()}.gpx`;

  try {
    await FileSystem.copyAsync({ from: url, to: target });
    return { uri: target, fileName };
  } catch {
    // Some providers refuse copyAsync on a content URI but allow a direct
    // read. Worth the second attempt before declaring the file unreadable.
    try {
      const text = await FileSystem.readAsStringAsync(url);
      await FileSystem.writeAsStringAsync(target, text);
      return { uri: target, fileName };
    } catch {
      return null;
    }
  }
};
