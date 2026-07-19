import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock expo-modules-core so the native-module probe deterministically reports
// "absent" under node (an unmocked import throws a __DEV__ reference error).
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => null,
}));

import {
  scheduleDailyWeatherNotifications,
  cancelDailyWeatherNotifications,
} from './daily-weather-notification';

describe('daily-weather-notification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('when native module is unavailable', () => {
    it('scheduleDailyWeatherNotifications returns early without fetching', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await scheduleDailyWeatherNotifications(44.43, 26.1);

      // Should not fetch weather since NativeModules is {} (from vitest.setup.ts)
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('cancelDailyWeatherNotifications returns early without error', async () => {
      await cancelDailyWeatherNotifications();
    });
  });

  describe('module exports', () => {
    it('exports scheduleDailyWeatherNotifications as a function', () => {
      expect(typeof scheduleDailyWeatherNotifications).toBe('function');
    });

    it('exports cancelDailyWeatherNotifications as a function', () => {
      expect(typeof cancelDailyWeatherNotifications).toBe('function');
    });
  });
});
