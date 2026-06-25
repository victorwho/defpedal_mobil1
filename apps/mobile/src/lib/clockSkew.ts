import { mobileEnv } from './env';

/**
 * Device-clock skew detection.
 *
 * The native Google sign-in flow on iOS validates the Google ID token's `iat`
 * claim against the DEVICE clock (AppAuth/OpenID, ±600s tolerance). A device
 * whose date/time is off by >10 min fails Google sign-in outright with an
 * `org.openid.appauth Code=-15` error — the App Store 2.1(a) rejection on
 * 2026-06-25 was exactly this on a mis-clocked review device.
 *
 * `getServerClockSkewSeconds` compares the device clock to a trusted server
 * clock (the HTTP `Date` response header from the mobile API) so the auth
 * screen can warn the user BEFORE they hit the opaque native failure. It is a
 * best-effort, non-blocking probe: any failure (offline, no header, bad parse)
 * resolves to `null` and the caller simply skips the warning.
 */

/** Skew (in seconds) at/above which Google sign-in is at real risk. */
export const CLOCK_SKEW_WARN_THRESHOLD_SECONDS = 300;

/**
 * Parse an HTTP `Date` header and return the signed device-vs-server skew in
 * seconds: positive = device clock is AHEAD of the server, negative = behind.
 * Returns `null` when the header is missing or unparseable.
 *
 * Pure + exported for unit testing.
 */
export const computeSkewSeconds = (
  dateHeader: string | null | undefined,
  deviceNowMs: number,
): number | null => {
  if (!dateHeader) return null;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return null;
  return Math.round((deviceNowMs - serverMs) / 1000);
};

/**
 * Probe the mobile API for the trusted server time and return the device clock
 * skew in seconds (signed), or `null` if it can't be determined. Never throws.
 */
export const getServerClockSkewSeconds = async (
  nowMs: number = Date.now(),
): Promise<number | null> => {
  const base = mobileEnv.mobileApiUrl;
  if (!base) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}/health`, {
        method: 'GET',
        // Cache must not satisfy this from a stale entry — we need live headers.
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    return computeSkewSeconds(res.headers.get('date'), nowMs);
  } catch {
    return null;
  }
};
