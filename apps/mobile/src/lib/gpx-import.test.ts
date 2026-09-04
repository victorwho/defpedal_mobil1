import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const copyBehaviour = { mode: 'ok' as 'ok' | 'throw' };
const readBehaviour = { mode: 'ok' as 'ok' | 'throw' };

vi.mock('expo-file-system/legacy', () => ({
  get cacheDirectory() {
    return 'file:///cache/';
  },
  get documentDirectory() {
    return 'file:///documents/';
  },
  copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    if (copyBehaviour.mode === 'throw') throw new Error('copy refused');
    files.set(to, files.get(from) ?? '<gpx/>');
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    if (readBehaviour.mode === 'throw') throw new Error('read refused');
    const contents = files.get(uri);
    if (contents === undefined) throw new Error('ENOENT');
    return contents;
  }),
  writeAsStringAsync: vi.fn(async (uri: string, contents: string) => {
    files.set(uri, contents);
  }),
}));

vi.mock('./expoNativeModule', () => ({
  hasExpoNativeModule: vi.fn(() => false),
}));

const { isGpxImportAvailable, isOpenableFileUri, pickGpxFile, stageIncomingGpx } =
  await import('./gpx-import');

beforeEach(() => {
  files.clear();
  copyBehaviour.mode = 'ok';
  readBehaviour.mode = 'ok';
});

describe('isOpenableFileUri', () => {
  it('accepts the schemes another app hands us a file with', () => {
    expect(isOpenableFileUri('content://com.android.providers/document/1234')).toBe(true);
    expect(isOpenableFileUri('file:///storage/emulated/0/Download/loop.gpx')).toBe(true);
    expect(isOpenableFileUri('CONTENT://Upper/Case')).toBe(true);
    expect(isOpenableFileUri('  file:///padded.gpx  ')).toBe(true);
  });

  it('rejects our own deep links', () => {
    // These reach RouteShareDeepLinkHandler instead; claiming them here would
    // send a shared route into the GPX importer.
    expect(isOpenableFileUri('https://routes.defensivepedal.com/r/ABC123')).toBe(false);
    expect(isOpenableFileUri('defensivepedal://route-share/ABC123')).toBe(false);
    expect(isOpenableFileUri('defensivepedal-preview://course')).toBe(false);
  });

  it('rejects junk without throwing', () => {
    expect(isOpenableFileUri('')).toBe(false);
    expect(isOpenableFileUri('not a url')).toBe(false);
  });
});

describe('stageIncomingGpx', () => {
  it('copies the incoming file into our own cache', () => {
    // Staging immediately matters: Android's read grant on a content URI
    // lasts only as long as the receiving task.
    files.set('content://provider/doc/1', '<gpx>real</gpx>');

    return stageIncomingGpx('content://provider/doc/1').then((staged) => {
      expect(staged).not.toBeNull();
      expect(staged!.uri.startsWith('file:///cache/incoming-course-')).toBe(true);
      expect(staged!.uri.endsWith('.gpx')).toBe(true);
      expect(files.get(staged!.uri)).toBe('<gpx>real</gpx>');
    });
  });

  it('falls back to read-then-write when copy is refused', async () => {
    copyBehaviour.mode = 'throw';
    files.set('content://provider/doc/2', '<gpx>fallback</gpx>');

    const staged = await stageIncomingGpx('content://provider/doc/2');

    expect(staged).not.toBeNull();
    expect(files.get(staged!.uri)).toBe('<gpx>fallback</gpx>');
  });

  it('returns null when the file cannot be read at all', async () => {
    copyBehaviour.mode = 'throw';
    readBehaviour.mode = 'throw';

    expect(await stageIncomingGpx('content://provider/doc/3')).toBeNull();
  });

  it('keeps a real .gpx file name from the URI', async () => {
    files.set('file:///storage/Download/sunday-loop.gpx', '<gpx/>');

    const staged = await stageIncomingGpx('file:///storage/Download/sunday-loop.gpx');

    expect(staged!.fileName).toBe('sunday-loop.gpx');
  });

  it('decodes a percent-encoded file name', async () => {
    files.set('file:///storage/Sunday%20loop.gpx', '<gpx/>');

    const staged = await stageIncomingGpx('file:///storage/Sunday%20loop.gpx');

    expect(staged!.fileName).toBe('Sunday loop.gpx');
  });

  it('falls back to a generic name for an extensionless content URI', async () => {
    // Cloud providers hand over opaque document ids with no extension; the
    // course name comes from the GPX metadata anyway.
    files.set('content://com.google.android.apps.docs/document/acc%3D1%3Bdoc%3D99', '<gpx/>');

    const staged = await stageIncomingGpx(
      'content://com.google.android.apps.docs/document/acc%3D1%3Bdoc%3D99',
    );

    expect(staged!.fileName).toBe('course.gpx');
  });

  it('ignores a query string when deriving the name', async () => {
    files.set('file:///storage/loop.gpx?token=abc', '<gpx/>');

    const staged = await stageIncomingGpx('file:///storage/loop.gpx?token=abc');

    expect(staged!.fileName).toBe('loop.gpx');
  });
});

describe('pickGpxFile', () => {
  it('reports unavailable when the native module is absent', async () => {
    // The guard exists because expo-document-picker resolves its native
    // module at import time and throws uncatchably on Android when missing.
    expect(isGpxImportAvailable()).toBe(false);
    expect(await pickGpxFile()).toEqual({ ok: false, reason: 'unavailable' });
  });
});
