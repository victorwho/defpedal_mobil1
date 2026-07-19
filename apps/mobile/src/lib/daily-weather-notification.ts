import { Platform } from 'react-native';

import {
  buildCyclingAdvice,
  isGoodCyclingWeather,
  parseForecastResponse,
  type GoodWeatherForecast,
} from './daily-weather-messages';
import {
  CHAIN_HORIZON_DAYS,
  MAX_SCHEDULED_FIRES,
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

type NotificationsModule = typeof import('expo-notifications');
type AppStoreHook = typeof import('../store/appStore').useAppStore;

// Test seam: the lazy `require()` calls below bypass vitest's module-mock
// registry (same constraint that gave activation-ladder.ts its injected
// notifier), so behavioral tests inject fakes here instead.
let testOverrides: {
  notifications?: NotificationsModule;
  store?: AppStoreHook;
} = {};

export const __setDailyWeatherTestOverrides = (
  overrides: typeof testOverrides,
): void => {
  testOverrides = overrides;
};

const getNotifications = () => {
  if (testOverrides.notifications) return testOverrides.notifications;
  if (!hasNotificationsNativeModule()) return null;
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
};

const getAppStore = () => {
  if (testOverrides.store) return testOverrides.store;
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

/**
 * Cancel every weather notification EXCEPT the given generation (pass null
 * to cancel everything, e.g. from the Profile toggle-off). Covers all older
 * generations plus the pre-2026-07-18 legacy single id via the shared prefix.
 * `staleGeneration` is the last generation recorded BEFORE this pass — used
 * to reconstruct cancellable ids when the OS refuses to enumerate.
 */
const cancelWeatherNotificationsExcept = async (
  N: typeof import('expo-notifications'),
  keepGeneration: string | null,
  staleGeneration: string | null,
): Promise<void> => {
  const keepPrefix = keepGeneration
    ? `${NOTIFICATION_ID_PREFIX}-${keepGeneration}-`
    : null;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(
          (s) =>
            s.identifier.startsWith(NOTIFICATION_ID_PREFIX) &&
            (!keepPrefix || !s.identifier.startsWith(keepPrefix)),
        )
        .map((s) => N.cancelScheduledNotificationAsync(s.identifier).catch(() => {})),
    );
  } catch {
    // Enumeration failed — cancel by CONSTRUCTED ids instead: the legacy
    // fixed id plus every index of the stale generation (cancel by id needs
    // no list). Anything still left gets swept by the next successful pass;
    // duplicates beat silence.
    const ids = [NOTIFICATION_ID_PREFIX];
    if (staleGeneration && staleGeneration !== keepGeneration) {
      for (let i = 0; i < MAX_SCHEDULED_FIRES; i += 1) {
        ids.push(`${NOTIFICATION_ID_PREFIX}-${staleGeneration}-${i}`);
      }
    }
    await Promise.all(
      ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
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
  const previousGeneration = store.getState().dailyWeatherGeneration;
  const persistedChain = store
    .getState()
    .dailyWeatherChain.map((iso) => new Date(iso))
    .filter((d) => Number.isFinite(d.getTime()));
  const { chain, fires } = buildWeatherSchedule(persistedChain, now);

  // Persist the cadence truth BEFORE touching OS state — the scheduled set
  // is derived from the chain, so after a crash mid-pass the next pass
  // rebuilds the same fires instead of re-rolling (review 2026-07-19, M2).
  store.getState().setDailyWeatherChain(chain.map((d) => d.toISOString()));

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('daily-weather', {
      name: 'Cycling Weather',
      importance: N.AndroidImportance.DEFAULT,
      description: 'Cycling weather forecast and ride reminders',
    });
  }

  // Generation-tagged ids, scheduled BEFORE the old generation is cancelled:
  // a crash between the two steps worst-cases as duplicate pings the next
  // pass sweeps — never as an empty queue, which would silently defeat the
  // day-3 inactivity escalation (review 2026-07-19, M2).
  const generation = `g${now.getTime().toString(36)}`;

  await Promise.all(
    fires.map((fireAt, index) => {
      const forecast = rows[Math.min(forecastDayIndex(fireAt, now), rows.length - 1)];
      if (!forecast) return Promise.resolve();
      const { title, body } = buildCyclingAdvice(forecast);
      const tone: 'good' | 'caution' = isGoodCyclingWeather(forecast) ? 'good' : 'caution';
      const seconds = Math.max(60, Math.floor((fireAt.getTime() - now.getTime()) / 1000));
      const input = {
        identifier: `${NOTIFICATION_ID_PREFIX}-${generation}-${index}`,
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
      };
      // One retry per fire: a transient scheduling failure would otherwise
      // silently drop that ping forever (review 2026-07-19, LOW).
      return N.scheduleNotificationAsync(input)
        .catch(() => N.scheduleNotificationAsync(input))
        .catch(() => {});
    }),
  );

  store.getState().setDailyWeatherGeneration(generation);
  await cancelWeatherNotificationsExcept(N, generation, previousGeneration);
};

/**
 * Cancel every pending cycling-weather notification (Profile toggle off).
 * Also clears the persisted cadence chain so re-enabling starts fresh.
 */
export const cancelDailyWeatherNotifications = async (): Promise<void> => {
  const N = getNotifications();
  if (!N) return;
  let staleGeneration: string | null = null;
  try {
    staleGeneration = getAppStore().getState().dailyWeatherGeneration;
  } catch {
    // Store unavailable (e.g. node tests) — enumeration is the only path.
  }
  await cancelWeatherNotificationsExcept(N, null, staleGeneration);
  try {
    getAppStore().getState().setDailyWeatherChain([]);
    getAppStore().getState().setDailyWeatherGeneration(null);
  } catch {
    // Store unavailable (e.g. node tests) — cancelling the OS side is enough.
  }
};
