import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { AppState } from '@defensivepedal/core';
import { useAppStore } from '../store/appStore';

type RouteGuardRule = {
  /** The app state(s) that this screen is valid for. */
  requiredStates: AppState[];
  /** Additional predicate — if it returns false the guard redirects. */
  condition?: () => boolean;
  /** Where to redirect when the guard fails (default: `/route-planning`). */
  fallback?: string;
};

/**
 * Protects a screen from being rendered when the app state doesn't satisfy the
 * screen's preconditions (e.g. arriving via stale deep link or manual URL).
 *
 * Once the guard passes it stays passed for the lifetime of the component mount.
 * This prevents Zustand persist hydration from overwriting in-memory state and
 * triggering a spurious redirect after the screen has already been entered
 * through a valid state transition.
 *
 * Returns `true` when the guard passes and the screen should render its content,
 * or `false` when a redirect has been triggered.
 */
export const useRouteGuard = (rule: RouteGuardRule): boolean => {
  const appState = useAppStore((state) => state.appState);
  const redirectedRef = useRef(false);
  const hasPassedRef = useRef(false);

  const stateMatches = rule.requiredStates.includes(appState);
  const conditionPasses = rule.condition ? rule.condition() : true;
  const shouldAllow = stateMatches && conditionPasses;

  // Once the guard has passed, lock it so persist hydration can't revoke it.
  if (shouldAllow && !hasPassedRef.current) {
    hasPassedRef.current = true;
  }

  // If the guard already passed once, keep it passed.
  const effectiveAllow = hasPassedRef.current || shouldAllow;

  useEffect(() => {
    if (!effectiveAllow && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace((rule.fallback ?? '/route-planning') as any);
    }
  }, [effectiveAllow, rule.fallback]);

  return effectiveAllow;
};
