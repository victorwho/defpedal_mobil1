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
 *     MiaJourneyTracker / Trophy Case don't keep stale projections while the
 *     next sign-in resolves.
 *
 *   • account switch (userId X → Y where X ≠ Y): the common case. TanStack
 *     Query keys like ['badges'], ['tiers'], ['mia-journey', persona] are not
 *     user-scoped and will serve user A's data to user B until each query
 *     happens to refetch. Zustand persist keeps cachedImpact / cachedStreak /
 *     earnedMilestones / pendingBadgeUnlocks / Mia journey state between
 *     sessions, which is correct for a single user but wrong across accounts.
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
  const isLoading = auth?.isLoading ?? true;

  const queryClient = useQueryClient();
  const resetUserScopedState = useAppStore((s) => s.resetUserScopedState);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = userId;

    // Only act when a signed-in session transitions to a different session
    // (or to none at all). Initial null→X and steady-state X→X do nothing.
    if (!previousUserId) return;
    if (previousUserId === userId) return;

    queryClient.clear();
    resetUserScopedState();
  }, [userId, isLoading, queryClient, resetUserScopedState]);

  return null;
};
