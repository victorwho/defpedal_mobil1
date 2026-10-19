import { usePathname } from 'expo-router';

import { useAuthSessionOptional } from '../providers/AuthSessionProvider';
import { useAppStore } from '../store/appStore';
import { useStoreHydrated } from './useStoreHydrated';
import type { OnboardingGateState } from './computeOnboardingGateTarget';

export {
  computeOnboardingGateTarget,
  type OnboardingGateState,
} from './computeOnboardingGateTarget';

/**
 * Reads the live signup-gate state from Zustand + the auth session context.
 *
 * Shared by:
 * - `app/_layout.tsx` (enforces the gate via imperative `router.replace` so
 *   mid-session state changes and hardware-back attempts on the mandatory gate
 *   are caught).
 * - `app/index.tsx` (resolves the initial-route redirect from INSIDE the
 *   navigator context, which is where `<Redirect>` actually works — the
 *   previous implementation tried to render `<Redirect>` at root-layout level
 *   where `useFocusEffect` never fires because there is no focused screen).
 */
export const useOnboardingGate = (): OnboardingGateState => {
  const pathname = usePathname();
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const completedRideCount = useAppStore((s) => s.completedRideCount);
  const hasPendingRideReminder = useAppStore((s) => s.firstRideReminderAt !== null);
  const isFirstRideFlow = useAppStore((s) => s.onboardingFlow === 'first_ride');
  const anonymousRideOn = useAppStore(
    (s) => s.onboardingAnonymousRide && s.onboardingFlow === 'first_ride',
  );
  const storeHydrated = useStoreHydrated();
  const authCtx = useAuthSessionOptional();

  const isLoading = authCtx?.isLoading ?? true;
  const isSessionUnreadable = authCtx?.isSessionUnreadable ?? false;
  const hasRealAccount = authCtx?.user != null && authCtx?.isAnonymous === false;

  return {
    pathname,
    onboardingCompleted,
    storeHydrated,
    isLoading,
    isSessionUnreadable,
    hasRealAccount,
    anonymousFirstRideAllowed: anonymousRideOn && !onboardingCompleted && completedRideCount === 0,
    // On the first-ride flow only — elsewhere the gate keeps its old behaviour
    // exactly. Deliberately NOT tied to the anonymous-ride switch: once a ride
    // has happened it must be kept, even if the switch was turned off (or a
    // failed re-read set it off) in the meantime.
    hasCompletedARide: isFirstRideFlow && completedRideCount > 0,
    hasPendingRideReminder,
  };
};
