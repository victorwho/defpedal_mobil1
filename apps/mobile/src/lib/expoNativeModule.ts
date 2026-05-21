import { NativeModules } from 'react-native';

/**
 * Detects whether an Expo native module is present, across BOTH the old
 * (bridge) and new (bridgeless) React Native architectures.
 *
 * Expo SDK modules register through the Expo Modules API
 * (`globalThis.expo.modules.<Name>`), NOT the legacy `NativeModules` bridge.
 * Under the New Architecture (bridgeless) — which the preview/production
 * variants run — `NativeModules.<Name>` is always `undefined` even when the
 * module is compiled in. A `NativeModules`-based guard therefore passes on the
 * dev variant (old-arch bridge) and silently disables the feature on every
 * release build. Probe via `requireOptionalNativeModule` from
 * `expo-modules-core` (arch-independent). See error-log #21.
 *
 * @param name The *registered* Expo module name, which often differs from the
 *   npm package name — e.g. `ExpoPushTokenManager`, `ExpoHaptics`,
 *   `ExponentImagePicker`. Check the module's Android/iOS `Name("…")`
 *   declaration, not the package name.
 */
export const hasExpoNativeModule = (name: string): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (moduleName: string) => unknown;
    };
    if (typeof core.requireOptionalNativeModule === 'function') {
      return core.requireOptionalNativeModule(name) != null;
    }
  } catch {
    // expo-modules-core unavailable (e.g. vitest under node, where an unmocked
    // import throws a __DEV__ reference error) — fall through to the legacy
    // bridge probe, which degrades to false in non-native runtimes.
  }
  return Boolean(NativeModules[name]);
};
