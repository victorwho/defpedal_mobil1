import { useEffect } from 'react';
import { AppState } from 'react-native';

import { hasNotificationsNativeModule } from '../lib/notificationNativeModule';
import { useAppStore } from '../store/appStore';

/**
 * Runs a commute briefing pass (docs/plans/commute-mode.md) on app open, on
 * every foreground, and whenever the commute settings or Home/Work change.
 *
 * Never prompts for notification permission: that ask belongs to the moment
 * the rider turns Commute on. Without permission a pass is a silent no-op.
 */

// Foreground passes hit Open-Meteo, so rapid fg/bg cycling is rate-limited.
// A settings change always runs: the rider just asked for it.
const MIN_PASS_INTERVAL_MS = 15 * 60 * 1000;
let lastPassAt = 0;

const runPass = async (force: boolean): Promise<void> => {
  if (!force && Date.now() - lastPassAt < MIN_PASS_INTERVAL_MS) return;
  lastPassAt = Date.now();
  try {
    const { scheduleCommuteBriefings } = require('../lib/commute-notification') as typeof import('../lib/commute-notification');
    await scheduleCommuteBriefings();
  } catch {
    // A failed pass leaves the previous set; the next open retries.
  }
};

export const CommuteScheduler = () => {
  const commute = useAppStore((state) => state.commute);
  const home = useAppStore((state) => state.savedPlaces.home);
  const work = useAppStore((state) => state.savedPlaces.work);
  const onboardingCompleted = useAppStore((state) => state.onboardingCompleted);
  // The briefing's ride time depends on these two (resolveEtaPace).
  const paceEtaEnabled = useAppStore((state) => state.paceEtaEnabled);
  const isEbike = useAppStore((state) => state.isEbike);

  // Route estimates are written BY the pass; only settings changes re-run it.
  const { enabled, days, departTime, returnTime } = commute;

  useEffect(() => {
    if (!onboardingCompleted || !hasNotificationsNativeModule()) return;
    const timer = setTimeout(() => void runPass(true), 3000);
    return () => clearTimeout(timer);
  }, [onboardingCompleted, enabled, days, departTime, returnTime, home, work, paceEtaEnabled, isEbike]);

  useEffect(() => {
    if (!onboardingCompleted || !hasNotificationsNativeModule()) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runPass(false);
    });
    return () => subscription.remove();
  }, [onboardingCompleted]);

  return null;
};
