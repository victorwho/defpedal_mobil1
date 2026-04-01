import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useAuthSession } from './AuthSessionProvider';
import {
  configureNotificationHandler,
  handleNotificationResponse,
  registerForPushNotifications,
} from '../lib/push-notifications';

/**
 * Headless provider that manages push notification lifecycle:
 * - Configures foreground notification display
 * - Registers push token when user is authenticated
 * - Handles notification taps for deep linking
 */
export const NotificationProvider = () => {
  const { user } = useAuthSession();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Configure handler once on mount
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Register token when authenticated
  useEffect(() => {
    if (!user) return;

    void registerForPushNotifications();
  }, [user]);

  // Listen for notification taps
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return null;
};
