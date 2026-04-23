import { Redirect, Stack, usePathname } from 'expo-router';
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
import { useMiaJourney } from '../src/hooks/useMiaJourney';
import { useStoreHydrated } from '../src/hooks/useStoreHydrated';
import { extractRouteShareCode } from '../src/lib/shareDeepLinkParser';

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
 * - Anonymous, count == 2, onboarding done: dismissible signup prompt.
 * - Anonymous, count >= 3: mandatory signup (no skip).
 *
 * The anonymousOpenCount is incremented once per app launch (via ref).
 */
// Minimum time the app must spend in the background before a foreground
// transition counts as a new "session" for signup-gate purposes. Chosen to
// balance against accidental notification-shade swipes but still aggressive
// enough to match a user's mental model of "opening the app again".
const SESSION_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Shared between OnboardingGuard (for its effects and `hasRedirectedRef`
 * one-shot gating) and the root render, which decides between rendering
 * `<Stack>` vs the `<Redirect>` — this avoids the race where `app/index.tsx`
 * also renders its own `<Redirect href="/route-planning" />` and wins the
 * navigation coin-flip on fresh installs, silently swallowing the
 * onboarding redirect. When a redirect target is pending we don't render
 * Stack at all, so `index.tsx` never mounts.
 */
const useOnboardingGateState = () => {
  const pathname = usePathname();
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const anonymousOpenCount = useAppStore((s) => s.anonymousOpenCount);
  const authCtx = useAuthSessionOptional();
  const storeHydrated = useStoreHydrated();

  const isLoading = authCtx?.isLoading ?? true;
  const hasRealAccount = authCtx?.user != null && authCtx?.isAnonymous === false;

  return {
    pathname,
    onboardingCompleted,
    anonymousOpenCount,
    storeHydrated,
    isLoading,
    hasRealAccount,
  };
};

const computeRedirectTarget = (
  s: ReturnType<typeof useOnboardingGateState>,
  hasRedirected: boolean,
): string | null => {
  if (!s.storeHydrated) return null;
  if (s.isLoading || s.hasRealAccount) return null;
  if (s.pathname.startsWith('/onboarding')) return null;
  if (s.pathname === '/feedback' || s.pathname === '/navigation') return null;

  // Mandatory gate — re-redirects on every attempt to escape it.
  if (s.onboardingCompleted !== false && s.anonymousOpenCount >= 3) {
    return '/onboarding/signup-prompt?mandatory=true';
  }

  // One-shot branches: once the user navigates away from the prompt/onboarding
  // for a legit reason, don't spam redirects. Mandatory above ignores this.
  if (hasRedirected) return null;

  if (s.onboardingCompleted === false) return '/onboarding/index';
  if (s.anonymousOpenCount >= 2) return '/onboarding/signup-prompt';
  return null;
};

const OnboardingGuard = () => {
  const state = useOnboardingGateState();
  const incrementAnonymousOpenCount = useAppStore((s) => s.incrementAnonymousOpenCount);
  const hasIncrementedRef = useRef(false);
  // Tracks when the app last went to background so we can decide if a
  // foreground transition should count as a new session.
  const lastBackgroundAtRef = useRef<number | null>(null);

  const { storeHydrated, isLoading, hasRealAccount } = state;

  // Increment anonymous open count once per app launch.
  // Gated on storeHydrated so the increment isn't clobbered by late hydration.
  useEffect(() => {
    if (!storeHydrated) return;
    if (!hasIncrementedRef.current && !hasRealAccount && !isLoading) {
      hasIncrementedRef.current = true;
      incrementAnonymousOpenCount();
    }
  }, [storeHydrated, hasRealAccount, isLoading, incrementAnonymousOpenCount]);

  // Secondary increment path: some Android OEMs keep the JS process alive
  // when the user swipes away from recents. In that case `_layout.tsx` does
  // not remount on the next "open" and the mount-based increment above only
  // ever fires once per process lifetime. Counting background→active
  // transitions (above an idle threshold) covers those cases.
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        lastBackgroundAtRef.current = Date.now();
        return;
      }
      if (next !== 'active') return;

      const lastBackground = lastBackgroundAtRef.current;
      if (lastBackground == null) return; // initial foreground after mount — the mount effect already handled it
      const idleMs = Date.now() - lastBackground;
      lastBackgroundAtRef.current = null;
      if (idleMs < SESSION_IDLE_THRESHOLD_MS) return;

      if (!storeHydrated || hasRealAccount || isLoading) return;
      incrementAnonymousOpenCount();
    });
    return () => subscription.remove();
  }, [storeHydrated, hasRealAccount, isLoading, incrementAnonymousOpenCount]);

  // OnboardingGuard no longer renders the `<Redirect>` itself — that is
  // handled at the RootLayoutInner level so it can replace the Stack while
  // a redirect is pending. See the comment above `useOnboardingGateState`.
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

/**
 * Route-share deep-link handler (slice 2 of route-share PRD).
 *
 * Captures `https://routes.defensivepedal.com/r/<code>` universal links
 * (plus the app-scheme fallback `defensivepedal*://route-share/<code>`)
 * and queues the claim by writing the code into Zustand. The
 * `ShareClaimProcessor` provider in AppProviders watches that slot and
 * runs the claim pipeline once auth-session is ready.
 *
 * Runs as a sibling to MiaDeepLinkHandler — both subscribe to
 * Linking.addEventListener independently, so the two handlers compose
 * without interfering with each other.
 *
 * URL parsing lives in `src/lib/shareDeepLinkParser.ts` so it can be
 * unit-tested and reused by the install-referrer + clipboard fallbacks
 * (task S2-MOBILE-REFERRER).
 */
const RouteShareDeepLinkHandler = () => {
  const setPendingShareClaim = useAppStore((s) => s.setPendingShareClaim);
  const handledUrlsRef = useRef<Set<string>>(new Set());

  const handleUrl = useCallback(
    (url: string) => {
      if (handledUrlsRef.current.has(url)) return;

      const code = extractRouteShareCode(url);
      if (!code) return;

      handledUrlsRef.current.add(url);
      setPendingShareClaim(code);
    },
    [setPendingShareClaim],
  );

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
      handledUrlsRef.current.clear();
    };
  }, [handleUrl]);

  return null;
};

/** Shows the MiaLevelUpOverlay when a level-up is queued in appStore. */
const MiaLevelUpOverlayManager = () => {
  const appState = useAppStore((s) => s.appState);
  const pendingMiaLevelUp = useAppStore((s) => s.pendingMiaLevelUp);
  const shiftMiaLevelUp = useAppStore((s) => s.shiftMiaLevelUp);
  const miaJourney = useMiaJourney();

  // Suppress during navigation (same as badges and rank-up)
  if (!pendingMiaLevelUp || appState === 'NAVIGATING') return null;

  const handleTestimonialSubmit = (text: string) => {
    mobileApi.submitMiaTestimonial(text).catch(() => {
      // Offline — testimonial lost, acceptable
    });
  };

  // Derive share-card stats from the journey query. Falls back to zeros until
  // the query resolves — the overlay renders immediately on level-up and we
  // don't want to block the celebration waiting for data.
  const journeyStats = miaJourney.data
    ? {
        totalRides: miaJourney.data.totalRides,
        totalKm: 0, // Not in MiaJourneyState — distance stats live in the impact dashboard.
        daysSinceStart: miaJourney.data.startedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(miaJourney.data.startedAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : 0,
      }
    : undefined;

  return (
    <MiaLevelUpOverlay
      fromLevel={pendingMiaLevelUp.fromLevel}
      toLevel={pendingMiaLevelUp.toLevel}
      onDismiss={() => shiftMiaLevelUp()}
      onTestimonialSubmit={handleTestimonialSubmit}
      stats={journeyStats}
    />
  );
};

const RootLayoutInner = () => {
  const { colors } = useTheme();
  const showValidationOverlay = mobileEnv.validationMode === 'android-native-validate';

  // Declarative redirect target for the signup gate. Computed once per render
  // so we can replace the Stack with a Redirect while the gate is active —
  // keeps `app/index.tsx`'s own redirect from winning the race on first boot.
  const onboardingGateState = useOnboardingGateState();
  const hasRedirectedRef = useRef(false);
  const redirectTarget = computeRedirectTarget(onboardingGateState, hasRedirectedRef.current);
  // One-shot branches (dismissible prompt, initial onboarding) should only
  // fire once per session — otherwise dismissing them would just re-fire the
  // same redirect forever. Mandatory keeps firing so hardware back can't
  // escape it.
  if (redirectTarget && !redirectTarget.includes('mandatory=true')) {
    hasRedirectedRef.current = true;
  }

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
      {redirectTarget ? (
        <Redirect href={redirectTarget as never} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.bgDeep,
            },
          }}
        />
      )}
      <BadgeUnlockOverlayManager />
      <RankUpOverlayManager />
      <MiaLevelUpOverlayManager />
      <MiaInvitationPromptManager />
      <MiaDeepLinkHandler />
      <RouteShareDeepLinkHandler />
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
