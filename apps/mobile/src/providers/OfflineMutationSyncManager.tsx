import type { NavigationFeedbackRequest, QueuedMutation, ShareTripRequest } from '@defensivepedal/core';
import { useEffect, useRef } from 'react';

import type { QueuedMutationPayloadByType, QueuedTripEndPayload, QueuedTripTrackPayload } from '../lib/offlineQueue';
import { mobileApi } from '../lib/api';
import { mobileEnv } from '../lib/env';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';

const SYNC_INTERVAL_MS = 15000;
const MUTATION_SYNC_TIMEOUT_MS = 10000;
const MAX_RETRY_COUNT = 5;
const BACKOFF_BASE_MS = 1000;

/** Returns the backoff delay in ms for a given retry count (exponential: 1s, 2s, 4s, 8s, 16s). */
const getBackoffDelay = (retryCount: number): number =>
  BACKOFF_BASE_MS * Math.pow(2, Math.min(retryCount, MAX_RETRY_COUNT));

/** Returns true if enough time has passed since the last attempt for this mutation's retry count. */
const isBackoffElapsed = (mutation: QueuedMutation): boolean => {
  if (!mutation.lastAttemptAt || mutation.retryCount === 0) {
    return true;
  }

  const elapsed = Date.now() - new Date(mutation.lastAttemptAt).getTime();
  return elapsed >= getBackoffDelay(mutation.retryCount - 1);
};

const getResolvedTripId = (
  payload: { clientTripId?: string; tripId?: string },
  tripServerIds: Record<string, string>,
): string | null => {
  if (payload.tripId) {
    return payload.tripId;
  }

  if (payload.clientTripId) {
    return tripServerIds[payload.clientTripId] ?? null;
  }

  return null;
};

const isMutationReady = (
  mutation: QueuedMutation,
  tripServerIds: Record<string, string>,
): boolean => {
  if (mutation.type === 'trip_end' || mutation.type === 'trip_track') {
    return (
      getResolvedTripId(
        mutation.payload as QueuedTripEndPayload,
        tripServerIds,
      ) !== null
    );
  }

  return true;
};

/** Trip-related types that must be ordered (trip_start before trip_end/trip_track). */
const TRIP_DEPENDENT_TYPES = new Set(['trip_end', 'trip_track']);

/**
 * Returns true if this mutation should be skipped (not blocked) in the current flush cycle.
 * Reasons to skip: backoff not elapsed, dependency not ready, already dead.
 */
const shouldSkipMutation = (
  mutation: QueuedMutation,
  tripServerIds: Record<string, string>,
): boolean => {
  if (mutation.status === 'dead' || mutation.status === 'syncing') {
    return true;
  }

  if (!isBackoffElapsed(mutation)) {
    return true;
  }

  if (!isMutationReady(mutation, tripServerIds)) {
    return true;
  }

  return false;
};

const submitQueuedMutation = async (
  mutation: QueuedMutation,
  tripServerIds: Record<string, string>,
) => {
  switch (mutation.type) {
    case 'hazard':
      return mobileApi.reportHazard(
        mutation.payload as QueuedMutationPayloadByType['hazard'],
      );
    case 'trip_start':
      return mobileApi.startTrip(
        mutation.payload as QueuedMutationPayloadByType['trip_start'],
      );
    case 'trip_end': {
      const payload = mutation.payload as QueuedTripEndPayload;
      const tripId = getResolvedTripId(payload, tripServerIds);

      if (!tripId) {
        return null;
      }

      return mobileApi.endTrip({
        ...payload,
        tripId,
      });
    }
    case 'trip_track': {
      const payload = mutation.payload as QueuedTripTrackPayload;
      const tripId = getResolvedTripId(payload, tripServerIds);

      if (!tripId) {
        return null;
      }

      return mobileApi.saveTripTrack({
        ...payload,
        tripId,
      });
    }
    case 'trip_share': {
      const payload = mutation.payload as ShareTripRequest;
      return mobileApi.shareTripToFeed(payload);
    }
    case 'feedback': {
      const payload = mutation.payload as QueuedMutationPayloadByType['feedback'];
      const tripId = getResolvedTripId(payload, tripServerIds);
      const nextPayload: NavigationFeedbackRequest = tripId
        ? {
            ...payload,
            tripId,
          }
        : payload;

      return mobileApi.submitFeedback(nextPayload);
    }
    default:
      return null;
  }
};

const withMutationTimeout = async <TResponse,>(
  promise: Promise<TResponse>,
  mutationType: QueuedMutation['type'],
) =>
  new Promise<TResponse>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `Offline sync for ${mutationType} timed out after ${
            MUTATION_SYNC_TIMEOUT_MS / 1000
          } seconds.`,
        ),
      );
    }, MUTATION_SYNC_TIMEOUT_MS);

    promise
      .then((result) => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });

export const OfflineMutationSyncManager = () => {
  const flushingRef = useRef(false);

  useEffect(() => {
    const state = useAppStore.getState();

    if (state.queuedMutations.some((mutation) => mutation.status === 'syncing')) {
      state.recoverSyncingMutations('Recovered an unfinished sync attempt.');
    }
  }, []);

  useEffect(() => {
    if (!mobileEnv.mobileApiUrl) {
      return undefined;
    }

    let cancelled = false;

    const flushQueue = async () => {
      if (cancelled || flushingRef.current) {
        return;
      }

      flushingRef.current = true;

      try {
        // Recover any mutations stuck in 'syncing' state (e.g., from a crash mid-sync).
        const initialState = useAppStore.getState();

        if (initialState.queuedMutations.some((mutation) => mutation.status === 'syncing')) {
          initialState.recoverSyncingMutations('Recovered an unfinished sync attempt.');
        }

        // Process mutations one at a time, skipping those not ready or in backoff.
        // We loop through indices rather than caching the array, since the store
        // updates immutably after each operation and we re-read fresh state.
        let processedCount = 0;
        const maxPerFlush = 20; // Prevent runaway loops

        while (!cancelled && processedCount < maxPerFlush) {
          const state = useAppStore.getState();

          // Find the next mutation eligible for sync.
          const mutation = state.queuedMutations.find(
            (current) => !shouldSkipMutation(current, state.tripServerIds),
          );

          if (!mutation) {
            break;
          }

          processedCount++;
          state.markMutationSyncing(mutation.id);

          try {
            const response = await withMutationTimeout(
              submitQueuedMutation(mutation, state.tripServerIds),
              mutation.type,
            );

            if (
              mutation.type === 'trip_start' &&
              response &&
              typeof response === 'object' &&
              'tripId' in response
            ) {
              const tripStartPayload = mutation.payload as QueuedMutationPayloadByType['trip_start'];
              state.setTripServerId(
                tripStartPayload.clientTripId,
                (response as { tripId: string }).tripId,
              );
            }

            state.resolveMutation(mutation.id);
            telemetry.capture('offline_sync_succeeded', {
              mutation_type: mutation.type,
              remaining_queue_count: Math.max(state.queuedMutations.length - 1, 0),
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Offline sync failed.';
            const nextRetryCount = mutation.retryCount + 1;

            if (nextRetryCount >= MAX_RETRY_COUNT) {
              // Mutation has exceeded max retries — mark as dead.
              state.killMutation(mutation.id, errorMessage);

              // If a trip_start dies, cascade-kill dependent trip_end and trip_track
              // mutations that are waiting on its clientTripId. Without this they stay
              // permanently pending (skipped every flush but never cleaned up).
              if (mutation.type === 'trip_start') {
                const startPayload = mutation.payload as QueuedMutationPayloadByType['trip_start'];
                const dependentIds = useAppStore.getState().queuedMutations
                  .filter((m) =>
                    TRIP_DEPENDENT_TYPES.has(m.type) &&
                    m.status !== 'dead' &&
                    (m.payload as { clientTripId?: string }).clientTripId === startPayload.clientTripId,
                  )
                  .map((m) => m.id);

                for (const depId of dependentIds) {
                  useAppStore.getState().killMutation(depId, 'trip_start failed — orphaned');
                }

                if (dependentIds.length > 0) {
                  telemetry.capture('offline_sync_cascade_killed', {
                    client_trip_id: startPayload.clientTripId,
                    killed_count: dependentIds.length,
                  });
                }
              }

              telemetry.capture('offline_sync_dead', {
                mutation_type: mutation.type,
                mutation_id: mutation.id,
                retry_count: nextRetryCount,
                error: errorMessage,
              });
            } else {
              state.failMutation(mutation.id, errorMessage);
              telemetry.capture('offline_sync_failed', {
                mutation_type: mutation.type,
                retry_count: nextRetryCount,
                backoff_ms: getBackoffDelay(nextRetryCount - 1),
              });
            }

            telemetry.captureError(error, {
              feature: 'offline_sync',
              mutation_type: mutation.type,
              retry_count: nextRetryCount,
            });

            // Continue processing other mutations instead of breaking.
            // The failed mutation will be skipped on the next iteration due to backoff.
          }
        }
        // ── Telemetry flush (best-effort, non-fatal) ──
        try {
          const telemetryState = useAppStore.getState();
          const events = [...telemetryState.pendingTelemetryEvents];
          if (events.length > 0) {
            await mobileApi.sendTelemetryEvents(events);
            // Only remove the events we actually sent — new events may have
            // been enqueued during the await.
            useAppStore.setState((state) => ({
              pendingTelemetryEvents: state.pendingTelemetryEvents.slice(events.length),
            }));
          }
        } catch {
          // Telemetry is best-effort — silently ignore failures.
          // Events remain in the queue and will retry next cycle.
        }
      } finally {
        flushingRef.current = false;
      }
    };

    // Flush immediately on mount, then on a stable 15s interval.
    // The flush function reads fresh state via useAppStore.getState()
    // so it always sees the latest queue without needing reactive deps.
    void flushQueue();
    const intervalHandle = setInterval(() => {
      void flushQueue();
    }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalHandle);
    };
  }, []);

  return null;
};
