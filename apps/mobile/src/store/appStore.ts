import type {
  Coordinate,
  CyclingGoal,
  HazardVoteDirection,
  MiaDetectionSource,
  MiaJourneyLevel,
  MiaJourneyStatus,
  MiaLevelUpEvent,
  MiaPersona,
  OfflineRegion,
  NavigationLocationSample,
  RecentDestination,
  RouteOption,
  RoutePreviewRequest,
  RoutePreviewResponse,
  RoutingMode,
  StreakState,
  TelemetryEvent,
} from '@defensivepedal/core';
import {
  advanceNavigationStep,
  completeNavigationSession,
  createNavigationSession,
  resetNavigationSession,
  recordRerouteAttempt,
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

import { zustandStorage } from '../lib/storage';
import { createQueueSlice, type QueueSlice } from './queueSlice';

const MAX_RECENT_DESTINATIONS = 3;

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
  locale: 'en',
  countryHint: 'RO',
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
  cyclingGoal: CyclingGoal | null;
  cachedStreak: StreakState | null;
  cachedImpact: {
    totalCo2Kg: number;
    totalMoneyEur: number;
    totalHazardsWarned: number;
  } | null;
  locale: 'en' | 'ro';
  themePreference: 'system' | 'dark' | 'light';
  ratingSkipCount: number;
  showHistoryOverlay: boolean;
  notificationPermissionAsked: boolean;
  anonymousOpenCount: number;
  earnedMilestones: readonly string[];
  recentDestinations: readonly RecentDestination[];
  addRecentDestination: (destination: RecentDestination) => void;
  userHazardVotes: Record<string, HazardVoteDirection>;
  setUserHazardVote: (hazardId: string, direction: HazardVoteDirection) => void;
  clearUserHazardVote: (hazardId: string) => void;
  // ── Mia Persona Journey ──
  persona: MiaPersona;
  miaJourneyLevel: MiaJourneyLevel;
  miaJourneyStatus: MiaJourneyStatus | null;
  miaPromptShown: boolean;
  pendingMiaLevelUp: MiaLevelUpEvent | null;
  activateMiaJourney: (source: MiaDetectionSource) => void;
  levelUpMia: (toLevel: MiaJourneyLevel) => void;
  optOutMia: () => void;
  completeMiaJourney: () => void;
  setMiaPromptShown: () => void;
  shiftMiaLevelUp: () => MiaLevelUpEvent | null;
  // ── Telemetry Queue ──
  pendingTelemetryEvents: readonly TelemetryEvent[];
  homeLocation: { lat: number; lon: number } | null;
  enqueueTelemetryEvent: (event: TelemetryEvent) => void;
  clearTelemetryEvents: () => void;
  setHomeLocation: (loc: { lat: number; lon: number }) => void;
  pendingBadgeUnlocks: readonly import('@defensivepedal/core').BadgeUnlockEvent[];
  enqueueBadgeUnlocks: (badges: readonly import('@defensivepedal/core').BadgeUnlockEvent[]) => void;
  shiftBadgeUnlock: () => import('@defensivepedal/core').BadgeUnlockEvent | undefined;
  clearBadgeUnlocks: () => void;
  pendingTierPromotion: import('@defensivepedal/core').XpAwardResult | null;
  setTierPromotion: (promotion: import('@defensivepedal/core').XpAwardResult | null) => void;
  clearTierPromotion: () => void;
  setLocale: (locale: 'en' | 'ro') => void;
  setThemePreference: (pref: 'system' | 'dark' | 'light') => void;
  incrementRatingSkipCount: () => void;
  setShowHistoryOverlay: (show: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  incrementAnonymousOpenCount: () => void;
  resetAnonymousOpenCount: () => void;
  setCyclingGoal: (goal: CyclingGoal | null) => void;
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
  setShowBicycleLanes: (enabled: boolean) => void;
  setPoiVisibility: (category: string, enabled: boolean) => void;
  showRouteComparison: boolean;
  setShowRouteComparison: (enabled: boolean) => void;
  setShareTripsPublicly: (enabled: boolean) => void;
  setShareConversionFeedOptin: (enabled: boolean) => void;
  setBikeType: (type: string | null) => void;
  setCyclingFrequency: (frequency: string | null) => void;
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
  // fallbacks only run once per app lifetime. NOT persisted — resets on
  // cold start. In practice install-referrer only populates on the first
  // post-install launch anyway, so re-running on subsequent cold starts
  // is a cheap no-op.
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
      avoidUnpaved: false,
      avoidHills: false,
      notifyWeather: true,
      notifyHazard: true,
      notifyCommunity: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      onboardingCompleted: false,
      cyclingGoal: null,
      cachedStreak: null,
      cachedImpact: null,
      locale: 'en',
      themePreference: 'dark',
      ratingSkipCount: 0,
      showHistoryOverlay: false,
      notificationPermissionAsked: false,
      anonymousOpenCount: 0,
      earnedMilestones: [],
      recentDestinations: [],
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
      // ── Mia Persona Journey ──
      persona: 'alex' as MiaPersona,
      miaJourneyLevel: 1 as MiaJourneyLevel,
      miaJourneyStatus: null,
      miaPromptShown: false,
      pendingMiaLevelUp: null,
      activateMiaJourney: (source: MiaDetectionSource) =>
        set(() => ({
          persona: 'mia' as MiaPersona,
          miaJourneyLevel: 1 as MiaJourneyLevel,
          miaJourneyStatus: 'active' as MiaJourneyStatus,
        })),
      levelUpMia: (toLevel: MiaJourneyLevel) =>
        set((state) => ({
          pendingMiaLevelUp: {
            fromLevel: state.miaJourneyLevel,
            toLevel,
          },
          miaJourneyLevel: toLevel,
        })),
      optOutMia: () =>
        set(() => ({
          persona: 'alex' as MiaPersona,
          miaJourneyStatus: 'opted_out' as MiaJourneyStatus,
        })),
      completeMiaJourney: () =>
        set(() => ({
          persona: 'alex' as MiaPersona,
          miaJourneyStatus: 'completed' as MiaJourneyStatus,
        })),
      setMiaPromptShown: () =>
        set(() => ({ miaPromptShown: true })),
      shiftMiaLevelUp: () => {
        const current = get().pendingMiaLevelUp;
        if (!current) return null;
        set(() => ({ pendingMiaLevelUp: null }));
        return current;
      },
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

      // ── Telemetry Queue ──
      pendingTelemetryEvents: [],
      homeLocation: null,
      enqueueTelemetryEvent: (event: TelemetryEvent) =>
        set((state) => ({
          pendingTelemetryEvents: [...state.pendingTelemetryEvents, event],
        })),
      clearTelemetryEvents: () =>
        set(() => ({ pendingTelemetryEvents: [] })),
      setHomeLocation: (loc: { lat: number; lon: number }) =>
        set(() => ({ homeLocation: loc })),
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
      setLocale: (locale) => set(() => ({ locale })),
      setThemePreference: (pref) => set(() => ({ themePreference: pref })),
      incrementRatingSkipCount: () =>
        set((state) => ({ ratingSkipCount: state.ratingSkipCount + 1 })),
      setShowHistoryOverlay: (show) => set(() => ({ showHistoryOverlay: show })),
      setOnboardingCompleted: (completed) =>
        set(() => ({ onboardingCompleted: completed })),
      incrementAnonymousOpenCount: () =>
        set((state) => ({ anonymousOpenCount: state.anonymousOpenCount + 1 })),
      resetAnonymousOpenCount: () =>
        set(() => ({ anonymousOpenCount: 0 })),
      setCyclingGoal: (goal) =>
        set(() => ({ cyclingGoal: goal })),
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
        set((state) => ({
          navigationSession: setSessionMute(
            createNavigationSession(route.id, new Date().toISOString(), sessionId),
            !state.voiceGuidanceEnabled,
          ),
          selectedRouteId: route.id,
          appState: 'NAVIGATING',
        })),
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
          const crumbs = state.navigationSession.gpsBreadcrumbs;
          const newCrumb = {
            lat: sample.coordinate.lat,
            lon: sample.coordinate.lon,
            ts: sample.timestamp,
            acc: sample.accuracyMeters ?? null,
            spd: sample.speedMetersPerSecond ?? null,
            hdg: sample.heading ?? null,
          };
          // Ring-buffer: drop oldest when at capacity so long rides keep recording
          const MAX_BREADCRUMBS = 2000;
          const updatedCrumbs =
            crumbs.length >= MAX_BREADCRUMBS
              ? [...crumbs.slice(1), newCrumb]
              : [...crumbs, newCrumb];
          return {
            navigationSession: {
              ...state.navigationSession,
              gpsBreadcrumbs: updatedCrumbs,
            },
          };
        }),
      finishNavigation: () =>
        set((state) => {
          const session = state.navigationSession;
          const isActive = session && session.state === 'navigating';
          return {
            navigationSession: isActive
              ? completeNavigationSession(session)
              : session,
            appState: isActive ? 'AWAITING_FEEDBACK' : state.appState,
          };
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
          userHazardVotes: {},
          pendingBadgeUnlocks: [],
          pendingTierPromotion: null,
          persona: 'alex' as MiaPersona,
          miaJourneyLevel: 1 as MiaJourneyLevel,
          miaJourneyStatus: null,
          miaPromptShown: false,
          pendingMiaLevelUp: null,
          pendingTelemetryEvents: [],
          homeLocation: null,
          pendingShareClaim: null,
          pendingShareClaimAttempts: 0,
        })),
    }),
    {
      name: 'defensivepedal-app-store',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        appState: state.appState,
        voiceGuidanceEnabled: state.voiceGuidanceEnabled,
        routeRequest: state.routeRequest,
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
        poiVisibility: state.poiVisibility,
        notifyWeather: state.notifyWeather,
        notifyHazard: state.notifyHazard,
        notifyCommunity: state.notifyCommunity,
        quietHoursStart: state.quietHoursStart,
        quietHoursEnd: state.quietHoursEnd,
        bikeType: state.bikeType,
        cyclingFrequency: state.cyclingFrequency,
        avoidUnpaved: state.avoidUnpaved,
        avoidHills: state.avoidHills,
        onboardingCompleted: state.onboardingCompleted,
        cyclingGoal: state.cyclingGoal,
        cachedStreak: state.cachedStreak,
        cachedImpact: state.cachedImpact,
        notificationPermissionAsked: state.notificationPermissionAsked,
        ratingSkipCount: state.ratingSkipCount,
        // showHistoryOverlay excluded — UI-only state that resets on app restart
        themePreference: state.themePreference,
        anonymousOpenCount: state.anonymousOpenCount,
        earnedMilestones: state.earnedMilestones,
        recentDestinations: state.recentDestinations,
        userHazardVotes: state.userHazardVotes,
        pendingBadgeUnlocks: state.pendingBadgeUnlocks,
        pendingTierPromotion: state.pendingTierPromotion,
        locale: state.locale,
        persona: state.persona,
        miaJourneyLevel: state.miaJourneyLevel,
        miaJourneyStatus: state.miaJourneyStatus,
        miaPromptShown: state.miaPromptShown,
        pendingMiaLevelUp: state.pendingMiaLevelUp,
        pendingTelemetryEvents: state.pendingTelemetryEvents,
        homeLocation: state.homeLocation,
        // pendingShareClaim persisted — survives redirect-to-onboarding
        // that can drop in-memory state before auth finishes. Attempts
        // are intentionally NOT persisted (reset on cold start).
        pendingShareClaim: state.pendingShareClaim,
      }),
    },
  ),
);
