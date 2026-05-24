import type { QueuedMutation } from '@defensivepedal/core';

import { HttpError } from './httpError';
import type { QueuedTripEndPayload } from './offlineQueue';

/**
 * Pure-logic helpers for OfflineMutationSyncManager. Extracted so we can unit
 * test backoff math, error classification, and skip rules without spinning up
 * the React provider, Zustand store, or the API client.
 *
 * The provider (`OfflineMutationSyncManager.tsx`) is the only consumer.
 */

export const SYNC_INTERVAL_MS = 15_000;
export const MAX_RETRY_COUNT = 5;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_JITTER_RATIO = 0.25;

/**
 * Per-type request timeout. Trip data is critical (loss = lost ride) and the
 * Cloud Run API can cold-start in 15-25s, so trip_* gets a 30s ceiling. The
 * cheap idempotent mutations (hazards, votes, feedback, city suggestions,
 * trip shares) stay at 10s — they don't justify a long wait, and if the
 * network is that slow we'd rather retry sooner.
 *
 * Pre-2026-05-24, every mutation shared a single 10s timeout. That triggered
 * MOBILE-7 on 6 production users in 14 days — trip_end and trip_start were
 * timing out against Cloud Run cold starts.
 */
export const MUTATION_SYNC_TIMEOUT_MS_BY_TYPE: Record<QueuedMutation['type'], number> = {
  trip_start: 30_000,
  trip_end: 30_000,
  trip_track: 30_000,
  trip_share: 15_000,
  hazard: 10_000,
  hazard_vote: 10_000,
  feedback: 10_000,
  city_suggestion: 10_000,
};

const DEFAULT_MUTATION_SYNC_TIMEOUT_MS = 10_000;

export const getMutationTimeoutMs = (type: QueuedMutation['type']): number =>
  MUTATION_SYNC_TIMEOUT_MS_BY_TYPE[type] ?? DEFAULT_MUTATION_SYNC_TIMEOUT_MS;

/**
 * Exponential backoff with ±25% jitter, capped at the retry-count cap.
 * Jitter spreads simultaneous reconnects across a small window so many
 * devices coming online together don't stampede the API.
 *
 * Curve (base, before jitter): 1s, 2s, 4s, 8s, 16s.
 */
export const getBackoffDelay = (
  retryCount: number,
  randomFn: () => number = Math.random,
): number => {
  const cappedExponent = Math.min(retryCount, MAX_RETRY_COUNT);
  const base = BACKOFF_BASE_MS * Math.pow(2, cappedExponent);
  // randomFn() in [0,1) → (2*r - 1) in [-1,1) → scaled to [-ratio, +ratio)
  const jitterMultiplier = 1 + BACKOFF_JITTER_RATIO * (2 * randomFn() - 1);
  return Math.max(0, Math.round(base * jitterMultiplier));
};

/**
 * Returns true if enough time has passed since the last attempt for this
 * mutation's retry count. Uses the deterministic max-jitter ceiling
 * (`base * (1 + ratio)`) so we never under-wait — a freshly-jittered
 * elapsed-check would race with whatever jitter the prior `getBackoffDelay`
 * call happened to produce.
 */
export const isBackoffElapsed = (mutation: QueuedMutation, now: number = Date.now()): boolean => {
  if (!mutation.lastAttemptAt || mutation.retryCount === 0) {
    return true;
  }

  const elapsed = now - new Date(mutation.lastAttemptAt).getTime();
  const cappedExponent = Math.min(mutation.retryCount - 1, MAX_RETRY_COUNT);
  const base = BACKOFF_BASE_MS * Math.pow(2, cappedExponent);
  const maxDelay = base * (1 + BACKOFF_JITTER_RATIO);
  return elapsed >= maxDelay;
};

export const getResolvedTripId = (
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

export const isMutationReady = (
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

/** Trip-related types that depend on trip_start landing first. */
export const TRIP_DEPENDENT_TYPES: ReadonlySet<QueuedMutation['type']> = new Set([
  'trip_end',
  'trip_track',
]);

/**
 * Returns true if this mutation should be skipped (not blocked) in the current
 * flush cycle. Reasons: backoff not elapsed, dependency not ready, already
 * dead or syncing.
 */
export const shouldSkipMutation = (
  mutation: QueuedMutation,
  tripServerIds: Record<string, string>,
  now: number = Date.now(),
): boolean => {
  if (mutation.status === 'dead' || mutation.status === 'syncing') {
    return true;
  }

  if (!isBackoffElapsed(mutation, now)) {
    return true;
  }

  if (!isMutationReady(mutation, tripServerIds)) {
    return true;
  }

  return false;
};

/**
 * Classifies an error as "permanent" — i.e. retrying will never succeed.
 * Permanent: 4xx HTTP statuses (validation, auth, not-found, conflict, etc.)
 * EXCEPT 408 Request Timeout and 429 Too Many Requests — both signal the
 * server temporarily can't handle the request, so retry is legitimate.
 *
 * Non-HttpError errors (timeout, network, runtime) are NOT permanent — they
 * fall through to the existing retry-with-backoff path.
 *
 * Pre-2026-05-24, every error type went through the same 5-retry loop;
 * a 422 (e.g. trip_end with a stale tripId) burned 5 attempts over ~31s
 * of backoff before being killed. Now it's dropped on the first failure.
 */
export const isPermanentError = (error: unknown): boolean => {
  if (!(error instanceof HttpError)) {
    return false;
  }

  if (error.status < 400 || error.status >= 500) {
    return false;
  }

  // 408 = client timeout (rare from our API but server can return it).
  // 429 = rate limited — retry after the cooldown period.
  if (error.status === 408 || error.status === 429) {
    return false;
  }

  return true;
};
