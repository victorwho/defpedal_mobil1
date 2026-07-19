import { Platform } from 'react-native';

import {
  buildCyclingAdvice,
  isGoodCyclingWeather,
  parseForecastResponse,
  type GoodWeatherForecast,
} from './daily-weather-messages';
import {
  CHAIN_HORIZON_DAYS,
  buildWeatherSchedule,
  forecastDayIndex,
} from './daily-weather-schedule';
import { hasNotificationsNativeModule } from './notificationNativeModule';

// Legacy builds scheduled a single one-shot under exactly this id; the new
// multi-fire ids share the prefix, so a prefix cancel also cleans up after an
// app upgrade.
const NOTIFICATION_ID_PREFIX = 'daily-weather-cycling';

// One extra row beyond the horizon: a late-evening open can snap a day-6 fire
// into calendar day 7.
const FORECAST_DAYS = CHAIN_HORIZON_DAYS + 1;

const getNotifications = () => {
  if (!hasNotificationsNativeModule()) return null;
  try {
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    return null;
  }
};

const getAppStore = () => {
  // Lazy so node tests of the early-return paths never touch zustand persist.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAppStore } = require('../store/appStore') as typeof import('../store/appStore');
  return useAppStore;
};

const fetchForecastRows = async (
  lat: number,
  lon: number,
): Promise<Array<GoodWeatherForecast | null> | null> => {
  // Audit 2026-07-05 PERF-5: bound the request like every other fetch site —
  // a hung Open-Meteo call would otherwise leave this promise pending on the
  // notification-scheduling path. 10s mirrors weather.ts.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code&timezone=auto&forecast_days=${FORECAST_DAYS}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const rows = Array.from({ length: FORECAST_DAYS }, (_, idx) =>
      parseForecastResponse(data, idx),
    );
    // A payload with no usable row at all is a failed fetch, not a partial one.
    return rows.some((r) => r !== null) ? rows : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const cancelAllWeatherNotifications = async (
  N: typeof import('expo-notifications'),
): Promise<void> => {
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((s) => s.identifier.startsWith(NOTIFICATION_ID_PREFIX))
        .map((s) => N.cancelScheduledNotificationAsync(s.identifier).catch(() => {})),
    );
  } catch {
    // Fall back to the legacy single id — better than leaving it queued.
    await N.cancelScheduledNotificationAsync(NOTIFICATION_ID_PREFIX).catch(() => {});
  }
};

/**
 * Schedule the upcoming cycling-weather notifications.
 *
 * Cadence (see daily-weather-schedule.ts): random intervals of 12h–120h
 * (2x/day … once per 5 days) persisted across app opens, plus daily
 * escalation fires starting 3 days after this open — those only ever reach
 * users who genuinely stop opening the app, because every open cancels and
 * recomputes the whole set.
 *
 * Call on every app open / foreground. Fetches the forecast BEFORE any side
 * effects: if Open-Meteo is down / rate-limited / truncated, the previously
 * scheduled notifications stay intact.
 */
export const scheduleDailyWeatherNotifications = async (
  lat: number,
  lon: number,
): Promise<void> => {
  const N = getNotifications();
  if (!N) return;

  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return;

  const rows = await fetchForecastRows(lat, lon);
  if (!rows) return;

  const now = new Date();
  const store = getAppStore();
  const persistedChain = store
    .getState()
    .dailyWeatherChain.map((iso) => new Date(iso))
    .filter((d) => Number.isFinite(d.getTime()));
  const { chain, fires } = buildWeatherSchedule(persistedChain, now);

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('daily-weather', {
      name: 'Cycling Weather',
      importance: N.AndroidImportance.DEFAULT,
      description: 'Cycling weather forecast and ride reminders',
    });
  }

  await cancelAllWeatherNotifications(N);

  await Promise.all(
    fires.map((fireAt, index) => {
      const forecast = rows[Math.min(forecastDayIndex(fireAt, now), rows.length - 1)];
      if (!forecast) return Promise.resolve();
      const { title, body } = buildCyclingAdvice(forecast);
      const tone: 'good' | 'caution' = isGoodCyclingWeather(forecast) ? 'good' : 'caution';
      const seconds = Math.max(60, Math.floor((fireAt.getTime() - now.getTime()) / 1000));
      return N.scheduleNotificationAsync({
        identifier: `${NOTIFICATION_ID_PREFIX}-${index}`,
        content: {
          title,
          body,
          sound: 'default',
          // Carry the content in the payload so a tap can re-show it in-app.
          data: { type: 'daily-weather', title, body, tone },
          ...(Platform.OS === 'android' ? { channelId: 'daily-weather' } : {}),
        },
        trigger: {
          type: 'timeInterval' as never,
          seconds,
          repeats: false,
        },
      }).catch(() => {});
    }),
  );

  store.getState().setDailyWeatherChain(chain.map((d) => d.toISOString()));
};

/**
 * Cancel every pending cycling-weather notification (Profile toggle off).
 * Also clears the persisted cadence chain so re-enabling starts fresh.
 */
export const cancelDailyWeatherNotifications = async (): Promise<void> => {
  const N = getNotifications();
  if (!N) return;
  await cancelAllWeatherNotifications(N);
  try {
    getAppStore().getState().setDailyWeatherChain([]);
  } catch {
    // Store unavailable (e.g. node tests) — cancelling the OS side is enough.
  }
};
