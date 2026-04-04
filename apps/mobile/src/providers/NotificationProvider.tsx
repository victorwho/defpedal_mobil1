/**
 * Headless provider that manages push notification lifecycle:
 * - Configures foreground notification handler
 * - Listens for incoming notifications and tap responses
 * - Routes the user to the correct screen on tap
 *
 * Uses lazy require() for expo-notifications to avoid crash
 * when the native module is not compiled into the APK.
 */
import { useEffect, useRef } from 'react';

import {
  configureNotificationHandler,
  handleNotificationResponse,
} from '../lib/push-notifications';

let _notifications: typeof import('expo-notifications') | null | undefined;
const getNotifications = () => {
  if (_notifications !== undefined) return _notifications;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _notifications = require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    _notifications = null;
  }
  return _notifications;
};

export const NotificationProvider = () => {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const N = getNotifications();
    if (!N) return;

    // Configure how foreground notifications appear
    configureNotificationHandler();

    // Listen for notification taps (user interaction)
    const responseSubscription = N.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response);
      },
    );

    // Check if app was cold-started by tapping a notification
    void N.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => {
      responseSubscription.remove();
    };
  }, []);

  return null;
};
