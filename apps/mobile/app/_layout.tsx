import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
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
import { useReducedMotion } from '../src/design-system/hooks/useReducedMotion';
import { fontAssets } from '../src/design-system/fonts';
import { darkTheme } from '../src/design-system/tokens/colors';
import { tierColors } from '../src/design-system/tokens/badgeColors';
import { surfaceTints } from '../src/design-system/tokens/tints';
import { zIndex } from '../src/design-system/tokens/zIndex';
import { BadgeUnlockOverlayManager } from '../src/design-system/organisms/BadgeUnlockOverlay';
import { RankUpOverlay } from '../src/design-system/organisms/RankUpOverlay';
import { WeatherNoticeModal } from '../src/design-system/molecules/WeatherNoticeModal';
import { ErrorBoundary } from '../src/design-system/organisms/ErrorBoundary';
import { NavigationResumeGuard } from '../src/components/NavigationResumeGuard';
import {
  computeOnboardingGateTarget,
  useOnboardingGate,
} from '../src/hooks/useOnboardingGate';
import { extractRouteShareCode } from '../src/lib/shareDeepLinkParser';
import { useStoreHydrated } from '../src/hooks/useStoreHydrated';

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

const OnboardingGuard = () => {
  const state = useOnboardingGate();
  const incrementAnonymousOpenCount = useAppStore((s) => s.incrementAnonymousOpenCount);
  const hasIncrementedRef = useRef(false);
  // Tracks when the app last went to background so we can decide if a
  // foreground transition should count as a new session.
  const lastBackgroundAtRef = useRef<number | null>(null);
  // One-shot guard for the initial-onboarding and count-2 dismissible-prompt
  // redirects. The mandatory gate ignores this ref and fires on every render
  // so hardware-back / nav-away can't escape it. `app/index.tsx` also runs
  // the gate once when it mounts (covers cold start), but this effect is the
  // authority for mid-session transitions and for any route reached without
  // passing through index (deep links, state-driven navigation, etc.).
  const hasRedirectedRef = useRef(false);

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

  // Imperative enforcement of the gate. Previously this rendered a
  // declarative `<Redirect>` that REPLACED the `<Stack>` while active —
  // but `<Redirect>` is implemented with `useFocusEffect`, which only fires
  // for a focused screen inside a navigator. Rendering it in place of the
  // Stack meant it was never focused, so `router.replace` never ran and the
  // user silently stayed on whatever screen `app/index.tsx` had redirected
  // them to. Using `router.replace` directly from an effect sidesteps the
  // focus-context requirement entirely.
  useEffect(() => {
    const target = computeOnboardingGateTarget(state, hasRedirectedRef.current);
    if (!target) return;
    if (!target.includes('mandatory=true')) {
      hasRedirectedRef.current = true;
    }
    // Already on the target — nothing to do.
    if (state.pathname === target.split('?')[0]) return;
    router.replace(target as never);
    // `state` is a fresh object every render (plain return from the hook),
    // so including it in the dep array would cause an infinite effect loop.
    // The primitives listed capture every field this effect reads.
  }, [
    state.storeHydrated,
    state.isLoading,
    state.hasRealAccount,
    state.onboardingCompleted,
    state.anonymousOpenCount,
    state.pathname,
  ]);

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

const RootLayoutInner = () => {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
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
      {/*
       * Stack is always mounted so:
       * 1. `app/index.tsx` can render its own `<Redirect>` from within the
       *    navigator (that's the only place `<Redirect>` actually works —
       *    it's built on `useFocusEffect`, which requires a focused screen).
       * 2. `OnboardingGuard`'s imperative `router.replace` has a navigator
       *    to dispatch against when mid-session state changes trigger the
       *    gate. Swapping this for a root-level `<Redirect>` was the cause
       *    of GH issue #23 — the fresh-install onboarding redirect silently
       *    dropped because the `<Redirect>` was never focused.
       */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.bgDeep,
          },
          // Forward push slides right→left, back gesture/pop reverses it —
          // matches iOS HIG and gives Android the same spatial mental model.
          // Reduced motion falls back to fade.
          animation: reducedMotion ? 'fade' : 'slide_from_right',
          animationDuration: reducedMotion ? 150 : 280,
        }}
      />
      <BadgeUnlockOverlayManager />
      <RankUpOverlayManager />
      <WeatherNoticeManager />
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
      tierColor={promotion.tierColor ?? tierColors.gold.primary}
      perkDescription={promotion.tierPerk ?? ''}
      onDismiss={clearPromotion}
    />
  );
};

/** Re-shows the daily weather notification content after the user taps it. */
const WeatherNoticeManager = () => {
  const notice = useAppStore((s) => s.weatherNotice);
  const clearNotice = useAppStore((s) => s.clearWeatherNotice);
  const appState = useAppStore((s) => s.appState);
  const storeHydrated = useStoreHydrated();
  const authCtx = useAuthSessionOptional();

  // Defer the Modal until persist + auth have settled. Otherwise a cold-start
  // notification tap can mount this Modal over a still-loading `app/index.tsx`
  // before its `<Redirect>` fires — the user sees the dark backdrop with no
  // screen behind it and perceives the app as stuck at the loading screen.
  if (!storeHydrated || authCtx?.isLoading) return null;
  // Suppress over the live nav HUD (same safety rule as other overlays); the
  // notice stays queued and shows once the user leaves NAVIGATING.
  if (!notice || appState === 'NAVIGATING') return null;

  return <WeatherNoticeModal notice={notice} visible onDismiss={clearNotice} />;
};

function RootLayout() {
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

// Sentry.wrap captures unhandled promise rejections and React component
// breadcrumbs even before Sentry.init() is called. The wrap is a no-op
// when the SDK isn't initialised (e.g. user hasn't consented yet, or no
// DSN configured), so it's safe to always apply.
export default Sentry.wrap(RootLayout);

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
    backgroundColor: surfaceTints.glass,
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
    color: darkTheme.textSecondary,
    fontSize: 11,
  },
});
