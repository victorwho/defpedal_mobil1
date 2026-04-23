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
  const anonymousOpenCount = useAppStore((s) => s.anonymousOpenCount);
  const storeHydrated = useStoreHydrated();
  const authCtx = useAuthSessionOptional();

  const isLoading = authCtx?.isLoading ?? true;
  const hasRealAccount = authCtx?.user != null && authCtx?.isAnonymous === false;

  return {
    pathname,
    onboardingCompleted,
    anonymousOpenCount,
    storeHydrated,
    isLoading,
    hasRealAccount,
  };
};
