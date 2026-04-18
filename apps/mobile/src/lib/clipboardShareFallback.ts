/**
 * iOS clipboard fallback for deferred deep-link claim.
 *
 * Android has the Play Store install-referrer API; iOS has nothing
 * equivalent. The workaround: when the /r/<code> web viewer sees an
 * unrecognised UA with no installed app, it writes a short-lived JSON
 * payload into the system clipboard:
 *
 *   {"dp_share":"abcd1234","ts":1729123456789}
 *
 * On cold start, this module reads the clipboard ONCE, validates the
 * shape + TTL + code, and returns the share code. Critical rules:
 *
 *   - Runs ONLY on a cold start where no deep-link URL arrived and no
 *     `pendingShareClaim` is already queued. Polling the clipboard on
 *     every warm resume would trigger iOS 14+'s paste banner and feel
 *     invasive.
 *   - TTL = 5 minutes — the user has to launch the app shortly after
 *     tapping the web link. Anything older is almost certainly stale
 *     and unrelated to this session.
 *   - After a successful parse, the clipboard is cleared so this
 *     payload cannot re-fire on the next cold start.
 */
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

import { isValidShareCode } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CLIPBOARD_SHARE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClipboardModule = {
  getStringAsync: () => Promise<string>;
  setStringAsync: (value: string) => Promise<boolean>;
};

// ---------------------------------------------------------------------------
// Lazy module loader
// ---------------------------------------------------------------------------

const loadClipboard = (): ClipboardModule | null => {
  // expo-clipboard is a standard Expo module autolinked at build time.
  // The static `import * as Clipboard` above resolves at module load; if
  // the native bridge isn't linked yet, the first call on one of these
  // fns will throw — caught by the try/catch in the caller below.
  if (
    typeof Clipboard?.getStringAsync !== 'function' ||
    typeof Clipboard?.setStringAsync !== 'function'
  ) {
    return null;
  }
  return {
    getStringAsync: Clipboard.getStringAsync,
    setStringAsync: Clipboard.setStringAsync,
  };
};

// ---------------------------------------------------------------------------
// Payload shape validator
// ---------------------------------------------------------------------------

type ClipboardSharePayload = {
  dp_share: string;
  ts: number;
};

/**
 * Parse a JSON string into the clipboard share payload shape and validate
 * each field. Returns null for any malformed input, stale timestamp, or
 * non-base62 code.
 */
export const parseClipboardSharePayload = (
  raw: string | null | undefined,
  now: number = Date.now(),
  ttlMs: number = CLIPBOARD_SHARE_TTL_MS,
): string | null => {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Partial<ClipboardSharePayload>;

  if (typeof obj.dp_share !== 'string') return null;
  if (typeof obj.ts !== 'number' || !Number.isFinite(obj.ts)) return null;

  // TTL check — payload must have been written within the window.
  // Also guards against a "ts" in the future (clock skew / tampering).
  const age = now - obj.ts;
  if (age < 0 || age > ttlMs) return null;

  if (!isValidShareCode(obj.dp_share)) return null;

  return obj.dp_share;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CheckClipboardShareFallbackOptions = {
  /**
   * Short-circuit return null when true — caller can skip the clipboard
   * read entirely (e.g. a pending claim is already queued, or a deep-link
   * URL arrived this cold start). Defaults to false.
   */
  skip?: boolean;
};

/**
 * One-shot clipboard read for the iOS deferred-deep-link fallback.
 * Returns a valid share code or null. Clears the clipboard on match.
 */
export const checkClipboardShareFallback = async (
  options: CheckClipboardShareFallbackOptions = {},
): Promise<string | null> => {
  // iOS-only — Android has the Play Install Referrer Library instead.
  if (Platform.OS !== 'ios') return null;
  if (options.skip) return null;

  const clipboard = loadClipboard();
  if (!clipboard) return null;

  let raw: string;
  try {
    raw = await clipboard.getStringAsync();
  } catch {
    return null;
  }

  const code = parseClipboardSharePayload(raw);
  if (!code) return null;

  // Clear the clipboard so the payload can't re-fire on the next cold
  // start. Fire-and-forget — if the clear fails we still proceed with
  // the claim; the TTL will eventually invalidate it anyway.
  void clipboard.setStringAsync('').catch(() => {
    /* ignore */
  });

  return code;
};
