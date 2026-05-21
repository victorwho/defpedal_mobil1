import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { mobileApi } from './api';
import { hasNotificationsNativeModule } from './notificationNativeModule';

let _notifications: typeof import('expo-notifications') | null | undefined;
const getNotifications = () => {
  if (!hasNotificationsNativeModule()) return null;
  if (_notifications !== undefined) return _notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _notifications = require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    _notifications = null;
  }
  return _notifications;
};

/**
 * Configure foreground notification behavior.
 * Must be called once at app startup.
 */
export const configureNotificationHandler = () => {
  const N = getNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

/**
 * Ensure the OS notification permission is granted, prompting the user once
 * if it hasn't been decided yet. Safe to call on every app open — it never
 * re-prompts after the user has permanently denied (canAskAgain === false),
 * so it won't spam the system dialog.
 *
 * Returns true only when permission is currently granted.
 */
export const ensureNotificationPermissionAsync = async (): Promise<boolean> => {
  const N = getNotifications();
  if (!N) return false;

  const { status: existingStatus, canAskAgain } = await N.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  if (!canAskAgain) return false;

  const { status } = await N.requestPermissionsAsync();
  return status === 'granted';
};

/**
 * Register for push notifications, request permission, get Expo push token,
 * and send it to the server.
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
  const N = getNotifications();
  if (!N) return null;

  // Check/request permission (prompts once if undecided)
  const granted = await ensureNotificationPermissionAsync();
  if (!granted) {
    return null;
  }

  // Android: set notification channel
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'Defensive Pedal',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FACC15',
    });
  }

  // Get Expo push token — requires EAS project ID
  let expoPushToken: string | null = null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await N.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    expoPushToken = tokenData.data;
  } catch {
    // Token registration fails without EAS project ID — permission still granted
    return null;
  }

  if (!expoPushToken) return null;

  // Register token with server
  try {
    const deviceId = Device.modelId ?? Device.deviceName ?? 'unknown-device';
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    await mobileApi.registerPushToken(expoPushToken, deviceId, platform);
  } catch {
    // Token registration failure is non-fatal
  }

  return expoPushToken;
};

/**
 * Unregister push token from server (call on sign-out).
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const deviceId = Device.modelId ?? Device.deviceName ?? 'unknown-device';
    await mobileApi.unregisterPushToken(deviceId);
  } catch {
    // Non-fatal
  }
};

/**
 * Handle notification tap — navigate to the relevant screen.
 */
export const handleNotificationResponse = (
  response: any,
): void => {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  if (!data?.type) return;

  switch (data.type) {
    case 'community':
      if (data.tripShareId) {
        router.push('/community-feed');
      }
      break;
    case 'hazard':
      router.push('/route-planning');
      break;
    case 'weather':
      router.push('/route-planning');
      break;
    default:
      break;
  }
};
