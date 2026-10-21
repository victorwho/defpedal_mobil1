// The cycling-weather ping sends nothing on a day that has a commute briefing:
// both would describe that morning's weather.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '../store/appStore';
import { DEFAULT_COMMUTE_SLICE_STATE } from '../store/commuteSlice';
import {
  __setDailyWeatherTestOverrides,
  scheduleDailyWeatherNotifications,
} from './daily-weather-notification';

const HOME = { id: 'h', label: 'Home', primaryText: 'Home', coordinates: { lat: 44.43, lon: 26.1 } };
const WORK = { id: 'w', label: 'Work', primaryText: 'Work', coordinates: { lat: 44.45, lon: 26.08 } };

const DAYS = 8;
const dailyPayload = {
  daily: {
    time: Array.from({ length: DAYS }, (_, i) => `d${i}`),
    temperature_2m_min: Array(DAYS).fill(12),
    temperature_2m_max: Array(DAYS).fill(20),
    precipitation_probability_max: Array(DAYS).fill(5),
    wind_speed_10m_max: Array(DAYS).fill(8),
    weather_code: Array(DAYS).fill(1),
  },
};

const runPass = async (): Promise<number> => {
  let count = 0;
  const N = {
    AndroidImportance: { DEFAULT: 3 },
    getPermissionsAsync: async () => ({ status: 'granted' }),
    setNotificationChannelAsync: async () => null,
    scheduleNotificationAsync: async () => {
      count += 1;
      return 'id';
    },
    getAllScheduledNotificationsAsync: async () => [],
    cancelScheduledNotificationAsync: async () => undefined,
  };
  __setDailyWeatherTestOverrides({ notifications: N as never, store: useAppStore });
  await scheduleDailyWeatherNotifications(44.43, 26.1);
  return count;
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => dailyPayload })));
  useAppStore.setState({
    ...DEFAULT_COMMUTE_SLICE_STATE,
    savedPlaces: { home: HOME, work: WORK },
    dailyWeatherChain: [],
    firstRideReminderAt: null,
  });
});

afterEach(() => {
  __setDailyWeatherTestOverrides({});
  vi.unstubAllGlobals();
});

describe('weather ping vs commute briefings', () => {
  it('sends weather pings when Commute is off', async () => {
    expect(await runPass()).toBeGreaterThan(0);
  });

  it('sends none when every day has a commute briefing', async () => {
    useAppStore.getState().setCommuteDays([1, 2, 3, 4, 5, 6, 7]);
    // 23:59 departure: today's briefing has not passed, so today counts too.
    useAppStore.getState().enableCommute('23:59');
    expect(await runPass()).toBe(0);
  });

  it('still sends them when Home or Work is missing', async () => {
    useAppStore.getState().setCommuteDays([1, 2, 3, 4, 5, 6, 7]);
    useAppStore.getState().enableCommute('23:59');
    useAppStore.setState({ savedPlaces: { home: HOME, work: null } });
    expect(await runPass()).toBeGreaterThan(0);
  });
});
