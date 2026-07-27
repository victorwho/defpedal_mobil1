// @vitest-environment happy-dom
/**
 * gpx-share — Unit Tests
 *
 * Verifies the write→share pipeline, the 'garmin' target hand-off, and the
 * Garmin→share-sheet fallback that keeps the file from dead-ending.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (declared BEFORE SUT import)
// ---------------------------------------------------------------------------

const writeSpy = vi.fn<(uri: string, content: string) => Promise<void>>();
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  writeAsStringAsync: (uri: string, content: string) => writeSpy(uri, content),
}));

const shareFileSpy = vi.fn<(uri: string, opts: unknown) => Promise<boolean>>();
vi.mock('../shareImage', () => ({
  shareFile: (uri: string, opts: unknown) => shareFileSpy(uri, opts),
  preloadSharing: () => undefined,
}));

const sendToGarminSpy = vi.fn<(uri: string) => Promise<boolean>>();
vi.mock('../garmin', () => ({
  sendGpxToGarminConnect: (uri: string) => sendToGarminSpy(uri),
}));

// ---------------------------------------------------------------------------
// SUT import — after mocks
// ---------------------------------------------------------------------------

const { writeAndShareGpx } = await import('../gpx-share');

const GPX = '<?xml version="1.0"?><gpx></gpx>';
const OPTIONS = { fileBaseName: 'defensive-pedal-route', dialogTitle: 'Export' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  writeSpy.mockReset().mockResolvedValue(undefined);
  shareFileSpy.mockReset().mockResolvedValue(true);
  sendToGarminSpy.mockReset().mockResolvedValue(true);
});

describe('writeAndShareGpx — share target (default)', () => {
  it('writes the file and opens the share sheet', async () => {
    const result = await writeAndShareGpx(GPX, OPTIONS);

    expect(result.ok).toBe(true);
    expect(sendToGarminSpy).not.toHaveBeenCalled();
    expect(shareFileSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/mock\/cache\/defensive-pedal-route-\d+\.gpx$/),
      expect.objectContaining({ mimeType: 'application/gpx+xml' }),
    );
  });

  it('reports unavailable when the share sheet cannot open', async () => {
    shareFileSpy.mockResolvedValueOnce(false);
    const result = await writeAndShareGpx(GPX, OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports the write failure message', async () => {
    writeSpy.mockRejectedValueOnce(new Error('disk full'));
    const result = await writeAndShareGpx(GPX, OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'error', message: 'disk full' });
    expect(shareFileSpy).not.toHaveBeenCalled();
  });
});

describe('writeAndShareGpx — garmin target', () => {
  it('hands the written file to Garmin Connect and skips the share sheet', async () => {
    const result = await writeAndShareGpx(GPX, { ...OPTIONS, target: 'garmin' });

    expect(result.ok).toBe(true);
    expect(sendToGarminSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/mock\/cache\/defensive-pedal-route-\d+\.gpx$/),
    );
    expect(shareFileSpy).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet when the Garmin hand-off fails', async () => {
    sendToGarminSpy.mockResolvedValueOnce(false);
    const result = await writeAndShareGpx(GPX, { ...OPTIONS, target: 'garmin' });

    expect(result.ok).toBe(true);
    expect(shareFileSpy).toHaveBeenCalledTimes(1);
  });
});
