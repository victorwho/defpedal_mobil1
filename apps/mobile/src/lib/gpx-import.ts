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

/** Read a picked file's text. Returns `null` on any failure. */
export const readGpxFile = async (uri: string): Promise<string | null> => {
  try {
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
