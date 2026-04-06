import type {
  Coordinate,
  CyclingGoal,
  OfflineRegion,
  NavigationLocationSample,
  QueuedMutation,
  QueuedMutationType,
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

import type { QueuedMutationPayloadByType } from '../lib/offlineQueue';
import { zustandStorage } from '../lib/storage';

const MAX_QUEUE_SIZE = 500;

/** Trip-related mutation types that should not be dropped during queue eviction. */
const TRIP_CRITICAL_TYPES = new Set(['trip_start', 'trip_end', 'trip_track']);

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
  locale: 'en',
  countryHint: 'RO',
};

const createQueuedMutationRecord = <TType extends QueuedMutationType>(
  type: TType,
  payload: QueuedMutationPayloadByType[TType],
) => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `${type}-${crypto.randomUUID()}`
      : `${type}-${Date.now()}`,
  type,
  payload,
  createdAt: new Date().toISOString(),
  retryCount: 0,
  status: 'queued' as const,
  lastError: null,
});

type AppStore = {
  appState: AppState;
  voiceGuidanceEnabled: boolean;
  routeRequest: RoutePreviewRequest;
  routePreview: RoutePreviewResponse | null;
  selectedRouteId: string | null;
  navigationSession: NavigationSession | null;
  queuedMutations: QueuedMutation[];
  offlineRegions: OfflineRegion[];
  tripServerIds: Record<string, string>;
  activeTripClientId: string | null;
  shareTripsPublicly: boolean;
  bikeType: string | null;
  cyclingFrequency: string | null;
  avoidUnpaved: boolean;
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
  ratingSkipCount: number;
  showHistoryOverlay: boolean;
  notificationPermissionAsked: boolean;
  anonymousOpenCount: number;
  earnedMilestones: readonly string[];
  pendingBadgeUnlocks: readonly import('@defensivepedal/core').BadgeUnlockEvent[];
  enqueueBadgeUnlocks: (badges: readonly import('@defensivepedal/core').BadgeUnlockEvent[]) => void;
  shiftBadgeUnlock: () => import('@defensivepedal/core').BadgeUnlockEvent | undefined;
  clearBadgeUnlocks: () => void;
  setLocale: (locale: 'en' | 'ro') => void;
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
  setBikeType: (type: string | null) => void;
  setCyclingFrequency: (frequency: string | null) => void;
  setAvoidUnpaved: (enabled: boolean) => void;
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
  queueDeveloperValidationWrites: () => {
    clientTripId: string;
    sessionId: string;
    mutationIds: string[];
    queuedAt: string;
  };
  enqueueMutation: <TType extends QueuedMutationType>(
    type: TType,
    payload: QueuedMutationPayloadByType[TType],
  ) => string;
  markMutationSyncing: (mutationId: string) => void;
  resolveMutation: (mutationId: string) => void;
  failMutation: (mutationId: string, errorMessage: string) => void;
  killMutation: (mutationId: string, errorMessage: string) => void;
  retryDeadMutations: () => number;
  recoverSyncingMutations: (errorMessage?: string) => void;
  setTripServerId: (clientTripId: string, tripId: string) => void;
  setActiveTripClientId: (clientTripId: string | null) => void;
  setOfflineRegions: (regions: OfflineRegion[]) => void;
  upsertOfflineRegion: (region: OfflineRegion) => void;
  removeOfflineRegion: (regionId: string) => void;
  resetFlow: () => void;
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
      queuedMutations: [],
      offlineRegions: [],
      tripServerIds: {},
      activeTripClientId: null,
      showRouteComparison: true,
      shareTripsPublicly: true,
      bikeType: null,
      cyclingFrequency: null,
      avoidUnpaved: false,
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
      ratingSkipCount: 0,
      showHistoryOverlay: false,
      notificationPermissionAsked: false,
      anonymousOpenCount: 0,
      earnedMilestones: [],
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
      setLocale: (locale) => set(() => ({ locale })),
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
      setRouteRequest: (request) =>
        set((state) => ({
          routeRequest: {
            ...state.routeRequest,
            ...request,
          },
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
          const current = [...(state.routeRequest.waypoints ?? [])];
          if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) {
            return state;
          }
          const [moved] = current.splice(fromIndex, 1);
          current.splice(toIndex, 0, moved);
          return {
            routeRequest: {
              ...state.routeRequest,
              waypoints: current,
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
          // Cap at 2000 points to bound memory
          if (crumbs.length >= 2000) return state;
          return {
            navigationSession: {
              ...state.navigationSession,
              gpsBreadcrumbs: [
                ...crumbs,
                {
                  lat: sample.coordinate.lat,
                  lon: sample.coordinate.lon,
                  ts: sample.timestamp,
                  acc: sample.accuracyMeters ?? null,
                  spd: sample.speedMetersPerSecond ?? null,
                  hdg: sample.heading ?? null,
                },
              ],
            },
          };
        }),
      finishNavigation: () =>
        set((state) => ({
          navigationSession: state.navigationSession
            ? completeNavigationSession(state.navigationSession)
            : state.navigationSession,
          appState: 'AWAITING_FEEDBACK',
        })),
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
      queueDeveloperValidationWrites: () => {
        const queuedAtDate = new Date();
        const queuedAt = queuedAtDate.toISOString();
        const tripTimestamp = queuedAtDate.getTime();
        const state = get();
        const clientTripId = `dev-trip-${tripTimestamp}`;
        const sessionId =
          state.navigationSession &&
          state.navigationSession.state !== 'idle' &&
          state.navigationSession.routeId
            ? state.navigationSession.sessionId
            : `dev-session-${tripTimestamp}`;
        const routeDistance = state.routePreview?.routes[0]?.distanceMeters ?? 2500;
        const origin = state.routeRequest.origin;
        const destination = state.routeRequest.destination;

        const queuedMutations = [
          createQueuedMutationRecord('trip_start', {
            clientTripId,
            sessionId,
            startLocationText: 'Developer validation start',
            startCoordinate: origin,
            destinationText: 'Developer validation destination',
            destinationCoordinate: destination,
            distanceMeters: routeDistance,
            startedAt: queuedAt,
          }),
          createQueuedMutationRecord('hazard', {
            coordinate: {
              lat: origin.lat,
              lon: origin.lon,
            },
            reportedAt: new Date(tripTimestamp + 30_000).toISOString(),
            source: 'manual',
          }),
          createQueuedMutationRecord('feedback', {
            clientTripId,
            sessionId,
            startLocationText: 'Developer validation start',
            destinationText: 'Developer validation destination',
            distanceMeters: routeDistance,
            durationSeconds: 780,
            rating: 4,
            feedbackText: 'Developer validation feedback for offline queue sync.',
            submittedAt: new Date(tripTimestamp + 60_000).toISOString(),
          }),
          createQueuedMutationRecord('trip_end', {
            clientTripId,
            endedAt: new Date(tripTimestamp + 90_000).toISOString(),
            reason: 'completed',
          }),
        ];

        set((currentState) => ({
          queuedMutations: [...currentState.queuedMutations, ...queuedMutations],
          activeTripClientId: clientTripId,
        }));

        return {
          clientTripId,
          sessionId,
          mutationIds: queuedMutations.map((mutation) => mutation.id),
          queuedAt,
        };
      },
      enqueueMutation: (type, payload) => {
        const mutation = createQueuedMutationRecord(type, payload);

        set((state) => {
          let nextQueue = [...state.queuedMutations, mutation];

          // Enforce queue size bounds by evicting the oldest non-trip, non-syncing items.
          if (nextQueue.length > MAX_QUEUE_SIZE) {
            const overage = nextQueue.length - MAX_QUEUE_SIZE;
            let dropped = 0;

            nextQueue = nextQueue.filter((item) => {
              if (dropped >= overage) return true;
              // Never drop items currently syncing or trip-critical items.
              if (item.status === 'syncing' || TRIP_CRITICAL_TYPES.has(item.type)) return true;
              // Prefer dropping dead items first, then oldest queued/failed.
              if (item.status === 'dead') {
                dropped++;
                return false;
              }

              return true;
            });

            // If we still haven't dropped enough, drop oldest non-syncing failed/queued items.
            if (nextQueue.length > MAX_QUEUE_SIZE) {
              const remainingOverage = nextQueue.length - MAX_QUEUE_SIZE;
              let secondPassDropped = 0;

              nextQueue = nextQueue.filter((item) => {
                if (secondPassDropped >= remainingOverage) return true;
                if (item.status === 'syncing') return true;
                if (item.id === mutation.id) return true; // Keep the new mutation
                secondPassDropped++;
                return false;
              });
            }
          }

          return { queuedMutations: nextQueue };
        });

        return mutation.id;
      },
      markMutationSyncing: (mutationId) =>
        set((state) => ({
          queuedMutations: state.queuedMutations.map((mutation) =>
            mutation.id === mutationId
              ? {
                  ...mutation,
                  status: 'syncing',
                  lastAttemptAt: new Date().toISOString(),
                  lastError: null,
                }
              : mutation,
          ),
        })),
      resolveMutation: (mutationId) =>
        set((state) => ({
          queuedMutations: state.queuedMutations.filter((mutation) => mutation.id !== mutationId),
        })),
      failMutation: (mutationId, errorMessage) =>
        set((state) => ({
          queuedMutations: state.queuedMutations.map((mutation) =>
            mutation.id === mutationId
              ? {
                  ...mutation,
                  status: 'failed',
                  retryCount: mutation.retryCount + 1,
                  lastAttemptAt: new Date().toISOString(),
                  lastError: errorMessage,
                }
              : mutation,
          ),
        })),
      killMutation: (mutationId, errorMessage) =>
        set((state) => ({
          queuedMutations: state.queuedMutations.map((mutation) =>
            mutation.id === mutationId
              ? {
                  ...mutation,
                  status: 'dead',
                  retryCount: mutation.retryCount + 1,
                  lastAttemptAt: new Date().toISOString(),
                  lastError: `[MAX RETRIES] ${errorMessage}`,
                }
              : mutation,
          ),
        })),
      retryDeadMutations: () => {
        const state = get();
        const deadMutations = state.queuedMutations.filter(
          (mutation) => mutation.status === 'dead',
        );

        if (deadMutations.length === 0) return 0;

        set((currentState) => ({
          queuedMutations: currentState.queuedMutations.map((mutation) =>
            mutation.status === 'dead'
              ? {
                  ...mutation,
                  status: 'queued',
                  retryCount: 0,
                  lastError: null,
                }
              : mutation,
          ),
        }));

        return deadMutations.length;
      },
      recoverSyncingMutations: (errorMessage = 'Recovered an unfinished sync attempt.') =>
        set((state) => ({
          queuedMutations: state.queuedMutations.map((mutation) =>
            mutation.status === 'syncing'
              ? {
                  ...mutation,
                  status: 'failed',
                  retryCount: mutation.retryCount + 1,
                  lastAttemptAt: new Date().toISOString(),
                  lastError: errorMessage,
                }
              : mutation,
          ),
        })),
      setTripServerId: (clientTripId, tripId) =>
        set((state) => ({
          tripServerIds: {
            ...state.tripServerIds,
            [clientTripId]: tripId,
          },
        })),
      setActiveTripClientId: (clientTripId) =>
        set(() => ({
          activeTripClientId: clientTripId,
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
        set(() => ({
          appState: 'IDLE',
          routePreview: null,
          selectedRouteId: null,
          navigationSession: resetNavigationSession(),
          routeRequest: DEFAULT_ROUTE_REQUEST,
          activeTripClientId: null,
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
        onboardingCompleted: state.onboardingCompleted,
        cyclingGoal: state.cyclingGoal,
        cachedStreak: state.cachedStreak,
        cachedImpact: state.cachedImpact,
        notificationPermissionAsked: state.notificationPermissionAsked,
        ratingSkipCount: state.ratingSkipCount,
        anonymousOpenCount: state.anonymousOpenCount,
        earnedMilestones: state.earnedMilestones,
        pendingBadgeUnlocks: state.pendingBadgeUnlocks,
      }),
    },
  ),
);
