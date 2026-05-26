/**
 * offlineSyncHelpers — Unit tests
 *
 * Covers the pure logic that backs OfflineMutationSyncManager: per-type
 * timeouts, jittered exponential backoff, retry-skip rules, dependency
 * resolution, and permanent-error classification.
 *
 * The provider itself (which weaves these together with React lifecycle,
 * the Zustand store, and the live API) is intentionally NOT tested here —
 * Phase 1's failure mode (MOBILE-7) is a timeout-ceiling bug, not a
 * lifecycle bug, and the lifecycle path is large enough that mocking it
 * faithfully is more work than the bug warrants.
 */
import type { QueuedMutation, QueuedMutationType } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { ApiClientError } from './apiFetch';

const httpError = (status: number): ApiClientError =>
  new ApiClientError({ kind: 'http', message: `HTTP ${status}`, status });
import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER_RATIO,
  getBackoffDelay,
  getMutationTimeoutMs,
  getResolvedTripId,
  isBackoffElapsed,
  isMutationReady,
  isPermanentError,
  MAX_RETRY_COUNT,
  MUTATION_SYNC_TIMEOUT_MS_BY_TYPE,
  shouldSkipMutation,
} from './offlineSyncHelpers';

const makeMutation = (overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
  id: 'mut-test-1',
  type: 'hazard',
  payload: {},
  createdAt: '2026-05-24T10:00:00.000Z',
  retryCount: 0,
  status: 'queued',
  lastError: null,
  ...overrides,
});

describe('getMutationTimeoutMs', () => {
  it.each<[QueuedMutationType, number]>([
    ['trip_start', 30_000],
    ['trip_end', 30_000],
    ['trip_track', 30_000],
    ['trip_share', 15_000],
    ['hazard', 10_000],
    ['hazard_vote', 10_000],
    ['feedback', 10_000],
    ['city_suggestion', 10_000],
  ])('returns the right ceiling for %s', (type, expected) => {
    expect(getMutationTimeoutMs(type)).toBe(expected);
  });

  it('keeps trip_* mutations above 25s to cover Cloud Run cold starts', () => {
    // MOBILE-7's root cause: a hard 10s ceiling for trip_end was timing out
    // before the API came back from cold. Guard the regression.
    for (const type of ['trip_start', 'trip_end', 'trip_track'] as const) {
      expect(MUTATION_SYNC_TIMEOUT_MS_BY_TYPE[type]).toBeGreaterThanOrEqual(25_000);
    }
  });
});

describe('getBackoffDelay', () => {
  // With deterministic mid-jitter (random=0.5), `2*r - 1 == 0`, so the
  // jitter multiplier collapses to 1 and we get the bare exponential curve.
  const midJitter = () => 0.5;

  it.each<[number, number]>([
    [0, BACKOFF_BASE_MS * 1],
    [1, BACKOFF_BASE_MS * 2],
    [2, BACKOFF_BASE_MS * 4],
    [3, BACKOFF_BASE_MS * 8],
    [4, BACKOFF_BASE_MS * 16],
    [5, BACKOFF_BASE_MS * 32],
  ])('exponential at retry %d with no jitter', (retry, expected) => {
    expect(getBackoffDelay(retry, midJitter)).toBe(expected);
  });

  it('caps the exponent so very high retry counts do not overflow', () => {
    // retryCount >> MAX_RETRY_COUNT must collapse to the cap.
    const capped = getBackoffDelay(100, midJitter);
    const atCap = getBackoffDelay(MAX_RETRY_COUNT, midJitter);
    expect(capped).toBe(atCap);
  });

  it('applies negative jitter at random()=0 and positive at random()→1', () => {
    const lower = getBackoffDelay(2, () => 0); // (2*0 - 1) = -1 → 1 - ratio
    const upper = getBackoffDelay(2, () => 0.999); // → ~ 1 + ratio
    const base = BACKOFF_BASE_MS * 4; // retry=2 exponent
    expect(lower).toBeCloseTo(base * (1 - BACKOFF_JITTER_RATIO), -1);
    expect(upper).toBeCloseTo(base * (1 + BACKOFF_JITTER_RATIO), -1);
  });

  it('never returns a negative delay even at the worst jitter draw', () => {
    expect(getBackoffDelay(0, () => 0)).toBeGreaterThanOrEqual(0);
  });

  it('spreads draws across the jitter range (real random)', () => {
    // Empirical: 100 draws at retry=3 should land inside [base*0.75, base*1.25].
    const base = BACKOFF_BASE_MS * 8;
    const samples = Array.from({ length: 100 }, () => getBackoffDelay(3));
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(Math.floor(base * (1 - BACKOFF_JITTER_RATIO)));
      expect(sample).toBeLessThanOrEqual(Math.ceil(base * (1 + BACKOFF_JITTER_RATIO)));
    }
    // And the spread is non-trivial (not the same value every time).
    expect(new Set(samples).size).toBeGreaterThan(10);
  });
});

describe('isBackoffElapsed', () => {
  const now = Date.parse('2026-05-24T12:00:00.000Z');

  it('returns true on the first attempt (retryCount=0)', () => {
    expect(isBackoffElapsed(makeMutation({ retryCount: 0, lastAttemptAt: undefined }), now)).toBe(
      true,
    );
  });

  it('returns true when lastAttemptAt is missing even after a retry', () => {
    expect(isBackoffElapsed(makeMutation({ retryCount: 2, lastAttemptAt: undefined }), now)).toBe(
      true,
    );
  });

  it('returns false right after a failed attempt before the backoff window elapses', () => {
    const lastAttemptAt = new Date(now - 100).toISOString();
    // retry=1 → base=1s, with +25% jitter ceiling = 1.25s. 100ms elapsed is way too soon.
    expect(isBackoffElapsed(makeMutation({ retryCount: 1, lastAttemptAt }), now)).toBe(false);
  });

  it('returns true once enough time has passed for the max-jittered backoff', () => {
    // retry=1 → base=1s, ceiling = 1.25s. 2s elapsed is safely past.
    const lastAttemptAt = new Date(now - 2_000).toISOString();
    expect(isBackoffElapsed(makeMutation({ retryCount: 1, lastAttemptAt }), now)).toBe(true);
  });
});

describe('getResolvedTripId', () => {
  it('prefers an explicit tripId over a clientTripId lookup', () => {
    expect(
      getResolvedTripId(
        { tripId: 'srv-1', clientTripId: 'cli-1' },
        { 'cli-1': 'srv-2' },
      ),
    ).toBe('srv-1');
  });

  it('resolves via the tripServerIds map when only clientTripId is set', () => {
    expect(getResolvedTripId({ clientTripId: 'cli-1' }, { 'cli-1': 'srv-1' })).toBe('srv-1');
  });

  it('returns null when neither identifier is available', () => {
    expect(getResolvedTripId({}, {})).toBeNull();
  });

  it('returns null when the clientTripId has no server-side mapping yet', () => {
    expect(getResolvedTripId({ clientTripId: 'cli-1' }, {})).toBeNull();
  });
});

describe('isMutationReady', () => {
  it('blocks trip_end when the trip_start has not landed yet', () => {
    const mutation = makeMutation({
      type: 'trip_end',
      payload: { clientTripId: 'cli-1' },
    });
    expect(isMutationReady(mutation, {})).toBe(false);
  });

  it('allows trip_end once a server tripId is mapped', () => {
    const mutation = makeMutation({
      type: 'trip_end',
      payload: { clientTripId: 'cli-1' },
    });
    expect(isMutationReady(mutation, { 'cli-1': 'srv-1' })).toBe(true);
  });

  it('does not block independent mutation types', () => {
    expect(isMutationReady(makeMutation({ type: 'hazard' }), {})).toBe(true);
    expect(isMutationReady(makeMutation({ type: 'hazard_vote' }), {})).toBe(true);
    expect(isMutationReady(makeMutation({ type: 'feedback' }), {})).toBe(true);
    expect(isMutationReady(makeMutation({ type: 'city_suggestion' }), {})).toBe(true);
    expect(isMutationReady(makeMutation({ type: 'trip_share' }), {})).toBe(true);
  });
});

describe('shouldSkipMutation', () => {
  const now = Date.parse('2026-05-24T12:00:00.000Z');

  it('skips dead mutations', () => {
    expect(shouldSkipMutation(makeMutation({ status: 'dead' }), {}, now)).toBe(true);
  });

  it('skips mutations already in flight', () => {
    expect(shouldSkipMutation(makeMutation({ status: 'syncing' }), {}, now)).toBe(true);
  });

  it('skips when the backoff window has not elapsed', () => {
    const lastAttemptAt = new Date(now - 50).toISOString();
    expect(shouldSkipMutation(makeMutation({ retryCount: 1, lastAttemptAt }), {}, now)).toBe(true);
  });

  it('skips trip_end whose trip_start has not landed yet', () => {
    const mutation = makeMutation({
      type: 'trip_end',
      payload: { clientTripId: 'cli-1' },
    });
    expect(shouldSkipMutation(mutation, {}, now)).toBe(true);
  });

  it('does NOT skip a fresh queued hazard', () => {
    expect(shouldSkipMutation(makeMutation({ type: 'hazard' }), {}, now)).toBe(false);
  });
});

describe('isPermanentError', () => {
  it.each<[number, boolean]>([
    [400, true],
    [401, true],
    [403, true],
    [404, true],
    [409, true],
    [410, true],
    [422, true],
    [499, true],
  ])('marks status %d as permanent', (status, expected) => {
    expect(isPermanentError(httpError(status))).toBe(expected);
  });

  it.each<[number, boolean]>([
    [408, false],
    [429, false],
  ])('treats status %d as transient (retryable)', (status, expected) => {
    expect(isPermanentError(httpError(status))).toBe(expected);
  });

  it.each<[number, boolean]>([
    [500, false],
    [502, false],
    [503, false],
    [504, false],
  ])('treats 5xx %d as transient', (status, expected) => {
    expect(isPermanentError(httpError(status))).toBe(expected);
  });

  it('does NOT mark plain Errors as permanent (timeout / network / runtime)', () => {
    expect(isPermanentError(new Error('Offline sync for trip_end timed out after 30 seconds.'))).toBe(
      false,
    );
    expect(isPermanentError(new Error('Network request failed'))).toBe(false);
  });

  it('does NOT mark ApiClientError(kind=network|timeout) as permanent', () => {
    expect(
      isPermanentError(new ApiClientError({ kind: 'network', message: 'fetch rejected' })),
    ).toBe(false);
    expect(
      isPermanentError(new ApiClientError({ kind: 'timeout', message: 'timed out' })),
    ).toBe(false);
  });

  it('handles non-Error throw values defensively', () => {
    expect(isPermanentError('hello')).toBe(false);
    expect(isPermanentError(null)).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
    expect(isPermanentError({ status: 400 })).toBe(false);
  });
});
