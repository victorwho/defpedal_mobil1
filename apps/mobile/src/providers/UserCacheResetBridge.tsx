/**
 * UserCacheResetBridge — clears TanStack Query + Zustand user-scoped state
 * when the authenticated user id changes.
 *
 * Why this is a separate component instead of being folded into
 * AuthSessionProvider: `useQueryClient()` only works under `QueryClientProvider`,
 * and AuthSessionProvider sits ABOVE QueryClientProvider in the tree
 * (see AppProviders.tsx). This bridge is mounted as a child of
 * QueryClientProvider so both contexts are available.
 *
 * What it handles:
 *
 *   • sign-out (userId X → null): clear caches so the auth/onboarding screens
 *     don't flash the previous account's data and so ShareClaimProcessor /
 *     Trophy Case don't keep stale projections while the next sign-in
 *     resolves.
 *
 *   • account switch (userId X → Y where X ≠ Y): the common case. TanStack
 *     Query keys like ['badges'], ['tiers'] are not user-scoped and will
 *     serve user A's data to user B until each query happens to refetch.
 *     Zustand persist keeps cachedImpact / cachedStreak / earnedMilestones /
 *     pendingBadgeUnlocks between sessions, which is correct for a single
 *     user but wrong across accounts.
 *
 * What it SKIPS (by design):
 *   • initial sign-in (null → X): nothing to clear — first auth resolution.
 *   • no-op (X → X): e.g. refresh-token rotation, session-renewal ticks.
 *
 * Device-level preferences (theme, locale, voice guidance, offline map packs,
 * POI visibility, etc.) are NOT reset here — `resetUserScopedState()` in the
 * Zustand store explicitly omits them from the reset so users don't lose
 * dark-mode / language / downloaded maps when switching accounts.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAppStore } from '../store/appStore';
import { useAuthSessionOptional } from './AuthSessionProvider';

export const UserCacheResetBridge = () => {
  const auth = useAuthSessionOptional();
  const userId = auth?.user?.id ?? null;
  const isAnonymous = auth?.isAnonymous ?? true;
  const isLoading = auth?.isLoading ?? true;

  const queryClient = useQueryClient();
  const resetUserScopedState = useAppStore((s) => s.resetUserScopedState);
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);
  const previousUserIdRef = useRef<string | null>(null);
  const previousIsAnonymousRef = useRef<boolean>(true);

  useEffect(() => {
    if (isLoading) return;

    const previousUserId = previousUserIdRef.current;
    const previousIsAnonymous = previousIsAnonymousRef.current;
    previousUserIdRef.current = userId;
    previousIsAnonymousRef.current = isAnonymous;

    // Only act when a signed-in session transitions to a different session
    // (or to none at all). Initial null→X and steady-state X→X do nothing.
    if (!previousUserId) return;
    if (previousUserId === userId) return;

    // Anonymous → real-account is the same conceptual user being upgraded
    // (the canonical path: anonymous Supabase session generates a demo route
    // in /onboarding/first-route, then user signs in with Google → Supabase
    // mints a new userId for the real account). We must NOT `queryClient.clear()`
    // + `resetUserScopedState()` here — that wipes `routePreview` / `routeRequest`
    // between signInWithGoogle() returning and the post-signup screen reading
    // them, stranding the user on a blank planner instead of /route-preview.
    //
    // BUT the anonymous session's cached server queries (['tiers'], ['badges'],
    // impact-dashboard, trip-history) are NOT user-scoped, so without this the
    // real account keeps showing the anonymous session's stale XP/tiers/badges
    // (e.g. 0 XP after signing into an established account — the merge made this
    // visible, but it happens on any anon→account upgrade). Invalidate so those
    // queries refetch the real account's data, while leaving Zustand route state
    // intact.
    if (previousIsAnonymous && !isAnonymous) {
      void queryClient.invalidateQueries();
      return;
    }

    queryClient.clear();
    resetUserScopedState();
  }, [userId, isAnonymous, isLoading, queryClient, resetUserScopedState]);

  // Whenever the user holds a real (non-anonymous) account, mark onboarding
  // as completed. This covers every sign-in path — /auth (direct), the
  // /onboarding/signup-prompt screen, and OAuth deep-link callbacks — so a
  // subsequent sign-out doesn't bounce the user back into the onboarding
  // flow they already implicitly completed by creating an account.
  useEffect(() => {
    if (isLoading) return;
    if (!userId || isAnonymous) return;
    if (useAppStore.getState().onboardingCompleted) return;
    setOnboardingCompleted(true);
  }, [userId, isAnonymous, isLoading, setOnboardingCompleted]);

  return null;
};
