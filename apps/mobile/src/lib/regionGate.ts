import { normalizeCountryCode } from '@defensivepedal/core';
import * as Location from 'expo-location';

import { getDevMockLocation } from './devMockLocation';

/**
 * Best-effort country detection for the onboarding region gate.
 *
 * GPS fix → platform reverse-geocoder → ISO 3166-1 alpha-2. Every failure
 * mode (permission denied, no fix, geocoder unavailable/offline, timeout)
 * resolves to `null`, which sends the user to the manual country picker —
 * never a crash, never a hang.
 *
 * A last-known fix is preferred over a fresh one: it answers "which country
 * does this rider live in?" fast, and even a stale fix from before a flight
 * is usually the *more* correct answer for an availability gate.
 */

const FRESH_FIX_TIMEOUT_MS = 8_000;
// Hard ceiling on the whole detection — the platform geocoder has no
// timeout of its own and a hang here would strand the rider on the
// "Checking availability…" spinner with no way forward.
const OVERALL_TIMEOUT_MS = 12_000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

// Country resolution needs no precision — 0.1° (~11 km) rounding lets GPS
// jitter and repeated callers (region gate, search-hint resolution in
// useResolvedCountry) share one device-geocoder hit per area.
const countryCodeCache = new Map<string, string | null>();

const countryCacheKey = (lat: number, lon: number): string =>
  `${lat.toFixed(1)},${lon.toFixed(1)}`;

/** Test hook — the module-level cache would otherwise leak between tests. */
export const clearCountryCodeCacheForTests = (): void => {
  countryCodeCache.clear();
};

/**
 * Coordinate → ISO 3166-1 alpha-2 via the platform reverse-geocoder,
 * normalized (uppercase, UK→GB) and cached by coarse coordinates.
 * Failures resolve to `null` and are deliberately NOT cached, so a later
 * attempt (e.g. back online) can still succeed.
 */
export const reverseGeocodeCountryCode = async (
  lat: number,
  lon: number,
): Promise<string | null> => {
  const key = countryCacheKey(lat, lon);
  const cached = countryCodeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const code = normalizeCountryCode(results[0]?.isoCountryCode ?? null);
    countryCodeCache.set(key, code);
    return code;
  } catch {
    return null;
  }
};

export const detectCountryCode = (): Promise<string | null> =>
  withTimeout(detectCountryCodeUnbounded(), OVERALL_TIMEOUT_MS);

const detectCountryCodeUnbounded = async (): Promise<string | null> => {
  try {
    // Dev/preview-only fake GPS (Diagnostics > Fake GPS location; null on
    // production builds). Bypasses the permission gate and position fix but
    // still runs the real reverse-geocoder on the mocked coordinates, so the
    // rest of the pipeline behaves exactly as if the rider were there.
    const mock = getDevMockLocation();
    if (mock) {
      return await reverseGeocodeCountryCode(mock.lat, mock.lon);
    }

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return null;
    }

    const position =
      (await Location.getLastKnownPositionAsync()) ??
      (await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        FRESH_FIX_TIMEOUT_MS,
      ));

    if (!position) {
      return null;
    }

    return await reverseGeocodeCountryCode(
      position.coords.latitude,
      position.coords.longitude,
    );
  } catch {
    return null;
  }
};
