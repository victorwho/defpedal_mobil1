import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

import { mobileApi } from './api';

/**
 * Configure foreground notification behavior.
 * Must be called once at app startup.
 */
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
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
 * Register for push notifications, request permission, get Expo push token,
 * and send it to the server.
 */
export const registerForPushNotifications = async (): Promise<string | null> => {
  // Only real devices can receive push notifications
  if (!Device.isDevice) {
    return null;
  }

  // Check/request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Android: set notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FACC15',
    });
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });
  const expoPushToken = tokenData.data;

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
  response: Notifications.NotificationResponse,
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
