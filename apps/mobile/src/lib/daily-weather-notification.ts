import { NativeModules, Platform } from 'react-native';

const NOTIFICATION_ID = 'daily-weather-cycling';

const hasNativeModule = Boolean(
  NativeModules.ExpoPushTokenManager || NativeModules.ExpoNotificationPresenter,
);

type WeatherForecast = {
  tempMin: number;
  tempMax: number;
  precipitationProbability: number;
  windSpeedMax: number;
  weatherCode: number;
};

const getNotifications = () => {
  if (!hasNativeModule) return null;
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
};

const weatherCodeToCondition = (code: number): string => {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 82) return 'rainy';
  if (code <= 86) return 'snowy';
  if (code <= 99) return 'stormy';
  return 'unknown';
};

const buildCyclingAdvice = (forecast: WeatherForecast): { title: string; body: string } => {
  const condition = weatherCodeToCondition(forecast.weatherCode);
  const tempRange = `${Math.round(forecast.tempMin)}–${Math.round(forecast.tempMax)}°C`;
  const precipChance = forecast.precipitationProbability;
  const windMax = Math.round(forecast.windSpeedMax);

  // Dangerous conditions
  if (condition === 'stormy') {
    return {
      title: '⛈️ Storm alert — skip the bike today',
      body: `Thunderstorms expected. ${tempRange}, gusts up to ${windMax} km/h. Stay safe indoors.`,
    };
  }

  if (condition === 'snowy') {
    return {
      title: '❄️ Snow expected — roads may be slippery',
      body: `${tempRange} with snow. Consider public transit or drive carefully if you must go out.`,
    };
  }

  if (forecast.tempMin < -5) {
    return {
      title: '🥶 Extreme cold — bundle up or skip',
      body: `Temperature dropping to ${Math.round(forecast.tempMin)}°C. If cycling, wear layers and protect extremities.`,
    };
  }

  if (windMax > 40) {
    return {
      title: '💨 Very strong winds today',
      body: `Gusts up to ${windMax} km/h. ${tempRange}. Cycling will be difficult — consider alternatives.`,
    };
  }

  // Moderate conditions with advice
  if (precipChance > 70) {
    return {
      title: '🌧️ High chance of rain today',
      body: `${precipChance}% chance of rain, ${tempRange}. Pack rain gear and fenders if cycling.`,
    };
  }

  if (precipChance > 40) {
    return {
      title: '🌦️ Possible rain — be prepared',
      body: `${precipChance}% chance of rain, ${tempRange}. A light jacket and mudguards recommended.`,
    };
  }

  if (forecast.tempMin < 0) {
    return {
      title: '🧊 Freezing morning — watch for ice',
      body: `Low of ${Math.round(forecast.tempMin)}°C. Roads may be icy early. Ride carefully and dress warm.`,
    };
  }

  if (windMax > 25) {
    return {
      title: '🌬️ Windy day ahead',
      body: `${tempRange} with winds up to ${windMax} km/h. Give yourself extra time and energy for headwinds.`,
    };
  }

  // Good conditions
  if (condition === 'clear' && forecast.tempMax >= 15 && forecast.tempMax <= 30 && precipChance < 20 && windMax < 20) {
    return {
      title: '☀️ Perfect cycling weather!',
      body: `${tempRange}, sunny with light winds. A great day to bike instead of driving!`,
    };
  }

  if (condition === 'clear' || condition === 'cloudy') {
    return {
      title: '🚴 Good day to cycle!',
      body: `${tempRange}, ${condition === 'clear' ? 'clear skies' : 'partly cloudy'}. Skip the car — enjoy the ride!`,
    };
  }

  if (condition === 'foggy') {
    return {
      title: '🌫️ Foggy morning — ride visible',
      body: `${tempRange} with fog expected. Use lights and hi-vis gear if cycling.`,
    };
  }

  return {
    title: '🚴 Today\'s cycling forecast',
    body: `${tempRange}, ${precipChance}% rain, wind ${windMax} km/h. Ride prepared!`,
  };
};

const fetchTomorrowForecast = async (lat: number, lon: number): Promise<WeatherForecast | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code&timezone=auto&forecast_days=2`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data: any = await response.json();
    const daily = data.daily;
    if (!daily || !daily.time || daily.time.length < 2) return null;

    // Use index 1 for tomorrow, or 0 for today if before 9am
    const hour = new Date().getHours();
    const idx = hour < 9 ? 0 : 1;

    return {
      tempMin: daily.temperature_2m_min[idx],
      tempMax: daily.temperature_2m_max[idx],
      precipitationProbability: daily.precipitation_probability_max[idx],
      windSpeedMax: daily.wind_speed_10m_max[idx],
      weatherCode: daily.weather_code[idx],
    };
  } catch {
    return null;
  }
};

/**
 * Schedule a daily 9am local notification with cycling weather advice.
 * Call on every app open — it cancels the previous one and reschedules.
 * Requires notification permission to be granted.
 */
export const scheduleDailyWeatherNotification = async (lat: number, lon: number): Promise<void> => {
  const N = getNotifications();
  if (!N) return;

  // Check permission
  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return;

  // Ensure notification channel exists on Android
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('daily-weather', {
      name: 'Daily Weather',
      importance: N.AndroidImportance.DEFAULT,
      description: 'Morning cycling weather forecast',
    });
  }

  // Cancel previous scheduled notification
  await N.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  // Fetch forecast
  const forecast = await fetchTomorrowForecast(lat, lon);
  if (!forecast) return;

  const { title, body } = buildCyclingAdvice(forecast);

  // Calculate trigger time: 9am today if before 9am, otherwise 9am tomorrow
  const now = new Date();
  const triggerDate = new Date(now);
  triggerDate.setHours(9, 0, 0, 0);
  if (now.getHours() >= 9) {
    triggerDate.setDate(triggerDate.getDate() + 1);
  }

  const secondsUntilTrigger = Math.max(60, Math.floor((triggerDate.getTime() - now.getTime()) / 1000));

  await N.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title,
      body,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'daily-weather' } : {}),
    },
    trigger: {
      type: 'timeInterval' as any,
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
