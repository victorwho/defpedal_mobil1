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
 * Returns `true` when the guard passes and the screen should render its content,
 * or `false` when a redirect has been triggered.
 */
export const useRouteGuard = (rule: RouteGuardRule): boolean => {
  const appState = useAppStore((state) => state.appState);
  const redirectedRef = useRef(false);

  const stateMatches = rule.requiredStates.includes(appState);
  const conditionPasses = rule.condition ? rule.condition() : true;
  const shouldAllow = stateMatches && conditionPasses;

  useEffect(() => {
    if (!shouldAllow && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace(rule.fallback ?? '/route-planning');
    }
  }, [shouldAllow, rule.fallback]);

  return shouldAllow;
};
