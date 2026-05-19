import { NativeModules, Platform } from 'react-native';

import {
  TRIGGER_HOUR,
  TRIGGER_MINUTE,
  buildCyclingAdvice,
  computeTriggerSeconds,
  parseForecastResponse,
  pickForecastIndex,
  type GoodWeatherForecast,
} from './daily-weather-messages';

const NOTIFICATION_ID = 'daily-weather-cycling';

const hasNativeModule = Boolean(
  NativeModules.ExpoPushTokenManager || NativeModules.ExpoNotificationPresenter,
);

const getNotifications = () => {
  if (!hasNativeModule) return null;
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
};

const fetchTomorrowForecast = async (
  lat: number,
  lon: number,
): Promise<GoodWeatherForecast | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code&timezone=auto&forecast_days=2`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return parseForecastResponse(data, pickForecastIndex(new Date()));
  } catch {
    return null;
  }
};

/**
 * Schedule a daily 8:30am local notification with cycling weather advice.
 * Call on every app open — it cancels the previous one and reschedules.
 * Requires notification permission to be granted.
 */
export const scheduleDailyWeatherNotification = async (
  lat: number,
  lon: number,
): Promise<void> => {
  const N = getNotifications();
  if (!N) return;

  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return;

  // Fetch BEFORE any side effects. If Open-Meteo is down / rate-limited /
  // returns a truncated payload, we must leave the previously-scheduled
  // notification intact — cancelling here would otherwise wipe it and
  // leave the rider with no morning notification at all.
  const forecast = await fetchTomorrowForecast(lat, lon);
  if (!forecast) return;

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('daily-weather', {
      name: 'Daily Weather',
      importance: N.AndroidImportance.DEFAULT,
      description: 'Morning cycling weather forecast',
    });
  }

  await N.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  const { title, body } = buildCyclingAdvice(forecast);
  const secondsUntilTrigger = computeTriggerSeconds(new Date(), TRIGGER_HOUR, TRIGGER_MINUTE);

  await N.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title,
      body,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'daily-weather' } : {}),
    },
    trigger: {
      type: 'timeInterval' as never,
      seconds: secondsUntilTrigger,
      repeats: false,
    },
  });
};

/**
 * Cancel the daily weather notification.
 */
export const cancelDailyWeatherNotification = async (): Promise<void> => {
  const N = getNotifications();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});
};
