import { useEffect, useRef } from 'react';
import { Redirect } from 'expo-router';

import {
  computeOnboardingGateTarget,
  useOnboardingGate,
} from '../src/hooks/useOnboardingGate';
import { mobileEnv } from '../src/lib/env';
import { useAppStore } from '../src/store/appStore';

export default function Index() {
  const appState = useAppStore((state) => state.appState);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const routePreview = useAppStore((state) => state.routePreview);
  const resetFlow = useAppStore((state) => state.resetFlow);
  const gate = useOnboardingGate();
  const hasClearedPreviewRef = useRef(false);

  // Gate the initial-route redirect so an anonymous user on a fresh install
  // lands on /onboarding/index instead of /route-planning. This evaluation
  // runs from INSIDE the navigator (index is the initial Stack screen), which
  // is where `<Redirect>`'s `useFocusEffect` actually fires — the previous
  // attempt to render `<Redirect>` at root-layout level silently dropped the
  // navigation because no screen was focused.
  //
  // `hasRedirected=false` is safe here because this component only mounts on
  // cold start (and on explicit router.replace('/')); the "don't re-fire the
  // one-shot branches" guarantee is handled by _layout.tsx's imperative
  // gate effect, which manages its own ref across the app lifetime.
  const gateTarget = computeOnboardingGateTarget(gate, false);

  // Real-account cold starts always land on a clean route-planning screen.
  // Drop any persisted ROUTE_PREVIEW / AWAITING_FEEDBACK so the user picks
  // a fresh destination instead of resuming where they left off. Anonymous
  // sessions are intentionally untouched (their open count drives the signup
  // gate, and resuming a half-built route nudges them toward signing up).
  // NAVIGATING is also untouched — that's the active-ride recovery path
  // owned by NavigationResumeGuard.
  const shouldClearStalePreview =
    gate.storeHydrated &&
    !gate.isLoading &&
    gate.hasRealAccount &&
    (appState === 'ROUTE_PREVIEW' || appState === 'AWAITING_FEEDBACK');

  useEffect(() => {
    if (hasClearedPreviewRef.current) return;
    if (!shouldClearStalePreview) return;
    hasClearedPreviewRef.current = true;
    resetFlow();
  }, [shouldClearStalePreview, resetFlow]);

  // Pre-hydration / pre-auth we can't safely redirect yet. `null` keeps the
  // splash screen up until the gate decides.
  if (!gate.storeHydrated || gate.isLoading) {
    return null;
  }

  if (__DEV__ && mobileEnv.validationMode === 'android-native-validate') {
    console.log('validation: index route render', {
      appState,
      hasNavigationSession: Boolean(navigationSession),
      routeCount: routePreview?.routes.length ?? 0,
      gateTarget,
      shouldClearStalePreview,
    });
  }

  if (gateTarget) {
    return <Redirect href={gateTarget as never} />;
  }

  if (appState === 'NAVIGATING' && navigationSession && routePreview?.routes.length) {
    return <Redirect href="/navigation" />;
  }

  // For real-account users we suppress the persisted ROUTE_PREVIEW /
  // AWAITING_FEEDBACK redirects this render — the effect above is clearing
  // them so the next render falls through to /route-planning naturally,
  // and we want to avoid a one-frame flash of /route-preview or /feedback.
  if (!shouldClearStalePreview) {
    if (appState === 'ROUTE_PREVIEW' && routePreview?.routes.length) {
      return <Redirect href="/route-preview" />;
    }

    if (appState === 'AWAITING_FEEDBACK') {
      return <Redirect href="/feedback" />;
    }
  }

  return <Redirect href="/route-planning" />;
}
