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
  const gate = useOnboardingGate();

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
    });
  }

  if (gateTarget) {
    return <Redirect href={gateTarget as never} />;
  }

  if (appState === 'NAVIGATING' && navigationSession && routePreview?.routes.length) {
    return <Redirect href="/navigation" />;
  }

  if (appState === 'ROUTE_PREVIEW' && routePreview?.routes.length) {
    return <Redirect href="/route-preview" />;
  }

  if (appState === 'AWAITING_FEEDBACK') {
    return <Redirect href="/feedback" />;
  }

  return <Redirect href="/route-planning" />;
}
