import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, StyleSheet, Text, View } from 'react-native';

import { mobileEnv } from '../src/lib/env';
import { mobileApi } from '../src/lib/api';
import { cleanupOfflinePacks } from '../src/lib/offlinePackCleanup';
import { listOfflineRegions } from '../src/lib/offlinePacks';
import { AppProviders } from '../src/providers/AppProviders';
import { useAuthSessionOptional } from '../src/providers/AuthSessionProvider';
import { useAppStore } from '../src/store/appStore';
import { telemetry } from '../src/lib/telemetry';
import { useTheme } from '../src/design-system';
import { fontAssets } from '../src/design-system/fonts';
import { darkTheme } from '../src/design-system/tokens/colors';
import { zIndex } from '../src/design-system/tokens/zIndex';
import { BadgeUnlockOverlayManager } from '../src/design-system/organisms/BadgeUnlockOverlay';
import { MiaInvitationPrompt } from '../src/design-system/organisms/MiaInvitationPrompt';
import { MiaLevelUpOverlay } from '../src/design-system/organisms/MiaLevelUpOverlay';
import { RankUpOverlay } from '../src/design-system/organisms/RankUpOverlay';
import { ErrorBoundary } from '../src/design-system/organisms/ErrorBoundary';
import { NavigationResumeGuard } from '../src/components/NavigationResumeGuard';

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

/** Enqueues an `app_open` telemetry event on mount and when the app returns to foreground.
 *  Debounced: only fires if the last app_open was >60 seconds ago. */
const AppOpenTelemetryObserver = () => {
  const lastAppOpenRef = useRef<number>(0);
  const enqueueTelemetryEvent = useAppStore((s) => s.enqueueTelemetryEvent);
  const authCtx = useAuthSessionOptional();

  const enqueueAppOpen = useCallback(() => {
    const now = Date.now();
    if (now - lastAppOpenRef.current < 60_000) return;
    lastAppOpenRef.current = now;

    const state = useAppStore.getState();
    enqueueTelemetryEvent({
      eventType: 'app_open',
      properties: {
        persona: state.persona,
        mia_level: state.miaJourneyLevel,
        locale: state.locale,
        anonymous: authCtx?.isAnonymous ?? true,
      },
      timestamp: new Date().toISOString(),
    });
  }, [enqueueTelemetryEvent, authCtx?.isAnonymous]);

  // Fire on mount
  useEffect(() => {
    enqueueAppOpen();
  }, [enqueueAppOpen]);

  // Fire when app comes back to foreground
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        enqueueAppOpen();
      }
    });
    return () => subscription.remove();
  }, [enqueueAppOpen]);

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

/**
 * Shows the MiaInvitationPrompt when behavioral detection conditions are met:
 * - persona is still 'alex' (not yet in Mia journey)
 * - miaPromptShown is false (hasn't been dismissed before)
 * - onboarding is completed
 * - user has opened the app 3+ times without starting a ride
 * - NOT during NAVIGATING state
 */
const MiaInvitationPromptManager = () => {
  const persona = useAppStore((s) => s.persona);
  const miaPromptShown = useAppStore((s) => s.miaPromptShown);
  const appState = useAppStore((s) => s.appState);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const anonymousOpenCount = useAppStore((s) => s.anonymousOpenCount);
  const activateMiaJourney = useAppStore((s) => s.activateMiaJourney);
  const setMiaPromptShown = useAppStore((s) => s.setMiaPromptShown);

  const [visible, setVisible] = useState(false);

  // Behavioral detection: show prompt when conditions are met
  const shouldShow =
    persona === 'alex' &&
    !miaPromptShown &&
    onboardingCompleted &&
    anonymousOpenCount >= 3 &&
    appState !== 'NAVIGATING';

  useEffect(() => {
    if (shouldShow) {
      // Small delay so the app settles before showing the prompt
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [shouldShow]);

  const handleAccept = useCallback(() => {
    setVisible(false);
    // Activate on server + update local store
    mobileApi.activateMia('behavioral').catch(() => {
      // Offline — the store update stands, will sync later
    });
    activateMiaJourney('behavioral');
  }, [activateMiaJourney]);

  const handleDecline = useCallback(() => {
    setVisible(false);
    // Mark prompt as shown in persisted Zustand store
    setMiaPromptShown();
  }, [setMiaPromptShown]);

  if (!visible) return null;

  return (
    <MiaInvitationPrompt
      onAccept={handleAccept}
      onDecline={handleDecline}
    />
  );
};

/**
 * Handles deep links with ?persona=mia query parameter.
 *
 * When the app opens from a referral link containing persona=mia,
 * auto-activates the Mia journey with source='contextual',
 * skipping the onboarding self-selection step.
 *
 * Only activates if the user isn't already in a Mia journey.
 */
const MiaDeepLinkHandler = () => {
  const persona = useAppStore((s) => s.persona);
  const miaJourneyStatus = useAppStore((s) => s.miaJourneyStatus);
  const activateMiaJourney = useAppStore((s) => s.activateMiaJourney);
  const hasHandledRef = useRef(false);

  const handleUrl = useCallback(
    (url: string) => {
      if (hasHandledRef.current) return;

      try {
        const parsed = Linking.parse(url);
        const personaParam =
          parsed.queryParams?.persona ?? parsed.queryParams?.['persona'];

        if (personaParam === 'mia') {
          // Only activate if not already in a Mia journey
          const currentPersona = useAppStore.getState().persona;
          const currentStatus = useAppStore.getState().miaJourneyStatus;

          if (currentPersona === 'alex' && currentStatus == null) {
            hasHandledRef.current = true;
            mobileApi.activateMia('contextual').catch(() => {
              // Offline — store update stands
            });
            activateMiaJourney('contextual');
          }
        }
      } catch {
        // Invalid URL — ignore silently
      }
    },
    [activateMiaJourney],
  );

  useEffect(() => {
    // Already in Mia journey — skip
    if (persona === 'mia' || miaJourneyStatus != null) return;

    // Handle the URL that opened the app (cold start)
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Handle deep links while the app is running (warm start)
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [persona, miaJourneyStatus, handleUrl]);

  return null;
};

/** Shows the MiaLevelUpOverlay when a level-up is queued in appStore. */
const MiaLevelUpOverlayManager = () => {
  const appState = useAppStore((s) => s.appState);
  const pendingMiaLevelUp = useAppStore((s) => s.pendingMiaLevelUp);
  const shiftMiaLevelUp = useAppStore((s) => s.shiftMiaLevelUp);

  // Suppress during navigation (same as badges and rank-up)
  if (!pendingMiaLevelUp || appState === 'NAVIGATING') return null;

  const handleTestimonialSubmit = (text: string) => {
    mobileApi.submitMiaTestimonial(text).catch(() => {
      // Offline — testimonial lost, acceptable
    });
  };

  return (
    <MiaLevelUpOverlay
      fromLevel={pendingMiaLevelUp.fromLevel}
      toLevel={pendingMiaLevelUp.toLevel}
      onDismiss={() => shiftMiaLevelUp()}
      onTestimonialSubmit={handleTestimonialSubmit}
    />
  );
};

const RootLayoutInner = () => {
  const { colors } = useTheme();
  const showValidationOverlay = mobileEnv.validationMode === 'android-native-validate';

  // Fire-and-forget offline pack cleanup on app launch
  useEffect(() => {
    void listOfflineRegions()
      .then((regions) => cleanupOfflinePacks(regions))
      .catch(() => {
        // Non-blocking — cleanup failure is acceptable
      });
  }, []);

  if (__DEV__ && showValidationOverlay) {
    console.log('validation: RootLayout render', {
      bundleId: mobileEnv.validationBundleId || 'missing',
      mode: mobileEnv.validationMode,
    });
  }

  return (
    <>
      <StatusBar style="auto" />
      <RouteTelemetryObserver />
      <AppOpenTelemetryObserver />
      <OnboardingGuard />
      <NavigationResumeGuard />
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
      <RankUpOverlayManager />
      <MiaLevelUpOverlayManager />
      <MiaInvitationPromptManager />
      <MiaDeepLinkHandler />
    </>
  );
};

/** Shows the RankUpOverlay when a tier promotion is queued in appStore. */
const RankUpOverlayManager = () => {
  const promotion = useAppStore((s) => s.pendingTierPromotion);
  const clearPromotion = useAppStore((s) => s.clearTierPromotion);
  const appState = useAppStore((s) => s.appState);

  // Suppress during navigation (same as badges)
  if (!promotion || !promotion.promoted || appState === 'NAVIGATING') return null;

  return (
    <RankUpOverlay
      oldTier={promotion.oldTier}
      newTier={promotion.newTier}
      tierDisplayName={promotion.tierDisplayName ?? promotion.newTier}
      tagline={promotion.tierTagline ?? ''}
      tierColor={promotion.tierColor ?? '#F2C30F'}
      perkDescription={promotion.tierPerk ?? ''}
      onDismiss={clearPromotion}
    />
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
    <ErrorBoundary>
      <View style={styles.root} onLayout={onLayoutRootView}>
        <AppProviders>
          <RootLayoutInner />
        </AppProviders>
      </View>
    </ErrorBoundary>
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
    zIndex: zIndex.popover,
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
