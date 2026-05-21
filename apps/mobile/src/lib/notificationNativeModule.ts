import { hasExpoNativeModule } from './expoNativeModule';

/**
 * True when the expo-notifications native module is present, across both the
 * old (bridge) and new (bridgeless) React Native architectures.
 *
 * NEVER guard notifications on `NativeModules.ExpoPushTokenManager` — it's
 * `undefined` on bridgeless preview/production builds and silently disables
 * every notification path (no permission prompt, no scheduled pings) while
 * still working on the dev variant. See error-log #21 + #2b.
 */
export const hasNotificationsNativeModule = (): boolean =>
  hasExpoNativeModule('ExpoPushTokenManager') ||
  hasExpoNativeModule('ExpoNotificationPresenter');
