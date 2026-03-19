import { Redirect } from 'expo-router';

import { mobileEnv } from '../src/lib/env';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';

export default function Index() {
  const authCtx = useAuthSessionOptional();
  const appState = useAppStore((state) => state.appState);
  const navigationSession = useAppStore((state) => state.navigationSession);
  const routePreview = useAppStore((state) => state.routePreview);

  if (__DEV__ && mobileEnv.validationMode === 'android-native-validate') {
    console.log('validation: index route render', {
      appState,
      hasNavigationSession: Boolean(navigationSession),
      routeCount: routePreview?.routes.length ?? 0,
    });
  }

  // Wait for the auth session to finish loading before deciding which screen
  // to redirect to. The splash screen remains visible during this time.
  if (authCtx?.isLoading) {
    return null;
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
