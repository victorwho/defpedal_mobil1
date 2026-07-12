import type {
  CityHeartbeat,
  Coordinate,
  CyclingGoal,
  HazardVoteDirection,
  OfflineRegion,
  NavigationLocationSample,
  QuizCountryPreference,
  RecentDestination,
  ReviewPromptState,
  ReviewSentiment,
  RouteOption,
  RoutePreviewRequest,
  RoutePreviewResponse,
  RoutingMode,
  StreakState,
} from '@defensivepedal/core';
import {
  advanceNavigationStep,
  completeNavigationSession,
  createNavigationSession,
  DEFAULT_REVIEW_PROMPT_STATE,
  ensureInstalledAt,
  isPlausibleStep,
  resetNavigationSession,
  recordError as reviewRecordError,
  recordPromptShown as reviewRecordPromptShown,
  recordRated as reviewRecordRated,
  recordRerouteAttempt,
  recordSentiment as reviewRecordSentiment,
  recordSoftDismiss as reviewRecordSoftDismiss,
  setOptedOut as reviewSetOptedOut,
  setSessionPreAnnouncement,
  setSessionApproachAnnouncement,
  setSessionFollowMode,
  setSessionMute,
  syncSessionToRoute,
  type AppState,
  type NavigationSession,
  type NavigationProgressSnapshot,
  updateNavigationSessionProgress,
} from '@defensivepedal/core';
import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand';

import { getDeviceLocale, type Locale } from '../i18n';
import { zustandStorage } from '../lib/storage';
import {
  INITIAL_CELEBRATION_WANTS,
  resolveActiveCelebration,
} from './celebrationStage';
import { createQueueSlice, type QueueSlice } from './queueSlice';

const MAX_RECENT_DESTINATIONS = 3;
const MAX_RECENT_CITY_SUGGESTIONS = 5;

const DEFAULT_ROUTE_REQUEST: RoutePreviewRequest = {
  origin: {
    lat: 0,
    lon: 0,
  },
  destination: {
    lat: 0,
    lon: 0,
  },
  mode: 'safe',
  avoidUnpaved: false,
  avoidHills: false,
  locale: getDeviceLocale(),
  // Intentionally undefined so cold-start search isn't locked to a single
  // country before GPS resolves. `useResolvedCountry` writes the resolved
  // origin country (RO or ES) back onto this field once GPS lands; outside
  // a supported country it stays undefined so Mapbox autocomplete falls
  // back to proximity-only global search.
  countryHint: undefined,
};

export type WeatherNotice = {
  title: string;
  body: string;
  tone: 'good' | 'caution';
};

type AppStore = QueueSlice & {
  appState: AppState;
  voiceGuidanceEnabled: boolean;
  routeRequest: RoutePreviewRequest;
  routePreview: RoutePreviewResponse | null;
  selectedRouteId: string | null;
  navigationSession: NavigationSession | null;
  offlineRegions: OfflineRegion[];
  shareTripsPublicly: boolean;
  // Slice 8: sharer opt-in for route-share conversion activity-feed cards.
  // Default true. When false, a successful claim still awards XP + badges,
  // but no feed entry is published to the sharer's followers.
  shareConversionFeedOptin: boolean;
  bikeType: string | null;
  cyclingFrequency: string | null;
  weightKg: number;
  avoidUnpaved: boolean;
  avoidHills: boolean;
  showBicycleLanes: boolean;
  poiVisibility: {
    hydration: boolean;
    repair: boolean;
    restroom: boolean;
    bikeRental: boolean;
    bikeParking: boolean;
    supplies: boolean;
  };
  notifyWeather: boolean;
  notifyHazard: boolean;
  notifyCommunity: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  onboardingCompleted: boolean;
  // Global availability region gate (onboarding/region-check). Device-scoped
  // like analyticsConsent — the answer is about where this install physically
  // is, not which account is signed in, so it is NOT reset by
  // resetUserScopedState. `unchecked` = gate not yet run (new install);
  // `passed` = detected/picked country is supported (EU-27+EEA+CH);
  // `waitlisted` = unsupported country acknowledged (soft gate — the user may
  // still use the app with Mapbox fallback routing).
  regionGate: {
    status: 'unchecked' | 'passed' | 'waitlisted';
    countryCode: string | null;
  };
  setRegionGate: (gate: {
    status: 'passed' | 'waitlisted';
    countryCode: string | null;
  }) => void;
  // Analytics consent — captured during onboarding, surfaceable post-onboarding
  // via Profile → Privacy & Analytics. Device-scoped (not reset on signOut)
  // because the consent decision is about this install, not this account.
  // capturedAt = null means the user has not been asked yet (default: telemetry
  // off, no events fire). Once captured, both flags are independent.
  analyticsConsent: {
    sentry: boolean;
    posthog: boolean;
    capturedAt: string | null;
  };
  setAnalyticsConsent: (consent: { sentry: boolean; posthog: boolean }) => void;
  cyclingGoal: CyclingGoal | null;
  cachedStreak: StreakState | null;
  cachedImpact: {
    totalCo2Kg: number;
    totalMoneyEur: number;
    totalHazardsWarned: number;
  } | null;
  cachedCityHeartbeat: CityHeartbeat | null;
  locale: Locale;
  // True once the rider has explicitly picked a language in Profile. Until
  // then the app follows the device locale (auto-detected on first run +
  // healed via the persist migration). Prevents an explicit choice from being
  // overwritten by device-locale detection on a later boot.
  localeExplicitlySet: boolean;
  themePreference: 'system' | 'dark' | 'light';
  // Daily safety quiz country pool.
  //
  // 'auto' lets `useResolvedQuizCountry` pick via GPS → device-locale → default;
  // 'RO' / 'ES' pins the choice for expats and tourists. Device-scoped — NOT
  // reset by `resetUserScopedState` because this is a location-driven content
  // preference, not user-account state, and shouldn't get re-asked just
  // because the rider signed out and back in.
  quizCountryPreference: QuizCountryPreference;
  showMascot: boolean;
  ratingSkipCount: number;
  // ── Play Store review prompt (device-scoped) ──
  //
  // The Stage 1 sentiment card we render before triggering the native
  // Play Store ReviewManager. Eligibility rules live in `@defensivepedal/core`'s
  // `reviewEligibility.ts`; this slice only mirrors the persisted state and
  // the lifetime completed-ride counter used as one of the gates.
  //
  // Intentionally NOT reset by `resetUserScopedState`: Google's review quota
  // is per-Play-account on the device, not per-app-account, so a user signing
  // out and back in on the same handset should not reopen the prompt window.
  reviewPromptState: ReviewPromptState;
  completedRideCount: number;
  showHistoryOverlay: boolean;
  notificationPermissionAsked: boolean;
  anonymousOpenCount: number;
  earnedMilestones: readonly string[];
  recentDestinations: readonly RecentDestination[];
  addRecentDestination: (destination: RecentDestination) => void;
  recentCitySuggestions: readonly {
    coordinate: Coordinate;
    submittedAt: string;
    suggestionPreview: string;
  }[];
  addRecentCitySuggestion: (entry: {
    coordinate: Coordinate;
    submittedAt: string;
    suggestionPreview: string;
  }) => void;
  userHazardVotes: Record<string, HazardVoteDirection>;
  setUserHazardVote: (hazardId: string, direction: HazardVoteDirection) => void;
  clearUserHazardVote: (hazardId: string) => void;
  // ── Home Location (telemetry only — lat/lon approximation) ──
  homeLocation: { lat: number; lon: number } | null;
  setHomeLocation: (loc: { lat: number; lon: number }) => void;
  // ── Saved Places (Home / Work) — rich location with label for navigation ──
  savedPlaces: {
    home: import('@defensivepedal/core').AutocompleteSuggestion | null;
    work: import('@defensivepedal/core').AutocompleteSuggestion | null;
  };
  setSavedPlace: (type: 'home' | 'work', place: import('@defensivepedal/core').AutocompleteSuggestion | null) => void;
  pendingBadgeUnlocks: readonly import('@defensivepedal/core').BadgeUnlockEvent[];
  enqueueBadgeUnlocks: (badges: readonly import('@defensivepedal/core').BadgeUnlockEvent[]) => void;
  shiftBadgeUnlock: () => import('@defensivepedal/core').BadgeUnlockEvent | undefined;
  clearBadgeUnlocks: () => void;
  pendingTierPromotion: import('@defensivepedal/core').XpAwardResult | null;
  setTierPromotion: (promotion: import('@defensivepedal/core').XpAwardResult | null) => void;
  clearTierPromotion: () => void;
  // ── Celebration coordinator (review 2026-06-12) ──
  // The badge-unlock, rank-up, and meet-Pedal overlays used to be independent
  // siblings whose only shared gate was `appState !== 'NAVIGATING'`, so after
  // a first ride a new user could get ALL of them stacked at once. Each
  // overlay now registers whether it WANTS the stage; exactly one holds it at
  // a time, by priority (badge > rankup > meetpedal) and without preempting an
  // overlay that's already showing. Transient, not persisted.
  celebrationWants: Record<import('./celebrationStage').CelebrationKind, boolean>;
  activeCelebration: import('./celebrationStage').CelebrationKind | null;
  setCelebrationWant: (
    kind: import('./celebrationStage').CelebrationKind,
    wants: boolean,
  ) => void;
  // Transient: set when the user taps the daily weather notification, so the
  // app can re-show the same content in-app. Not persisted — derived from the
  // live tap (NotificationProvider re-reads the tap on cold start anyway).
  weatherNotice: WeatherNotice | null;
  setWeatherNotice: (notice: WeatherNotice | null) => void;
  clearWeatherNotice: () => void;
  // Session-scoped: true once the route-preview weather-warning modal has been
  // shown once. Gates the modal so it appears at most once per app session
  // instead of on every route calculation (route-preview remounts per calc,
  // which is why a screen-local dismissed flag re-showed it every time).
  // NOT persisted — resets on app restart so each fresh session warns once.
  weatherWarningSeenThisSession: boolean;
  markWeatherWarningSeen: () => void;
  setLocale: (locale: Locale) => void;
  setThemePreference: (pref: 'system' | 'dark' | 'light') => void;
  setQuizCountryPreference: (pref: QuizCountryPreference) => void;
  setShowMascot: (show: boolean) => void;
  incrementRatingSkipCount: () => void;
  // ── Review prompt actions ──
  seedReviewInstallAtIfMissing: () => void;
  markReviewPromptShown: () => void;
  setReviewSentiment: (sentiment: ReviewSentiment) => void;
  markReviewSoftDismiss: () => void;
  markReviewRated: () => void;
  markReviewError: () => void;
  setReviewOptOut: (optedOut: boolean) => void;
  setShowHistoryOverlay: (show: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  incrementAnonymousOpenCount: () => void;
  resetAnonymousOpenCount: () => void;
  setCyclingGoal: (goal: CyclingGoal | null) => void;
  setCachedCityHeartbeat: (heartbeat: CityHeartbeat) => void;
  setCachedStreak: (streak: StreakState | null) => void;
  setCachedImpact: (impact: {
    totalCo2Kg: number;
    totalMoneyEur: number;
    totalHazardsWarned: number;
  } | null) => void;
  setNotificationPermissionAsked: (asked: boolean) => void;
  addEarnedMilestone: (milestoneKey: string) => void;
  setNotifyWeather: (enabled: boolean) => void;
  setNotifyHazard: (enabled: boolean) => void;
  setNotifyCommunity: (enabled: boolean) => void;
  setQuietHours: (start: string, end: string) => void;
  // ── Pedal Nudge System (Phase 4) ──
  /** Pedal's witty/sassy voice. Default ON; toggle to neutral for the
   * functional first-variant copy. Mirrors profiles.pedal_voice_sassy. */
  pedalVoiceSassy: boolean;
  setPedalVoiceSassy: (enabled: boolean) => void;
  /** Streak-category opt-out for streak-at-risk / milestone / apology
   * nudges. Mirrors profiles.notify_streak. */
  notifyStreak: boolean;
  setNotifyStreak: (enabled: boolean) => void;
  /** Master switch for ALL Pedal nudges (audit 2026-07-05 UX-14). Mirrors
   * profiles.notify_pedal_nudges; false silences every trigger server-side. */
  notifyPedalNudges: boolean;
  setNotifyPedalNudges: (enabled: boolean) => void;
  /** One-time onboarding card explaining Pedal's voice. Persisted so the
   * card only ever appears once per device. */
  hasSeenMeetPedalCard: boolean;
  setHasSeenMeetPedalCard: (seen: boolean) => void;
  setShowBicycleLanes: (enabled: boolean) => void;
  showRouteFeatures: boolean;
  setShowRouteFeatures: (enabled: boolean) => void;
  setPoiVisibility: (category: string, enabled: boolean) => void;
  showRouteComparison: boolean;
  setShowRouteComparison: (enabled: boolean) => void;
  setShareTripsPublicly: (enabled: boolean) => void;
  setShareConversionFeedOptin: (enabled: boolean) => void;
  setBikeType: (type: string | null) => void;
  setCyclingFrequency: (frequency: string | null) => void;
  setWeightKg: (kg: number) => void;
  setAvoidUnpaved: (enabled: boolean) => void;
  setAvoidHills: (enabled: boolean) => void;
  setVoiceGuidanceEnabled: (enabled: boolean) => void;
  setRoutingMode: (mode: RoutingMode) => void;
  setRouteRequest: (request: Partial<RoutePreviewRequest>) => void;
  addWaypoint: (coordinate: Coordinate) => void;
  removeWaypoint: (index: number) => void;
  clearWaypoints: () => void;
  reorderWaypoints: (fromIndex: number, toIndex: number) => void;
  setRoutePreview: (
    response: RoutePreviewResponse | null,
    options?: {
      preferredRouteId?: string | null;
    },
  ) => void;
  setSelectedRouteId: (routeId: string | null) => void;
  startNavigation: (route: RouteOption, sessionId?: string) => void;
  advanceNavigation: (totalSteps: number) => void;
  updateNavigationProgress: (
    sample: NavigationLocationSample,
    snapshot: NavigationProgressSnapshot,
  ) => void;
  markPreAnnouncement: (stepId: string | null) => void;
  markApproachAnnouncement: (stepId: string | null) => void;
  recordNavigationReroute: (requestedAt?: string) => void;
  syncNavigationRoute: (routeId: string) => void;
  appendGpsBreadcrumb: (sample: NavigationLocationSample) => void;
  finishNavigation: () => void;
  setMuted: (isMuted: boolean) => void;
  setFollowing: (isFollowing: boolean) => void;
  setOfflineRegions: (regions: OfflineRegion[]) => void;
  upsertOfflineRegion: (region: OfflineRegion) => void;
  removeOfflineRegion: (regionId: string) => void;
  resetFlow: () => void;
  resetUserScopedState: () => void;
  // Slice 5a: transient flag set by handleLoadSavedRoute in route-planning
  // and read by useShareRoute when composing the POST /v1/route-shares
  // payload. When present, the share is created with source='saved' and the
  // saved_route id is propagated so the API can validate ownership and the
  // server can populate source_ref_id for analytics.
  //
  // NOT persisted — the flag is per-planning-session. setRouteRequest clears
  // it on any destination change so a subsequent manual search doesn't
  // accidentally inherit the saved-route lineage.
  lastLoadedSavedRouteId: string | null;
  setLastLoadedSavedRouteId: (id: string | null) => void;

  // ── Pending Share Claim (slice 2 route-share PRD) ──
  //
  // Captured by the deep-link handler when a /r/<code> URL opens the app,
  // drained by `ShareClaimProcessor` once auth-session is ready.
  //
  // `pendingShareClaim` is PERSISTED so a claim queued during anon
  // sign-in survives the redirect-to-onboarding dance that can kill the
  // in-memory value. `pendingShareClaimAttempts` is NOT persisted —
  // retries reset on cold start.
  pendingShareClaim: string | null;
  pendingShareClaimAttempts: number;
  setPendingShareClaim: (code: string) => void;
  clearPendingShareClaim: () => void;
  incrementClaimAttempts: () => void;

  // ── Deferred Deep Link Fallbacks (slice 2 route-share PRD) ──
  //
  // One-shot guard so the Android install-referrer + iOS clipboard
  // fallbacks only run once per INSTALL lifetime. PERSISTED (review
  // 2026-06-12 P1): the Play Install Referrer API returns the same referrer
  // for ~90 days, so a non-persisted flag re-fired the fallback on every
  // cold start and re-hijacked the user into the claimed route. The referrer
  // is a one-time post-install attribution signal — once checked, never
  // again.
  hasCheckedInstallReferrer: boolean;
  markInstallReferrerChecked: () => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      appState: 'IDLE',
      voiceGuidanceEnabled: false,
      routeRequest: DEFAULT_ROUTE_REQUEST,
      routePreview: null,
      selectedRouteId: null,
      navigationSession: null,
      offlineRegions: [],
      showRouteComparison: true,
      ...createQueueSlice(set, get),
      shareTripsPublicly: true,
      shareConversionFeedOptin: true,
      bikeType: null,
      cyclingFrequency: null,
      weightKg: 70,
      avoidUnpaved: false,
      avoidHills: false,
      notifyWeather: true,
      notifyHazard: true,
      notifyCommunity: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      // Pedal Nudge System defaults
      pedalVoiceSassy: true,
      notifyStreak: true,
      hasSeenMeetPedalCard: false,
      onboardingCompleted: false,
      regionGate: { status: 'unchecked', countryCode: null },
      // P0.1 (2026-05-25) split crash reporting from product analytics.
      // - sentry: defaults TRUE. Legal basis = legitimate interest (GDPR
      //   Art 6(1)(f) / ANSPDCP Law 506/2004 equivalent for service-stability
      //   diagnostics). User can object via Profile > Privacy & Analytics —
      //   the toggle still exists, just defaults on.
      // - posthog: defaults FALSE. Legal basis = consent (Art 6(1)(a)) since
      //   product analytics is non-essential under ePrivacy. Requires affirmative
      //   opt-in.
      // - capturedAt: null until the user is shown the consent screen. Existing
      //   persisted users with capturedAt !== null keep their saved choice (no
      //   silent flip — Zustand persist merges the previous state on hydration).
      // Decision recorded: docs/legal/consent-split-2026-05-25.md
      analyticsConsent: { sentry: true, posthog: false, capturedAt: null },
      cyclingGoal: null,
      cachedStreak: null,
      cachedImpact: null,
      cachedCityHeartbeat: null,
      // Fresh installs follow the device language; overridden by persisted
      // value on hydration, and by an explicit pick via `setLocale`.
      locale: getDeviceLocale(),
      localeExplicitlySet: false,
      themePreference: 'dark',
      quizCountryPreference: 'auto',
      showMascot: true,
      ratingSkipCount: 0,
      reviewPromptState: DEFAULT_REVIEW_PROMPT_STATE,
      completedRideCount: 0,
      showHistoryOverlay: false,
      notificationPermissionAsked: false,
      anonymousOpenCount: 0,
      earnedMilestones: [],
      recentDestinations: [],
      recentCitySuggestions: [],
      addRecentCitySuggestion: (entry) =>
        set((state) => {
          const filtered = (state.recentCitySuggestions ?? []).filter(
            (e) =>
              e.coordinate.lat !== entry.coordinate.lat ||
              e.coordinate.lon !== entry.coordinate.lon,
          );
          return {
            recentCitySuggestions: [entry, ...filtered].slice(0, MAX_RECENT_CITY_SUGGESTIONS),
          };
        }),
      userHazardVotes: {},
      setUserHazardVote: (hazardId, direction) =>
        set((state) => ({
          userHazardVotes: { ...state.userHazardVotes, [hazardId]: direction },
        })),
      // Rest-destructure clone — never `delete` (mutates original).
      clearUserHazardVote: (hazardId) =>
        set((state) => {
          const { [hazardId]: _discarded, ...rest } = state.userHazardVotes;
          return { userHazardVotes: rest };
        }),
      // ── Pending Share Claim (slice 2) ──
      pendingShareClaim: null,
      pendingShareClaimAttempts: 0,
      setPendingShareClaim: (code) =>
        set(() => ({
          pendingShareClaim: code,
          // Reset attempts whenever a new code lands so prior-code failures
          // don't carry over to a fresh claim.
          pendingShareClaimAttempts: 0,
        })),
      clearPendingShareClaim: () =>
        set(() => ({
          pendingShareClaim: null,
          pendingShareClaimAttempts: 0,
        })),
      incrementClaimAttempts: () =>
        set((state) => ({
          pendingShareClaimAttempts: state.pendingShareClaimAttempts + 1,
        })),

      // ── Deferred Deep Link Fallbacks one-shot guard (slice 2) ──
      hasCheckedInstallReferrer: false,
      markInstallReferrerChecked: () =>
        set(() => ({ hasCheckedInstallReferrer: true })),

      // ── Home Location ──
      homeLocation: null,
      setHomeLocation: (loc: { lat: number; lon: number }) =>
        set(() => ({ homeLocation: loc })),
      // ── Saved Places ──
      savedPlaces: { home: null, work: null },
      setSavedPlace: (type, place) =>
        set((state) => ({ savedPlaces: { ...state.savedPlaces, [type]: place } })),
      addRecentDestination: (destination) =>
        set((state) => {
          // Remove existing entry with same coordinates (de-duplicate)
          const filtered = state.recentDestinations.filter(
            (d) =>
              d.coordinates.lat !== destination.coordinates.lat ||
              d.coordinates.lon !== destination.coordinates.lon,
          );
          // Add new destination at front, limit to MAX_RECENT_DESTINATIONS
          return {
            recentDestinations: [destination, ...filtered].slice(0, MAX_RECENT_DESTINATIONS),
          };
        }),
      pendingBadgeUnlocks: [],
      enqueueBadgeUnlocks: (badges) =>
        set((state) => ({
          pendingBadgeUnlocks: [...state.pendingBadgeUnlocks, ...badges],
        })),
      shiftBadgeUnlock: () => {
        const current = get().pendingBadgeUnlocks;
        if (current.length === 0) return undefined;
        const [first, ...rest] = current;
        set(() => ({ pendingBadgeUnlocks: rest }));
        return first;
      },
      clearBadgeUnlocks: () => set(() => ({ pendingBadgeUnlocks: [] })),
      pendingTierPromotion: null,
      setTierPromotion: (promotion) => set(() => ({ pendingTierPromotion: promotion })),
      clearTierPromotion: () => set(() => ({ pendingTierPromotion: null })),
      celebrationWants: { ...INITIAL_CELEBRATION_WANTS },
      activeCelebration: null,
      setCelebrationWant: (kind, wants) =>
        set((state) => {
          if (state.celebrationWants[kind] === wants) return state;
          const nextWants = { ...state.celebrationWants, [kind]: wants };
          return {
            celebrationWants: nextWants,
            activeCelebration: resolveActiveCelebration(
              state.activeCelebration,
              nextWants,
            ),
          };
        }),
      weatherNotice: null,
      setWeatherNotice: (notice) => set(() => ({ weatherNotice: notice })),
      clearWeatherNotice: () => set(() => ({ weatherNotice: null })),
      weatherWarningSeenThisSession: false,
      markWeatherWarningSeen: () =>
        set((state) =>
          state.weatherWarningSeenThisSession
            ? state
            : { weatherWarningSeenThisSession: true },
        ),
      setLocale: (locale) =>
        set((state) => ({
          locale,
          // An explicit pick locks out device-locale auto-detection on future
          // boots (see `localeExplicitlySet`).
          localeExplicitlySet: true,
          // Mirror the UI locale into routeRequest so Mapbox autocomplete +
          // turn-by-turn instructions follow the rider's language choice.
          routeRequest: { ...state.routeRequest, locale },
        })),
      setThemePreference: (pref) => set(() => ({ themePreference: pref })),
      setQuizCountryPreference: (pref) =>
        set(() => ({ quizCountryPreference: pref })),
      setShowMascot: (show) => set(() => ({ showMascot: show })),
      incrementRatingSkipCount: () =>
        set((state) => ({ ratingSkipCount: state.ratingSkipCount + 1 })),
      // ── Review prompt actions ──
      seedReviewInstallAtIfMissing: () =>
        set((state) => ({
          reviewPromptState: ensureInstalledAt(
            state.reviewPromptState,
            new Date().toISOString(),
          ),
        })),
      markReviewPromptShown: () =>
        set((state) => ({
          reviewPromptState: reviewRecordPromptShown(
            state.reviewPromptState,
            new Date().toISOString(),
          ),
        })),
      setReviewSentiment: (sentiment) =>
        set((state) => ({
          reviewPromptState: reviewRecordSentiment(state.reviewPromptState, sentiment),
        })),
      markReviewSoftDismiss: () =>
        set((state) => ({
          reviewPromptState: reviewRecordSoftDismiss(state.reviewPromptState),
        })),
      markReviewRated: () =>
        set((state) => ({
          reviewPromptState: reviewRecordRated(state.reviewPromptState),
        })),
      markReviewError: () =>
        set((state) => ({
          reviewPromptState: reviewRecordError(
            state.reviewPromptState,
            new Date().toISOString(),
          ),
        })),
      setReviewOptOut: (optedOut) =>
        set((state) => ({
          reviewPromptState: reviewSetOptedOut(state.reviewPromptState, optedOut),
        })),
      setShowHistoryOverlay: (show) => set(() => ({ showHistoryOverlay: show })),
      setOnboardingCompleted: (completed) =>
        set(() => ({ onboardingCompleted: completed })),
      setRegionGate: (gate) =>
        set(() => ({
          regionGate: { status: gate.status, countryCode: gate.countryCode },
        })),
      setAnalyticsConsent: (consent) =>
        set(() => ({
          analyticsConsent: {
            sentry: consent.sentry,
            posthog: consent.posthog,
            capturedAt: new Date().toISOString(),
          },
        })),
      incrementAnonymousOpenCount: () =>
        set((state) => ({ anonymousOpenCount: state.anonymousOpenCount + 1 })),
      resetAnonymousOpenCount: () =>
        set(() => ({ anonymousOpenCount: 0 })),
      setCyclingGoal: (goal) =>
        set(() => ({ cyclingGoal: goal })),
      setCachedCityHeartbeat: (heartbeat) =>
        set(() => ({ cachedCityHeartbeat: heartbeat })),
      setCachedStreak: (streak) =>
        set(() => ({ cachedStreak: streak })),
      setCachedImpact: (impact) =>
        set(() => ({ cachedImpact: impact })),
      setNotificationPermissionAsked: (asked) =>
        set(() => ({ notificationPermissionAsked: asked })),
      addEarnedMilestone: (milestoneKey) =>
        set((state) => ({
          earnedMilestones: state.earnedMilestones.includes(milestoneKey)
            ? state.earnedMilestones
            : [...state.earnedMilestones, milestoneKey],
        })),
      setNotifyWeather: (enabled) =>
        set(() => ({ notifyWeather: enabled })),
      setNotifyHazard: (enabled) =>
        set(() => ({ notifyHazard: enabled })),
      setNotifyCommunity: (enabled) =>
        set(() => ({ notifyCommunity: enabled })),
      setQuietHours: (start, end) =>
        set(() => ({ quietHoursStart: start, quietHoursEnd: end })),
      setPedalVoiceSassy: (enabled) => set(() => ({ pedalVoiceSassy: enabled })),
      setNotifyStreak: (enabled) => set(() => ({ notifyStreak: enabled })),
      notifyPedalNudges: true,
      setNotifyPedalNudges: (enabled) => set(() => ({ notifyPedalNudges: enabled })),
      setHasSeenMeetPedalCard: (seen) => set(() => ({ hasSeenMeetPedalCard: seen })),
      showBicycleLanes: true,
      poiVisibility: {
        hydration: false,
        repair: false,
        restroom: false,
        bikeRental: false,
        bikeParking: false,
        supplies: false,
      },
      setShowBicycleLanes: (enabled) =>
        set(() => ({ showBicycleLanes: enabled })),
      showRouteFeatures: true,
      setShowRouteFeatures: (enabled) =>
        set(() => ({ showRouteFeatures: enabled })),
      setPoiVisibility: (category, enabled) =>
        set((state) => ({
          poiVisibility: { ...state.poiVisibility, [category]: enabled },
        })),
      setShowRouteComparison: (enabled) =>
        set(() => ({ showRouteComparison: enabled })),
      setShareTripsPublicly: (enabled) =>
        set(() => ({ shareTripsPublicly: enabled })),

      setShareConversionFeedOptin: (enabled) =>
        set(() => ({ shareConversionFeedOptin: enabled })),
      setBikeType: (type) => {
        const pavedPreferred = type === 'Road bike' || type === 'City bike' || type === 'Recumbent';
        const unpavedPreferred = type === 'Mountain bike';
        set((state) => ({
          bikeType: type,
          avoidUnpaved: pavedPreferred ? true : unpavedPreferred ? false : state.avoidUnpaved,
        }));
      },
      setCyclingFrequency: (frequency) =>
        set(() => ({ cyclingFrequency: frequency })),
      setWeightKg: (kg) =>
        set(() => ({ weightKg: Math.round(Math.max(30, Math.min(300, kg))) })),
      setAvoidUnpaved: (enabled) =>
        set(() => ({ avoidUnpaved: enabled })),
      setAvoidHills: (enabled) =>
        set(() => ({ avoidHills: enabled })),
      setVoiceGuidanceEnabled: (enabled) =>
        set((state) => ({
          voiceGuidanceEnabled: enabled,
          navigationSession: state.navigationSession
            ? setSessionMute(state.navigationSession, !enabled)
            : state.navigationSession,
        })),
      setRoutingMode: (mode) =>
        set((state) => ({
          routeRequest: {
            ...state.routeRequest,
            mode,
          },
        })),
      lastLoadedSavedRouteId: null,
      setLastLoadedSavedRouteId: (id) =>
        set(() => ({ lastLoadedSavedRouteId: id })),
      setRouteRequest: (request) =>
        set((state) => ({
          // Sync top-level preference flags when present in the request
          ...(request.avoidHills !== undefined ? { avoidHills: request.avoidHills } : {}),
          ...(request.avoidUnpaved !== undefined ? { avoidUnpaved: request.avoidUnpaved } : {}),
          routeRequest: {
            ...state.routeRequest,
            ...request,
          },
          // Any origin/destination/mode change breaks the saved-route lineage
          // — the resulting preview no longer corresponds to the saved_route
          // whose id was stashed. Explicit null keeps the share emit path
          // accurate. Callers that want to preserve the lineage (e.g.
          // handleLoadSavedRoute itself) call setLastLoadedSavedRouteId
          // AFTER setRouteRequest.
          lastLoadedSavedRouteId:
            request.origin !== undefined ||
            request.destination !== undefined ||
            request.mode !== undefined ||
            request.waypoints !== undefined
              ? null
              : state.lastLoadedSavedRouteId,
        })),
      addWaypoint: (coordinate) =>
        set((state) => ({
          routeRequest: {
            ...state.routeRequest,
            waypoints: [...(state.routeRequest.waypoints ?? []), coordinate],
          },
        })),
      removeWaypoint: (index) =>
        set((state) => ({
          routeRequest: {
            ...state.routeRequest,
            waypoints: (state.routeRequest.waypoints ?? []).filter((_, i) => i !== index),
          },
        })),
      clearWaypoints: () =>
        set((state) => ({
          routeRequest: {
            ...state.routeRequest,
            waypoints: [],
          },
        })),
      reorderWaypoints: (fromIndex, toIndex) =>
        set((state) => {
          const current = state.routeRequest.waypoints ?? [];
          if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) {
            return state;
          }
          const moved = current[fromIndex];
          const without = [...current.slice(0, fromIndex), ...current.slice(fromIndex + 1)];
          const reordered = [...without.slice(0, toIndex), moved, ...without.slice(toIndex)];
          return {
            routeRequest: {
              ...state.routeRequest,
              waypoints: reordered,
            },
          };
        }),
      setRoutePreview: (response, options) =>
        set((state) => {
          if (!response) {
            return {
              routePreview: null,
              selectedRouteId: null,
              appState: 'IDLE' as AppState,
            };
          }

          const preferredRouteId = options?.preferredRouteId ?? state.selectedRouteId;
          const hasPreferredRoute =
            preferredRouteId !== null &&
            response.routes.some((route) => route.id === preferredRouteId);
          const nextSelectedRouteId = hasPreferredRoute
            ? preferredRouteId
            : response.routes[0]?.id ?? null;

          // Preserve NAVIGATING state during reroute — don't drop back to ROUTE_PREVIEW
          const isNavigating = state.appState === 'NAVIGATING';
          return {
            routePreview: response,
            selectedRouteId: nextSelectedRouteId,
            appState: isNavigating
              ? ('NAVIGATING' as AppState)
              : response.routes.length > 0
                ? ('ROUTE_PREVIEW' as AppState)
                : ('IDLE' as AppState),
          };
        }),
      setSelectedRouteId: (routeId) =>
        set(() => ({
          selectedRouteId: routeId,
        })),
      startNavigation: (route, sessionId) =>
        set((state) => {
          // Re-entry guard: a double-tap on "Start Navigation" (or any caller
          // racing the state transition) would otherwise blow away the live
          // session — including its accumulated GPS breadcrumbs and step
          // index — and force a fresh sessionId. If the caller is starting
          // navigation for the same route that's already active, no-op.
          // Switching to a different route mid-navigation falls through and
          // creates the new session as before.
          if (
            state.appState === 'NAVIGATING' &&
            state.navigationSession?.routeId === route.id
          ) {
            return state;
          }
          return {
            navigationSession: setSessionMute(
              createNavigationSession(route.id, new Date().toISOString(), sessionId),
              !state.voiceGuidanceEnabled,
            ),
            selectedRouteId: route.id,
            appState: 'NAVIGATING',
          };
        }),
      advanceNavigation: (totalSteps) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? advanceNavigationStep(state.navigationSession, totalSteps)
            : state.navigationSession,
        })),
      updateNavigationProgress: (sample, snapshot) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? updateNavigationSessionProgress(state.navigationSession, sample, snapshot)
            : state.navigationSession,
        })),
      markPreAnnouncement: (stepId) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? setSessionPreAnnouncement(state.navigationSession, stepId)
            : state.navigationSession,
        })),
      markApproachAnnouncement: (stepId) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? setSessionApproachAnnouncement(state.navigationSession, stepId)
            : state.navigationSession,
        })),
      recordNavigationReroute: (requestedAt) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? recordRerouteAttempt(state.navigationSession, requestedAt)
            : state.navigationSession,
        })),
      syncNavigationRoute: (routeId) =>
        set((state) => ({
          selectedRouteId: routeId,
          navigationSession: state.navigationSession
            ? syncSessionToRoute(state.navigationSession, routeId)
            : state.navigationSession,
        })),
      appendGpsBreadcrumb: (sample) =>
        set((state) => {
          if (!state.navigationSession) return state;
          const session = state.navigationSession;
          const crumbs = session.gpsBreadcrumbs;
          const newCrumb = {
            lat: sample.coordinate.lat,
            lon: sample.coordinate.lon,
            ts: sample.timestamp,
            acc: sample.accuracyMeters ?? null,
            spd: sample.speedMetersPerSecond ?? null,
            hdg: sample.heading ?? null,
          };
          // Reject stale/cached GPS fixes before they corrupt the trail distance.
          // The foreground location hook hydrates the *previous* ride's last-known
          // location (possibly a different city) into the sample stream; Android's
          // fused provider can also re-surface that cached fix after a signal gap.
          // Either one would add a phantom inter-city "teleport" segment.
          const startedAtMs = Date.parse(session.startedAt);
          if (Number.isFinite(startedAtMs) && newCrumb.ts < startedAtMs) {
            return state; // captured before this ride began → stale
          }
          const lastCrumb = crumbs[crumbs.length - 1];
          if (lastCrumb && !isPlausibleStep(lastCrumb, newCrumb)) {
            return state; // implausible jump → cached/outlier fix
          }
          // Ring-buffer: drop oldest when at capacity so long rides keep recording
          const MAX_BREADCRUMBS = 2000;
          const updatedCrumbs =
            crumbs.length >= MAX_BREADCRUMBS
              ? [...crumbs.slice(1), newCrumb]
              : [...crumbs, newCrumb];
          return {
            navigationSession: {
              ...session,
              gpsBreadcrumbs: updatedCrumbs,
            },
          };
        }),
      finishNavigation: () =>
        set((state) => {
          const session = state.navigationSession;
          if (!session) return state;
          // Happy path: navigating → awaiting_feedback, advance appState.
          if (session.state === 'navigating') {
            return {
              navigationSession: completeNavigationSession(session),
              appState: 'AWAITING_FEEDBACK',
              // Bump the device-level completed-ride counter exactly on the
              // real transition (not on the idempotent reconciliation branch
              // below). Read by the review-prompt eligibility gate.
              completedRideCount: state.completedRideCount + 1,
            };
          }
          // Idempotent reconciliation: if the session is already terminal but
          // appState drifted (e.g. partial rehydration, external mutation),
          // realign appState so route guards see a coherent state. No-op for
          // 'idle' / 'preview' — those legitimately aren't finishable.
          if (session.state === 'awaiting_feedback' && state.appState !== 'AWAITING_FEEDBACK') {
            return { appState: 'AWAITING_FEEDBACK' };
          }
          return state;
        }),
      setMuted: (isMuted) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? setSessionMute(state.navigationSession, isMuted)
            : state.navigationSession,
        })),
      setFollowing: (isFollowing) =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? setSessionFollowMode(state.navigationSession, isFollowing)
            : state.navigationSession,
        })),
      setOfflineRegions: (regions) =>
        set(() => ({
          offlineRegions: regions,
        })),
      upsertOfflineRegion: (region) =>
        set((state) => ({
          offlineRegions: state.offlineRegions.some((current) => current.id === region.id)
            ? state.offlineRegions.map((current) =>
                current.id === region.id ? region : current,
              )
            : [...state.offlineRegions, region],
        })),
      removeOfflineRegion: (regionId) =>
        set((state) => ({
          offlineRegions: state.offlineRegions.filter((region) => region.id !== regionId),
        })),
      resetFlow: () =>
        set((state) => {
          // Prune tripServerIds: keep only entries for mutations still in the queue
          const activeClientIds = new Set(
            state.queuedMutations
              .filter((m) => m.status !== 'dead')
              .map((m) => {
                const payload = m.payload as Record<string, unknown>;
                return (payload.clientTripId as string) ?? '';
              })
              .filter(Boolean),
          );
          const prunedIds: Record<string, string> = {};
          for (const [clientId, serverId] of Object.entries(state.tripServerIds)) {
            if (activeClientIds.has(clientId)) {
              prunedIds[clientId] = serverId;
            }
          }
          return {
            appState: 'IDLE',
            routePreview: null,
            selectedRouteId: null,
            navigationSession: resetNavigationSession(),
            routeRequest: DEFAULT_ROUTE_REQUEST,
            activeTripClientId: null,
            tripServerIds: prunedIds,
          };
        }),
      // Resets every user-scoped field to the initial default while preserving
      // device-level preferences (theme, locale, voice guidance, offline map
      // packs, POI visibility, bike/routing defaults). Invoked on sign-out and
      // on user-id change so the Trophy Case, tier card, Mia journey tracker
      // etc. don't keep the previous account's values in the persisted slice.
      //
      // Companion to TanStack Query's cache.clear() — the persist layer here
      // holds the *cached projections* of server state (cachedImpact,
      // cachedStreak, earnedMilestones, pendingBadgeUnlocks) that need to reset
      // in lockstep with the React-Query cache. Device preferences are kept
      // intentionally so the next sign-in doesn't re-surface onboarding
      // questions like dark-mode and language.
      //
      // `onboardingCompleted` is intentionally NOT reset here. Onboarding is a
      // one-time introduction to the app, scoped to the device — not the user.
      // A real-user sign-out (or anonymous-user re-roll) on the same device
      // should drop you back into the app, not force you back through the
      // 5-screen onboarding flow you already completed. The signup-prompt
      // gate (see computeOnboardingGateTarget) still surfaces the
      // sign-up CTA on subsequent anonymous opens.
      resetUserScopedState: () =>
        set(() => ({
          appState: 'IDLE',
          routePreview: null,
          selectedRouteId: null,
          navigationSession: resetNavigationSession(),
          routeRequest: DEFAULT_ROUTE_REQUEST,
          queuedMutations: [],
          tripServerIds: {},
          activeTripClientId: null,
          // onboardingCompleted intentionally NOT reset — see comment above.
          cyclingGoal: null,
          cachedStreak: null,
          cachedImpact: null,
          ratingSkipCount: 0,
          notificationPermissionAsked: false,
          anonymousOpenCount: 0,
          earnedMilestones: [],
          recentDestinations: [],
          recentCitySuggestions: [],
          userHazardVotes: {},
          pendingBadgeUnlocks: [],
          pendingTierPromotion: null,
          weatherNotice: null,
          homeLocation: null,
          // Audit 2026-07-05 STATE-3: Home/Work full addresses are the most
          // sensitive locations we hold — they must never survive a sign-out /
          // account switch and greet the next account on this device.
          savedPlaces: { home: null, work: null },
          cachedCityHeartbeat: null,
          pendingShareClaim: null,
          pendingShareClaimAttempts: 0,
        })),
    }),
    {
      name: 'defensivepedal-app-store',
      storage: createJSONStorage(() => zustandStorage),
      // P0.1 consent split migration (2026-05-25). Bumps the persisted state
      // version from undefined (effectively v0) to 1 and:
      //   - For users who never made a consent choice (`capturedAt === null`
      //     AND `sentry === false`), flip `sentry` to `true` so the new
      //     legitimate-interest default applies. They never opted out of
      //     anything — the old `false` value was a bundled default they
      //     never saw.
      //   - For users who explicitly chose (`capturedAt !== null`), respect
      //     their saved choice. We never silently flip an explicit decision.
      // Decision recorded: docs/legal/consent-split-2026-05-25.md
      version: 5,
      migrate: (persistedState, version) => {
        let next = persistedState as Record<string, unknown> | undefined;

        // v0 → v1: analytics consent default flip.
        if (version < 1) {
          const state = next as
            | { analyticsConsent?: { sentry?: boolean; posthog?: boolean; capturedAt?: string | null } }
            | undefined;
          const consent = state?.analyticsConsent;
          if (
            consent &&
            (consent.capturedAt ?? null) === null &&
            consent.sentry === false
          ) {
            next = {
              ...(state as object),
              analyticsConsent: { ...consent, sentry: true },
            };
          }
        }

        // v1 → v2: routing-mode default reset. Existing installs had
        // `routeRequest.mode` persisted as whatever the rider last picked
        // (often 'fast'); we now want every cold start to land on 'safe'.
        if (version < 2) {
          const state = next as
            | { routeRequest?: { mode?: string } & Record<string, unknown> }
            | undefined;
          if (state?.routeRequest) {
            next = {
              ...(state as object),
              routeRequest: { ...state.routeRequest, mode: 'safe' },
            };
          }
        }

        // v2 → v3: device-locale auto-detection. Older installs defaulted to
        // 'en' and only changed on an explicit Profile pick, so a rider on a
        // Romanian/Spanish phone saw English until they changed it by hand. A
        // *non-English* persisted locale could only have come from an explicit
        // pick (default was 'en', nothing else wrote it), so we respect it and
        // mark `localeExplicitlySet`. For the untouched 'en' default we adopt
        // the device locale once. Also reconciles `routeRequest.locale` (it
        // mirrors `locale` but the mirror only ran on `setLocale`, so it could
        // have drifted) — this heals the turn-by-turn instruction language.
        if (version < 3) {
          const state = next as
            | {
                locale?: string;
                routeRequest?: Record<string, unknown>;
              }
            | undefined;
          const persistedLocale = state?.locale;
          const explicit = !!persistedLocale && persistedLocale !== 'en';
          const resolved: Locale = explicit
            ? (persistedLocale as Locale)
            : getDeviceLocale();
          next = {
            ...(state as object),
            locale: resolved,
            localeExplicitlySet: explicit,
            routeRequest: { ...(state?.routeRequest ?? {}), locale: resolved },
          };
        }

        // v3 → v4: re-apply the 'safe' routing default. The v1 → v2 reset above
        // was silently undone for most installs by a bug in route-planning.tsx
        // that force-set `mode: 'fast'` on the empty planning screen (before a
        // destination was picked, `routeSupported` is false), so the persisted
        // value drifted back to 'fast'. That screen bug is now fixed (the
        // force-fast gates on a destination being set). This heals the already-
        // corrupted persisted value so every rider lands on 'safe' as intended.
        // 'flat' riders (mode 'safe' + avoidHills) are untouched; only 'fast'
        // is reset. Riders who want Fast re-select it once and it now sticks.
        if (version < 4) {
          const state = next as
            | { routeRequest?: { mode?: string } & Record<string, unknown> }
            | undefined;
          if (state?.routeRequest) {
            next = {
              ...(state as object),
              routeRequest: { ...state.routeRequest, mode: 'safe' },
            };
          }
        }

        // v4 → v5: add weightKg with the 70 kg default for existing installs.
        if (version < 5) {
          const state = next as { weightKg?: number } | undefined;
          if (state && (state.weightKg === undefined || state.weightKg === null)) {
            next = { ...(state as object), weightKg: 70 };
          }
        }

        return next;
      },
      partialize: (state) => ({
        appState: state.appState,
        voiceGuidanceEnabled: state.voiceGuidanceEnabled,
        // Persist routeRequest, but force `mode` back to 'safe' so cold-start
        // always boots into the Safe pill. The rider's Profile preference for
        // avoidHills/avoidUnpaved is preserved separately, so someone who
        // prefers Flat (Safe + avoidHills) still gets Flat highlighted.
        routeRequest: { ...state.routeRequest, mode: 'safe' as const },
        routePreview: state.routePreview,
        selectedRouteId: state.selectedRouteId,
        navigationSession: state.navigationSession,
        queuedMutations: state.queuedMutations,
        offlineRegions: state.offlineRegions,
        tripServerIds: state.tripServerIds,
        activeTripClientId: state.activeTripClientId,
        showRouteComparison: state.showRouteComparison,
        shareTripsPublicly: state.shareTripsPublicly,
        shareConversionFeedOptin: state.shareConversionFeedOptin,
        showBicycleLanes: state.showBicycleLanes,
        showRouteFeatures: state.showRouteFeatures,
        poiVisibility: state.poiVisibility,
        notifyWeather: state.notifyWeather,
        notifyHazard: state.notifyHazard,
        notifyCommunity: state.notifyCommunity,
        quietHoursStart: state.quietHoursStart,
        quietHoursEnd: state.quietHoursEnd,
        pedalVoiceSassy: state.pedalVoiceSassy,
        notifyStreak: state.notifyStreak,
        notifyPedalNudges: state.notifyPedalNudges,
        hasSeenMeetPedalCard: state.hasSeenMeetPedalCard,
        bikeType: state.bikeType,
        cyclingFrequency: state.cyclingFrequency,
        weightKg: state.weightKg,
        avoidUnpaved: state.avoidUnpaved,
        avoidHills: state.avoidHills,
        onboardingCompleted: state.onboardingCompleted,
        regionGate: state.regionGate,
        analyticsConsent: state.analyticsConsent,
        cyclingGoal: state.cyclingGoal,
        cachedStreak: state.cachedStreak,
        cachedImpact: state.cachedImpact,
        cachedCityHeartbeat: state.cachedCityHeartbeat,
        notificationPermissionAsked: state.notificationPermissionAsked,
        ratingSkipCount: state.ratingSkipCount,
        reviewPromptState: state.reviewPromptState,
        completedRideCount: state.completedRideCount,
        // showHistoryOverlay excluded — UI-only state that resets on app restart
        themePreference: state.themePreference,
        quizCountryPreference: state.quizCountryPreference,
        showMascot: state.showMascot,
        anonymousOpenCount: state.anonymousOpenCount,
        earnedMilestones: state.earnedMilestones,
        recentDestinations: state.recentDestinations,
        recentCitySuggestions: state.recentCitySuggestions,
        userHazardVotes: state.userHazardVotes,
        pendingBadgeUnlocks: state.pendingBadgeUnlocks,
        pendingTierPromotion: state.pendingTierPromotion,
        locale: state.locale,
        localeExplicitlySet: state.localeExplicitlySet,
        homeLocation: state.homeLocation,
        savedPlaces: state.savedPlaces,
        // pendingShareClaim persisted — survives redirect-to-onboarding
        // that can drop in-memory state before auth finishes. Attempts
        // are intentionally NOT persisted (reset on cold start).
        pendingShareClaim: state.pendingShareClaim,
        // hasCheckedInstallReferrer PERSISTED (review 2026-06-12 P1): the
        // Play Install Referrer API returns the SAME referrer for ~90 days
        // after install, so a non-persisted flag re-ran the deferred-deep-link
        // fallbacks on every cold start — re-queuing the same share code and
        // re-hijacking the user into the claimed route preview with a success
        // toast on every app open. The install-referrer / clipboard fallbacks
        // are a once-per-install attribution signal, so the guard belongs in
        // persisted state (device-scoped: NOT reset on account switch).
        hasCheckedInstallReferrer: state.hasCheckedInstallReferrer,
      }),
    },
  ),
);
