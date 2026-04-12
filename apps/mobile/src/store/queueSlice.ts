import type { QueuedMutation, QueuedMutationType } from '@defensivepedal/core';
import type { QueuedMutationPayloadByType } from '../lib/offlineQueue';

export const MAX_QUEUE_SIZE = 500;

/** Trip-related mutation types that should not be dropped during queue eviction. */
export const TRIP_CRITICAL_TYPES = new Set(['trip_start', 'trip_end', 'trip_track', 'feedback']);

export const createQueuedMutationRecord = <TType extends QueuedMutationType>(
  type: TType,
  payload: QueuedMutationPayloadByType[TType],
) => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `${type}-${crypto.randomUUID()}`
      : `${type}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
  type,
  payload,
  createdAt: new Date().toISOString(),
  retryCount: 0,
  status: 'queued' as const,
  lastError: null,
});

// ---------------------------------------------------------------------------
// Slice types
// ---------------------------------------------------------------------------

export type QueueSliceState = {
  queuedMutations: QueuedMutation[];
  tripServerIds: Record<string, string>;
  activeTripClientId: string | null;
};

export type QueueSliceActions = {
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
  queueDeveloperValidationWrites: () => {
    clientTripId: string;
    sessionId: string;
    mutationIds: string[];
    queuedAt: string;
  };
};

export type QueueSlice = QueueSliceState & QueueSliceActions;

// ---------------------------------------------------------------------------
// Cross-cutting state the slice reads from the full store
// ---------------------------------------------------------------------------

/** Minimal shape of state fields from other slices that queue actions read. */
type CrossCuttingState = QueueSliceState & {
  navigationSession: {
    state: string;
    routeId: string;
    sessionId: string;
  } | null;
  routePreview: {
    routes: { distanceMeters: number }[];
  } | null;
  routeRequest: {
    origin: { lat: number; lon: number };
    destination: { lat: number; lon: number };
  };
};

// ---------------------------------------------------------------------------
// Slice creator
// ---------------------------------------------------------------------------

/**
 * Creates the offline-queue portion of the Zustand store.
 *
 * `set` and `get` are the full-store accessors forwarded by Zustand, so the
 * slice can read cross-cutting state (e.g. `navigationSession`, `routePreview`)
 * when needed.
 */
export const createQueueSlice = (
  set: (
    partial:
      | Partial<QueueSliceState>
      | ((state: CrossCuttingState) => Partial<QueueSliceState>),
  ) => void,
  get: () => CrossCuttingState,
): QueueSlice => ({
  // -- State ------------------------------------------------------------------
  queuedMutations: [],
  tripServerIds: {},
  activeTripClientId: null,

  // -- Actions ----------------------------------------------------------------

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
            if (TRIP_CRITICAL_TYPES.has(item.type)) return true;
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
              status: 'syncing' as const,
              lastAttemptAt: new Date().toISOString(),
              lastError: null,
            }
          : mutation,
      ),
    })),

  resolveMutation: (mutationId) =>
    set((state) => ({
      queuedMutations: state.queuedMutations.filter(
        (mutation) => mutation.id !== mutationId,
      ),
    })),

  failMutation: (mutationId, errorMessage) =>
    set((state) => ({
      queuedMutations: state.queuedMutations.map((mutation) =>
        mutation.id === mutationId
          ? {
              ...mutation,
              status: 'failed' as const,
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
              status: 'dead' as const,
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
              status: 'queued' as const,
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
              status: 'failed' as const,
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
});
