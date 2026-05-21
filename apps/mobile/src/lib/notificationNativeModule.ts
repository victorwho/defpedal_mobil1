import { NativeModules } from 'react-native';

/**
 * expo-notifications registers its native side through the Expo Modules API
 * (`globalThis.expo.modules.ExpoPushTokenManager`), NOT the classic React
 * Native bridge. Under the New Architecture (bridgeless) — which the preview
 * and production variants run — `NativeModules.ExpoPushTokenManager` is always
 * undefined even though the module is compiled in. The old guard therefore
 * silently disabled every notification path on release builds (no permission
 * prompt, no scheduled notifications) while still working on the dev variant
 * (old-arch bridge). Probe via `requireOptionalNativeModule` from
 * `expo-modules-core`, which reads the arch-independent Expo registry.
 * See error-log #21.
 */
const probeExpoModule = (name: string): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (moduleName: string) => unknown;
    };
    if (typeof core.requireOptionalNativeModule === 'function') {
      return core.requireOptionalNativeModule(name) != null;
    }
  } catch {
    // expo-modules-core unavailable (e.g. vitest under node) — fall through to
    // the legacy bridge probe, which degrades to false in non-native runtimes.
  }
  return false;
};

/**
 * True when the expo-notifications native module is present, across both the
 * old (bridge) and new (bridgeless) React Native architectures.
 */
export const hasNotificationsNativeModule = (): boolean =>
  probeExpoModule('ExpoPushTokenManager') ||
  probeExpoModule('ExpoNotificationPresenter') ||
  Boolean(
    NativeModules.ExpoPushTokenManager || NativeModules.ExpoNotificationPresenter,
  );
