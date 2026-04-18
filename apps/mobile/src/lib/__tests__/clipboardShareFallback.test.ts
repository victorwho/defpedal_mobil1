// @vitest-environment node
/**
 * clipboardShareFallback — Unit Tests
 *
 * Verifies JSON shape validation, TTL enforcement, base62 code
 * validation, platform gating, skip short-circuit, and clipboard
 * clearing on match.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockPlatform: 'android' | 'ios' = 'ios';

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatform;
    },
  },
}));

const getStringAsync = vi.fn<() => Promise<string>>();
const setStringAsync = vi.fn<(v: string) => Promise<boolean>>(async () => true);

vi.mock('expo-clipboard', () => ({
  getStringAsync,
  setStringAsync,
}));

const {
  CLIPBOARD_SHARE_TTL_MS,
  checkClipboardShareFallback,
  parseClipboardSharePayload,
} = await import('../clipboardShareFallback');

// ---------------------------------------------------------------------------
// parseClipboardSharePayload — pure tests
// ---------------------------------------------------------------------------

describe('parseClipboardSharePayload', () => {
  const now = 1_700_000_000_000;

  it('accepts a fresh valid payload', () => {
    const raw = JSON.stringify({ dp_share: 'abcd1234', ts: now - 1000 });
    expect(parseClipboardSharePayload(raw, now)).toBe('abcd1234');
  });

  it('rejects a stale payload (older than TTL)', () => {
    const raw = JSON.stringify({
      dp_share: 'abcd1234',
      ts: now - CLIPBOARD_SHARE_TTL_MS - 1,
    });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects a payload exactly at the TTL edge (boundary = stale)', () => {
    const raw = JSON.stringify({
      dp_share: 'abcd1234',
      ts: now - CLIPBOARD_SHARE_TTL_MS - 1,
    });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects a payload with a future timestamp (clock skew / tampering)', () => {
    const raw = JSON.stringify({
      dp_share: 'abcd1234',
      ts: now + 5_000,
    });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects missing dp_share key', () => {
    const raw = JSON.stringify({ ts: now });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects missing ts key', () => {
    const raw = JSON.stringify({ dp_share: 'abcd1234' });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects non-JSON content', () => {
    expect(parseClipboardSharePayload('not json', now)).toBeNull();
    expect(parseClipboardSharePayload('', now)).toBeNull();
    expect(parseClipboardSharePayload(null, now)).toBeNull();
    expect(parseClipboardSharePayload(undefined, now)).toBeNull();
  });

  it('rejects JSON with wrong field types', () => {
    expect(
      parseClipboardSharePayload(
        JSON.stringify({ dp_share: 12345, ts: now }),
        now,
      ),
    ).toBeNull();
    expect(
      parseClipboardSharePayload(
        JSON.stringify({ dp_share: 'abcd1234', ts: 'now' }),
        now,
      ),
    ).toBeNull();
  });

  it('rejects non-base62 code even when shape + TTL are valid', () => {
    const raw = JSON.stringify({ dp_share: 'bad-code', ts: now });
    expect(parseClipboardSharePayload(raw, now)).toBeNull();
  });

  it('rejects wrong-length code', () => {
    const rawShort = JSON.stringify({ dp_share: 'abc', ts: now });
    expect(parseClipboardSharePayload(rawShort, now)).toBeNull();
    const rawLong = JSON.stringify({ dp_share: 'abcd12345', ts: now });
    expect(parseClipboardSharePayload(rawLong, now)).toBeNull();
  });

  it('rejects bare string (not object)', () => {
    expect(
      parseClipboardSharePayload(JSON.stringify('abcd1234'), now),
    ).toBeNull();
  });

  it('rejects null JSON value', () => {
    expect(parseClipboardSharePayload('null', now)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkClipboardShareFallback — integration tests with mocked clipboard
// ---------------------------------------------------------------------------

describe('checkClipboardShareFallback', () => {
  beforeEach(() => {
    mockPlatform = 'ios';
    getStringAsync.mockReset();
    setStringAsync.mockReset().mockResolvedValue(true);
  });

  it('returns null on Android', async () => {
    mockPlatform = 'android';
    expect(await checkClipboardShareFallback()).toBeNull();
    expect(getStringAsync).not.toHaveBeenCalled();
  });

  it('short-circuits when skip=true', async () => {
    expect(await checkClipboardShareFallback({ skip: true })).toBeNull();
    expect(getStringAsync).not.toHaveBeenCalled();
  });

  it('returns null when clipboard read throws', async () => {
    getStringAsync.mockRejectedValue(new Error('permission denied'));
    expect(await checkClipboardShareFallback()).toBeNull();
  });

  it('returns null when clipboard is empty', async () => {
    getStringAsync.mockResolvedValue('');
    expect(await checkClipboardShareFallback()).toBeNull();
  });

  it('returns null for non-JSON clipboard content', async () => {
    getStringAsync.mockResolvedValue('Just some copied text');
    expect(await checkClipboardShareFallback()).toBeNull();
  });

  it('returns null when payload is stale', async () => {
    getStringAsync.mockResolvedValue(
      JSON.stringify({
        dp_share: 'abcd1234',
        ts: Date.now() - 10 * 60 * 1000, // 10 min old
      }),
    );
    expect(await checkClipboardShareFallback()).toBeNull();
  });

  it('returns the code and clears the clipboard on happy path', async () => {
    getStringAsync.mockResolvedValue(
      JSON.stringify({ dp_share: 'abcd1234', ts: Date.now() - 1000 }),
    );
    const code = await checkClipboardShareFallback();
    expect(code).toBe('abcd1234');
    expect(setStringAsync).toHaveBeenCalledWith('');
  });

  it('does not clear clipboard on non-match', async () => {
    getStringAsync.mockResolvedValue('random clipboard text');
    await checkClipboardShareFallback();
    expect(setStringAsync).not.toHaveBeenCalled();
  });
});
