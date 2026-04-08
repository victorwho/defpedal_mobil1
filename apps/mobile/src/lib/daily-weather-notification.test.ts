import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  scheduleDailyWeatherNotification,
  cancelDailyWeatherNotification,
} from './daily-weather-notification';

describe('daily-weather-notification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('when native module is unavailable', () => {
    it('scheduleDailyWeatherNotification returns early without fetching', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await scheduleDailyWeatherNotification(44.43, 26.1);

      // Should not fetch weather since NativeModules is {} (from vitest.setup.ts)
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('cancelDailyWeatherNotification returns early without error', async () => {
      await cancelDailyWeatherNotification();
    });
  });

  describe('module exports', () => {
    it('exports scheduleDailyWeatherNotification as a function', () => {
      expect(typeof scheduleDailyWeatherNotification).toBe('function');
    });

    it('exports cancelDailyWeatherNotification as a function', () => {
      expect(typeof cancelDailyWeatherNotification).toBe('function');
    });
  });
});
