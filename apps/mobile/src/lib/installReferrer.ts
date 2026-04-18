/**
 * Android Play Store install-referrer reader.
 *
 * When a user taps a `routes.defensivepedal.com/r/<code>` link on a device
 * without the app installed, Android's Play Store flow attaches the
 * original URL's `?share=<code>` query param as the install-referrer for
 * the first launch. This module reads that referrer and extracts the code
 * so the Habit Engine onboarding can auto-claim the share after account
 * creation (slice 2 of the route-share PRD).
 *
 * Safety rails per error-log #23:
 *   - `react-native-play-install-referrer`'s top-level code invokes
 *     `new NativeEventEmitter(NativeModules.PlayInstallReferrer)` which
 *     throws an invariant if the native module isn't in the APK. That
 *     throw ESCAPES a try/catch around `require()` on some RN runtimes,
 *     so we check `NativeModules.PlayInstallReferrer` BEFORE requiring.
 *   - Dev + preview builds don't come from the Play Store, so the
 *     referrer API returns an empty string anyway. We skip the read on
 *     those flavors to avoid surfacing spurious warnings in logs.
 *
 * Until the APK is rebuilt with the new native module linked, the
 * NativeModules guard below returns null silently — no crash, no fallback
 * claim. Same inert-fallback pattern as the NetInfo offline code.
 */
import { NativeModules, Platform } from 'react-native';

import { isValidShareCode } from '@defensivepedal/core';
import { mobileEnv } from './env';

// ---------------------------------------------------------------------------
// Types (mirror the community module's callback payload)
// ---------------------------------------------------------------------------

type PlayInstallReferrerInfo = {
  installReferrer?: string;
  referrerClickTimestampSeconds?: number;
  installBeginTimestampSeconds?: number;
  googlePlayInstantParam?: boolean;
};

type PlayInstallReferrerModule = {
  getInstallReferrerInfo: (
    callback: (
      value: PlayInstallReferrerInfo | null,
      error: string | null,
    ) => void,
  ) => void;
};

// ---------------------------------------------------------------------------
// Lazy module loader with native-module guard (error-log #23)
// ---------------------------------------------------------------------------

const loadModule = async (): Promise<PlayInstallReferrerModule | null> => {
  // Only Android ships the Play Install Referrer Library.
  if (Platform.OS !== 'android') return null;

  // Guard BEFORE loading — the community bridge's top-level
  // `new NativeEventEmitter(NativeModules.PlayInstallReferrer)` will
  // throw if the native module isn't linked, and that throw escapes
  // try/catch around the module load on some runtimes.
  if (!NativeModules.PlayInstallReferrer) return null;

  try {
    // Dynamic import works in both the app runtime (Metro lazily loads)
    // and the test runtime (vitest's hoisted vi.mock intercepts via the
    // ESM resolver, which `require()` does not go through).
    const mod = (await import('react-native-play-install-referrer')) as {
      PlayInstallReferrer: PlayInstallReferrerModule;
    };
    return mod?.PlayInstallReferrer ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Referrer string parser
// ---------------------------------------------------------------------------

/**
 * Extract `share=<code>` from the referrer URL and validate it via core's
 * `isValidShareCode`. The referrer is a URL-encoded query string such as
 * `utm_source=share&share=abcd1234&utm_medium=sms`.
 */
export const parseShareCodeFromReferrer = (
  referrer: string | null | undefined,
): string | null => {
  if (!referrer) return null;

  // URLSearchParams wants just the query portion — the referrer string
  // from the Play Install Referrer Library is already in that form.
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(referrer);
  } catch {
    return null;
  }

  const candidate = params.get('share');
  if (!candidate) return null;

  return isValidShareCode(candidate) ? candidate : null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the Play Store install-referrer and extract a valid share code if
 * present. Returns null when:
 *   - The platform isn't Android
 *   - The native module isn't linked (pre-APK-rebuild state)
 *   - The flavor is dev/preview (not a real Play Store install)
 *   - The referrer is empty, malformed, or missing a valid `share` param
 *
 * Safe to call on every cold start — consumers are responsible for
 * gating on their own "already checked" flag.
 */
export const readInstallReferrer = async (): Promise<string | null> => {
  // Skip on non-Play-Store builds. The Play Install Referrer Library
  // only populates `installReferrer` for installs that came through the
  // Play Store, which dev + preview builds never do.
  if (mobileEnv.appVariant !== 'production') return null;

  const mod = await loadModule();
  if (!mod) return null;

  return new Promise<string | null>((resolve) => {
    try {
      mod.getInstallReferrerInfo((value, error) => {
        if (error || !value) {
          resolve(null);
          return;
        }
        resolve(parseShareCodeFromReferrer(value.installReferrer));
      });
    } catch {
      // Defensive — even with the guard above, the module's first call
      // could still throw on an edge-case runtime.
      resolve(null);
    }
  });
};
