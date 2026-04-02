import { useEffect } from 'react';
import { NativeModules } from 'react-native';

import { useAppStore } from '../store/appStore';

const hasNotificationModule = () => {
  try {
    return Boolean(
      NativeModules.ExpoPushTokenManager ||
      NativeModules.ExpoNotificationPresenter,
    );
  } catch {
    return false;
  }
};

/**
 * Schedules a daily 9am weather notification on every app open.
 * Checks for native module availability before attempting anything.
 */
export const DailyWeatherScheduler = () => {
  const notifyWeather = useAppStore((state) => state.notifyWeather);

  useEffect(() => {
    if (!notifyWeather) return;
    if (!hasNotificationModule()) return;

    const timer = setTimeout(async () => {
      try {
        const Location = require('expo-location') as typeof import('expo-location');
        const { scheduleDailyWeatherNotification } = require('../lib/daily-weather-notification') as {
          scheduleDailyWeatherNotification: (lat: number, lon: number) => Promise<void>;
        };

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
