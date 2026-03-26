import type { NavigationFeedbackRequest, QueuedMutation } from '@defensivepedal/core';
import { useEffect, useRef } from 'react';

import type { QueuedMutationPayloadByType, QueuedTripEndPayload, QueuedTripTrackPayload } from '../lib/offlineQueue';
import { mobileApi } from '../lib/api';
import { mobileEnv } from '../lib/env';
import { telemetry } from '../lib/telemetry';
import { useAppStore } from '../store/appStore';

const SYNC_INTERVAL_MS = 15000;
const MUTATION_SYNC_TIMEOUT_MS = 10000;

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
  const queuedMutations = useAppStore((state) => state.queuedMutations);
  const tripServerIds = useAppStore((state) => state.tripServerIds);
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
        while (!cancelled) {
          const state = useAppStore.getState();

          if (state.queuedMutations.some((mutation) => mutation.status === 'syncing')) {
            state.recoverSyncingMutations('Recovered an unfinished sync attempt.');
          }

          const mutation = state.queuedMutations.find(
            (current) => current.status !== 'syncing',
          );

          if (!mutation) {
            break;
          }

          if (!isMutationReady(mutation, state.tripServerIds)) {
            break;
          }

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
            state.failMutation(
              mutation.id,
              error instanceof Error ? error.message : 'Offline sync failed.',
            );
            telemetry.capture('offline_sync_failed', {
              mutation_type: mutation.type,
              queue_count: state.queuedMutations.length,
            });
            telemetry.captureError(error, {
              feature: 'offline_sync',
              mutation_type: mutation.type,
            });
            break;
          }
        }
      } finally {
        flushingRef.current = false;
      }
    };

    void flushQueue();
    const intervalHandle = setInterval(() => {
      void flushQueue();
    }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalHandle);
    };
  }, [queuedMutations, tripServerIds]);

  return null;
};
