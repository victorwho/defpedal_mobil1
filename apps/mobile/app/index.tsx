import { useEffect, useRef } from 'react';
import { Redirect } from 'expo-router';

import {
  computeOnboardingGateTarget,
  useOnboardingGate,
} from '../src/hooks/useOnboardingGate';
import { computePostSignupStepTarget } from '../src/hooks/computePostSignupStepTarget';
import { mobileEnv } from '../src/lib/env';
import { useAppStore } from '../src/store/appStore';

export default function Index() {
  const appState = useAppStore((state) => state.appState);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const routePreview = useAppStore((state) => state.routePreview);
  const resetFlow = useAppStore((state) => state.resetFlow);
  const bikeTypeId = useAppStore((state) => state.bikeTypeId);
  const bikeTypePromptSeen = useAppStore((state) => state.bikeTypePromptSeen);
  const gate = useOnboardingGate();
  const hasClearedPreviewRef = useRef(false);

  // Gate the initial-route redirect so an anonymous user on a fresh install
  // lands on /onboarding/index instead of /route-planning. This evaluation
  // runs from INSIDE the navigator (index is the initial Stack screen), which
  // is where `<Redirect>`'s `useFocusEffect` actually fires — the previous
  // attempt to render `<Redirect>` at root-layout level silently dropped the
  // navigation because no screen was focused.
  const gateTarget = computeOnboardingGateTarget(gate);
  const postSignupStepTarget = computePostSignupStepTarget({
    // Always '/' here — the appState field below is what actually protects
    // an in-progress ride at this call site.
    pathname: '/',
    appState,
    storeHydrated: gate.storeHydrated,
    isLoading: gate.isLoading,
    hasRealAccount: gate.hasRealAccount,
    bikeTypeId,
    bikeTypePromptSeen,
  });

  // Real-account cold starts always land on a clean route-planning screen.
  // Drop any persisted ROUTE_PREVIEW / AWAITING_FEEDBACK so the user picks
  // a fresh destination instead of resuming where they left off. Anonymous
  // sessions are untouched — the mandatory signup gate walls them before any
  // of this state matters, and their persisted route survives the merge on
  // signup. NAVIGATING is also untouched — that's the active-ride recovery
  // path owned by NavigationResumeGuard.
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

  // Post-signup steps that still owe an answer. This is the convergence point
  // for EMAIL signups: `auth.tsx` performs no navigation on success, so an
  // email rider reaches the app through here and would otherwise never see a
  // step anchored to `navigateAfterOnboarding()` (the Google/Apple path).
  // Skipped during an active ride / post-ride summary by the same
  // protected-path rule the signup gate uses.
  if (postSignupStepTarget) {
    return <Redirect href={postSignupStepTarget as never} />;
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
