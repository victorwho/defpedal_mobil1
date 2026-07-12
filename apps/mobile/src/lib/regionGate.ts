import { normalizeCountryCode } from '@defensivepedal/core';
import * as Location from 'expo-location';

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

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

export const detectCountryCode = async (): Promise<string | null> => {
  try {
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

    const results = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    return normalizeCountryCode(results[0]?.isoCountryCode ?? null);
  } catch {
    return null;
  }
};
