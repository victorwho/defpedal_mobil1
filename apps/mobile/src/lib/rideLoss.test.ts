import type { QueuedMutation } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { hasUndismissedRideLoss, selectDeadCriticalMutations } from './rideLoss';

const mutation = (
  partial: Partial<QueuedMutation> & Pick<QueuedMutation, 'id' | 'type'>,
): QueuedMutation => ({
  payload: {},
  createdAt: '2026-06-13T00:00:00.000Z',
  retryCount: 0,
  status: 'queued',
  lastError: null,
  ...partial,
});

describe('selectDeadCriticalMutations', () => {
  it('returns only dead trip-critical mutations', () => {
    const mutations: QueuedMutation[] = [
      mutation({ id: 'a', type: 'trip_start', status: 'dead' }),
      mutation({ id: 'b', type: 'trip_end', status: 'queued' }),
      mutation({ id: 'c', type: 'hazard', status: 'dead' }), // not trip-critical
      mutation({ id: 'd', type: 'feedback', status: 'dead' }),
      mutation({ id: 'e', type: 'hazard_vote', status: 'dead' }), // not trip-critical
    ];

    const dead = selectDeadCriticalMutations(mutations);
    expect(dead.map((m) => m.id)).toEqual(['a', 'd']);
  });

  it('returns empty when nothing is dead', () => {
    expect(
      selectDeadCriticalMutations([
        mutation({ id: 'a', type: 'trip_start', status: 'failed' }),
        mutation({ id: 'b', type: 'trip_track', status: 'syncing' }),
      ]),
    ).toEqual([]);
  });
});

describe('hasUndismissedRideLoss', () => {
  it('is true when a dead trip-critical mutation is not dismissed', () => {
    const mutations = [mutation({ id: 'a', type: 'trip_start', status: 'dead' })];
    expect(hasUndismissedRideLoss(mutations, new Set())).toBe(true);
  });

  it('is false when every dead trip-critical mutation is dismissed', () => {
    const mutations = [
      mutation({ id: 'a', type: 'trip_start', status: 'dead' }),
      mutation({ id: 'b', type: 'trip_track', status: 'dead' }),
    ];
    expect(hasUndismissedRideLoss(mutations, new Set(['a', 'b']))).toBe(false);
  });

  it('is true when a new dead mutation appears after a prior dismissal', () => {
    const mutations = [
      mutation({ id: 'a', type: 'trip_start', status: 'dead' }),
      mutation({ id: 'b', type: 'trip_end', status: 'dead' }),
    ];
    // 'a' was dismissed earlier; 'b' is freshly dead and should re-trigger.
    expect(hasUndismissedRideLoss(mutations, new Set(['a']))).toBe(true);
  });

  it('ignores dismissed ids that no longer correspond to dead mutations', () => {
    const mutations = [mutation({ id: 'a', type: 'trip_start', status: 'queued' })];
    expect(hasUndismissedRideLoss(mutations, new Set(['a']))).toBe(false);
  });
});
