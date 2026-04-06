/**
 * Haptic Feedback Utilities
 *
 * Non-hook haptic helpers for use outside of React component trees
 * (e.g. store actions, navigation callbacks, gesture handlers).
 *
 * Uses the same lazy-require guard pattern as push-notifications.ts —
 * expo-haptics is loaded only when the native module is available,
 * preventing crashes in builds that lack the native binary.
 *
 * For React components, prefer the `useHaptics` design-system hook instead,
 * which additionally respects the OS "Reduce Motion" setting.
 */
import { NativeModules } from 'react-native';

// expo-haptics exposes "ExpoHaptics" as its native module name.
const hasHapticsNative = Boolean(NativeModules.ExpoHaptics);

let _haptics: typeof import('expo-haptics') | null | undefined;

function getHaptics(): typeof import('expo-haptics') | null {
  if (!hasHapticsNative) return null;
  if (_haptics !== undefined) return _haptics;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _haptics = require('expo-haptics') as typeof import('expo-haptics');
  } catch {
    _haptics = null;
  }
  return _haptics;
}

/** Light tap feedback — button press, toggle flip */
export function hapticLight(): void {
  const H = getHaptics();
  if (!H) return;
  H.impactAsync(H.ImpactFeedbackStyle.Light);
}

/** Medium tap feedback — route selection, sheet snap */
export function hapticMedium(): void {
  const H = getHaptics();
  if (!H) return;
  H.impactAsync(H.ImpactFeedbackStyle.Medium);
}

/** Success notification feedback — ride complete, badge unlock */
export function hapticSuccess(): void {
  const H = getHaptics();
  if (!H) return;
  H.notificationAsync(H.NotificationFeedbackType.Success);
}

/** Warning notification feedback — hazard proximity, low battery */
export function hapticWarning(): void {
  const H = getHaptics();
  if (!H) return;
  H.notificationAsync(H.NotificationFeedbackType.Warning);
}

/** Error notification feedback — off-route, failed action */
export function hapticError(): void {
  const H = getHaptics();
  if (!H) return;
  H.notificationAsync(H.NotificationFeedbackType.Error);
}
