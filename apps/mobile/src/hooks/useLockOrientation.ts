import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Lock the active screen to portrait while it's the focused screen, then
 * restore the OS auto-rotate setting when it loses focus.
 *
 * Called from /route-planning, /route-preview, /navigation — these screens
 * are designed for handlebar-mount cycling and have no landscape variant.
 * The rest of the app (history, community, profile, settings, trophy case,
 * onboarding) follows the device's auto-rotate setting.
 *
 * Why useFocusEffect, not useEffect:
 *   expo-screen-orientation's lockAsync is a process-level lock — it applies
 *   to the entire activity, not just the calling screen. Expo Router's stack
 *   keeps screens mounted underneath the active one (router.push pushes,
 *   doesn't replace), so a useEffect cleanup wouldn't fire until back-navigation.
 *   With useEffect, mounting /route-planning would lock the whole app, then
 *   pushing /profile on top wouldn't unlock — /profile would be stuck portrait
 *   too. useFocusEffect ties the lock to focus so navigation away (push or
 *   replace) immediately unlocks for the next screen.
 *
 * Native-module loading: expo-screen-orientation is an Expo module and
 * registers through expo-modules-core, NOT the legacy RN bridge NativeModules
 * registry (see error-prevention #21). We rely on the autolinker linking it
 * at build time and catch the require() to no-op gracefully if a future
 * build ships without it.
 */
export const useLockOrientation = (): void => {
  useFocusEffect(
    useCallback(() => {
      let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
      try {
        ScreenOrientation = require('expo-screen-orientation') as typeof import('expo-screen-orientation');
      } catch {
        return;
      }

      const So = ScreenOrientation;
      void So.lockAsync(So.OrientationLock.PORTRAIT_UP).catch(() => {
        // Best-effort lock. Better to render the screen than crash on a
        // legitimate runtime issue (e.g. user has system rotation disabled).
      });

      return () => {
        void So.unlockAsync().catch(() => {
          // Restoring the OS default is best-effort too — no rollback path.
        });
      };
    }, []),
  );
};
