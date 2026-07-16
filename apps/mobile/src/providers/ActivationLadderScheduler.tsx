import { useEffect } from 'react';

import { hasNotificationsNativeModule } from '../lib/notificationNativeModule';
import { useAuthSessionOptional } from './AuthSessionProvider';
import { useAppStore } from '../store/appStore';

/**
 * Anonymous Activation Ladder — schedule pass on every app open.
 * Spec: docs/plans/anonymous-activation-ladder.md.
 *
 * Mounted in AppProviders after DailyWeatherScheduler, which owns the single
 * notification-permission prompt (`ensureNotificationPermissionAsync`). This
 * provider never prompts — the pass reads permission state and stays silent
 * when not granted (checklist (b)).
 *
 * The pass itself decides everything (stop conditions, rung selection,
 * cancel/reschedule) — see `runActivationLadderPass`. It must run even when a
 * stop condition holds, because stopping includes CANCELLING the pending
 * notification (e.g. the user completed a ride or registered since the rung
 * was scheduled). That's why the effect is NOT gated on `isAnonymous`.
 */
export const ActivationLadderScheduler = () => {
  const authCtx = useAuthSessionOptional();
  const isAuthLoading = authCtx?.isLoading ?? true;
  const isAnonymous = authCtx?.isAnonymous ?? false;
  const userId = authCtx?.user?.id ?? null;

  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const notifyActivationLadder = useAppStore((s) => s.notifyActivationLadder);
  const completedRideCount = useAppStore((s) => s.completedRideCount);
  const ladderCompleted = useAppStore((s) => s.activationLadder.completed);

  useEffect(() => {
    // Wait for a settled auth state — a loading session would misread a
    // real account as "not anonymous yet" and vice versa.
    if (isAuthLoading) return;
    // firstOpenAt is anchored to the first POST-onBOARDING open: rung 1's
    // "+28h" counts from the moment the user could actually plan a ride.
    if (!onboardingCompleted) return;
    if (!hasNotificationsNativeModule()) return;
    // Terminal state and nothing scheduled to cancel → skip the pass work.
    if (ladderCompleted) return;

    // Small delay (same pattern as DailyWeatherScheduler) so the pass never
    // competes with first-frame work; also lets the weather scheduler's
    // permission prompt resolve first on the very first open.
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const runPass = async (): Promise<string> => {
      try {
        const { runActivationLadderPassFromStore } =
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('../lib/activation-ladder') as typeof import('../lib/activation-ladder');
        return await runActivationLadderPassFromStore(isAnonymous);
      } catch {
        // Silently fail — never let notification plumbing crash the app.
        return 'error';
      }
    };
    const timer = setTimeout(() => {
      void runPass().then((result) => {
        // First-session permission race: on the very first post-onboarding
        // open, the weather scheduler's OS permission dialog is typically
        // still on screen when this pass reads getPermissionsAsync()
        // ('undetermined' → no-permission). Without a retry, a user who
        // grants permission but NEVER reopens the app — the exact cohort the
        // ladder targets — would never get rung 1 scheduled. One retry after
        // the dialog has certainly been answered closes the gap; later app
        // opens remain the backstop.
        if (result === 'no-permission') {
          retryTimer = setTimeout(() => {
            void runPass();
          }, 60_000);
        }
      });
    }, 4000);

    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
    // completedRideCount + userId + toggle in deps: finishing a ride,
    // registering, or toggling off mid-session re-runs the pass promptly so
    // the pending notification is cancelled the same session (acceptance §10.2).
  }, [
    isAuthLoading,
    isAnonymous,
    userId,
    onboardingCompleted,
    notifyActivationLadder,
    completedRideCount,
    ladderCompleted,
  ]);

  return null;
};
