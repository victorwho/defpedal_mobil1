import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAppStore } from '../store/appStore';
import { hasNotificationsNativeModule } from '../lib/notificationNativeModule';

/**
 * Runs a cycling-weather scheduling pass (random 12h–120h cadence + day-3
 * inactivity escalation, see daily-weather-schedule.ts) on every app open AND
 * on every foreground. The foreground re-run matters: each pass re-anchors the
 * "hasn't used the app for 3 days" escalation clock at `now`, so a user who
 * merely foregrounds the app must count as active.
 * Checks for native module availability before attempting anything.
 */
export const DailyWeatherScheduler = () => {
  const notifyWeather = useAppStore((state) => state.notifyWeather);
  const onboardingCompleted = useAppStore((state) => state.onboardingCompleted);

  useEffect(() => {
    if (!notifyWeather) return;
    // Gate the OS notification-permission prompt on completed onboarding
    // (review 2026-06-12). Previously this fired ~3s into the very first
    // cold launch — surfacing the Android 13+ POST_NOTIFICATIONS dialog
    // contextless, stacked on top of the onboarding location-permission
    // ask, before the user knew what the app does. Contextless first-launch
    // permission asks have the highest denial rates. After onboarding the
    // user has seen the value prop, so this is a far better moment.
    if (!onboardingCompleted) return;
    if (!hasNotificationsNativeModule()) return;

    // Rate-limit passes: every pass hits Open-Meteo, and rapid fg/bg cycling
    // shouldn't hammer it. 15 min keeps the escalation anchor fresh enough.
    const MIN_PASS_INTERVAL_MS = 15 * 60 * 1000;
    let lastPassAt = 0;

    const runPass = async (promptForPermission: boolean) => {
      // Only foreground re-runs are rate-limited. The mount pass is exempt
      // so an early AppState flap (e.g. notification-tap launch briefly
      // blurring) can never consume the window and starve the ONE pass
      // allowed to show the OS permission prompt (review 2026-07-19, M3).
      if (!promptForPermission && Date.now() - lastPassAt < MIN_PASS_INTERVAL_MS) return;
      lastPassAt = Date.now();
      try {
        const Location = require('expo-location') as typeof import('expo-location');
        const { scheduleDailyWeatherNotifications } = require('../lib/daily-weather-notification') as {
          scheduleDailyWeatherNotifications: (lat: number, lon: number) => Promise<void>;
        };

        if (promptForPermission) {
          const { ensureNotificationPermissionAsync } = require('../lib/push-notifications') as {
            ensureNotificationPermissionAsync: () => Promise<boolean>;
          };
          // Prompt for notification permission first (decoupled from location).
          // The weather ping is on by default, so this is the entry point that
          // actually surfaces the OS permission dialog for users who never
          // sign in. Only the initial mount pass prompts — foreground re-runs
          // must never nag; the scheduler's own getPermissionsAsync() check
          // silently no-ops when permission is missing.
          const notificationsGranted = await ensureNotificationPermissionAsync();
          if (!notificationsGranted) return;
        }

        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getLastKnownPositionAsync();
        if (!location) return;

        await scheduleDailyWeatherNotifications(
          location.coords.latitude,
          location.coords.longitude,
        );
      } catch {
        // Silently fail
      }
    };

    const timer = setTimeout(() => {
      void runPass(true);
    }, 3000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runPass(false);
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [notifyWeather, onboardingCompleted]);

  return null;
};
