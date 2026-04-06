import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mobileEnv } from '../src/lib/env';
import { AppProviders } from '../src/providers/AppProviders';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';
import { telemetry } from '../src/lib/telemetry';
import { useTheme } from '../src/design-system';
import { fontAssets } from '../src/design-system/fonts';
import { darkTheme } from '../src/design-system/tokens/colors';
import { BadgeUnlockOverlayManager } from '../src/design-system/organisms/BadgeUnlockOverlay';

// Keep splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

const RouteTelemetryObserver = () => {
  const pathname = usePathname();
  const lastScreenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastScreenRef.current === pathname) {
      return;
    }

    lastScreenRef.current = pathname;
    telemetry.screen(pathname, {
      app_env: mobileEnv.appEnv,
      app_variant: mobileEnv.appVariant,
    });
  }, [pathname]);

  return null;
};

/**
 * Guards app entry based on auth state and anonymous open count.
 *
 * Logic:
 * - Real account (Google): always pass through, no prompts.
 * - Anonymous, count 1, onboarding not done: onboarding flow.
 * - Anonymous, count 2-4, onboarding done: dismissible signup prompt.
 * - Anonymous, count >= 5: mandatory signup (no skip).
 *
 * The anonymousOpenCount is incremented once per app launch (via ref).
 */
const OnboardingGuard = () => {
  const pathname = usePathname();
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const anonymousOpenCount = useAppStore((s) => s.anonymousOpenCount);
  const incrementAnonymousOpenCount = useAppStore((s) => s.incrementAnonymousOpenCount);
  const authCtx = useAuthSessionOptional();
  const hasIncrementedRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  const isLoading = authCtx?.isLoading ?? true;
  const hasRealAccount = authCtx?.user != null && authCtx?.isAnonymous === false;

  // Increment anonymous open count once per app launch
  useEffect(() => {
    if (!hasIncrementedRef.current && !hasRealAccount && !isLoading) {
      hasIncrementedRef.current = true;
      incrementAnonymousOpenCount();
    }
  }, [hasRealAccount, isLoading, incrementAnonymousOpenCount]);

  // Redirect logic — imperative to avoid render-loop from <Redirect>
  useEffect(() => {
    if (isLoading || hasRealAccount) return;
    if (pathname.startsWith('/onboarding')) return;
    if (pathname === '/feedback' || pathname === '/navigation') return;
    if (hasRedirectedRef.current) return;

    if (onboardingCompleted === false) {
      hasRedirectedRef.current = true;
      router.replace('/onboarding/index' as never);
    } else if (anonymousOpenCount >= 5) {
      hasRedirectedRef.current = true;
      router.replace('/onboarding/signup-prompt?mandatory=true' as never);
    } else if (anonymousOpenCount >= 2) {
      hasRedirectedRef.current = true;
      router.replace('/onboarding/signup-prompt' as never);
    }
  }, [isLoading, hasRealAccount, pathname, onboardingCompleted, anonymousOpenCount]);

  return null;
};

const RootLayoutInner = () => {
  const { colors } = useTheme();
  const showValidationOverlay = mobileEnv.validationMode === 'android-native-validate';

  if (__DEV__ && showValidationOverlay) {
    console.log('validation: RootLayout render', {
      bundleId: mobileEnv.validationBundleId || 'missing',
      mode: mobileEnv.validationMode,
    });
  }

  return (
    <>
      <StatusBar style="light" />
      <RouteTelemetryObserver />
      <OnboardingGuard />
      {showValidationOverlay ? (
        <View pointerEvents="none" style={styles.validationOverlay}>
          <Text style={styles.validationLabel}>Validation build active</Text>
          <Text style={styles.validationValue}>
            {mobileEnv.validationBundleId || 'bundle id unavailable'}
          </Text>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.bgDeep,
          },
        }}
      />
      <BadgeUnlockOverlayManager />
    </>
  );
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={styles.root} onLayout={onLayoutRootView}>
      <AppProviders>
        <RootLayoutInner />
      </AppProviders>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
  },
  validationOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 16, 32, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  validationLabel: {
    color: darkTheme.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  validationValue: {
    color: '#cbd5e1',
    fontSize: 11,
  },
});
