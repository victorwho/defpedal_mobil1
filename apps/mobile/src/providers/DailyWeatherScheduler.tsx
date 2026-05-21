import { useEffect } from 'react';

import { useAppStore } from '../store/appStore';
import { hasNotificationsNativeModule } from '../lib/notificationNativeModule';

/**
 * Schedules a daily 8:30am weather notification on every app open.
 * Checks for native module availability before attempting anything.
 */
export const DailyWeatherScheduler = () => {
  const notifyWeather = useAppStore((state) => state.notifyWeather);

  useEffect(() => {
    if (!notifyWeather) return;
    if (!hasNotificationsNativeModule()) return;

    const timer = setTimeout(async () => {
      try {
        const Location = require('expo-location') as typeof import('expo-location');
        const { scheduleDailyWeatherNotification } = require('../lib/daily-weather-notification') as {
          scheduleDailyWeatherNotification: (lat: number, lon: number) => Promise<void>;
        };
        const { ensureNotificationPermissionAsync } = require('../lib/push-notifications') as {
          ensureNotificationPermissionAsync: () => Promise<boolean>;
        };

        // Prompt for notification permission first (decoupled from location).
        // The weather ping is on by default, so this is the entry point that
        // actually surfaces the OS permission dialog for users who never sign in.
        const notificationsGranted = await ensureNotificationPermissionAsync();
        if (!notificationsGranted) return;

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getLastKnownPositionAsync();
        if (!location) return;

        await scheduleDailyWeatherNotification(
          location.coords.latitude,
          location.coords.longitude,
        );
      } catch {
        // Silently fail
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [notifyWeather]);

  return null;
};
