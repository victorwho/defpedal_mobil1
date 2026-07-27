/**
 * gpx-share — writes a GPX XML string to the cache directory and hands it
 * to the system share sheet. Shared plumbing for the GPX export surfaces
 * (planned route, saved route, recorded trip).
 *
 * Never throws — every failure collapses into a discriminated result so
 * caller hooks can surface a toast without their own try/catch gymnastics.
 */
// Static (not dynamic) import of expo-file-system — dynamic `await import()`
// fails silently in Hermes release bytecode on this project (see error log /
// impact-summary bug). Legacy API matches the rest of the codebase.
import * as FileSystem from 'expo-file-system/legacy';

import { preloadSharing, shareFile } from './shareImage';

/**
 * Warms the share-sheet native module so the first export doesn't stall on
 * dynamic module loading. Hooks call this on mount.
 */
export function preloadGpxShare(): void {
  preloadSharing();
}

export type WriteAndShareGpxResult =
  | { ok: true; fileUri: string }
  | { ok: false; reason: 'unavailable' | 'error'; message?: string };

export interface WriteAndShareGpxOptions {
  /** Filename prefix, e.g. 'defensive-pedal-route'. A timestamp + .gpx is appended. */
  readonly fileBaseName: string;
  readonly dialogTitle: string;
}

const GPX_MIME_TYPE = 'application/gpx+xml';
const GPX_UTI = 'com.topografix.gpx';

export async function writeAndShareGpx(
  gpx: string,
  options: WriteAndShareGpxOptions,
): Promise<WriteAndShareGpxResult> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      return { ok: false, reason: 'unavailable' };
    }

    const fileUri = `${cacheDir}${options.fileBaseName}-${Date.now()}.gpx`;
    await FileSystem.writeAsStringAsync(fileUri, gpx);

    const shared = await shareFile(fileUri, {
      mimeType: GPX_MIME_TYPE,
      dialogTitle: options.dialogTitle,
      uti: GPX_UTI,
    });

    if (!shared) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, fileUri };
  } catch (error: unknown) {
    return {
      ok: false,
      reason: 'error',
      message:
        error instanceof Error && error.message ? error.message : undefined,
    };
  }
}
