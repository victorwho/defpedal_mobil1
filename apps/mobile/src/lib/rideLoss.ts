/**
 * Ride-loss recovery helpers.
 *
 * When a trip-critical mutation (`trip_start` / `trip_end` / `trip_track` /
 * `feedback`) exhausts its retries it is marked `dead` and never re-attempted.
 * A dead `trip_start` additionally cascade-kills its dependent `trip_end` /
 * `trip_track`, so the rider silently loses the whole server-side record of a
 * ride. Before the review (2026-06-12) the only recovery path was the dev-only
 * Diagnostics screen; these pure selectors back a user-facing recovery banner
 * (`RideLossBanner`) that surfaces the loss and offers a one-tap retry.
 *
 * Kept pure (no React, no store) so the dead-detection / dismissal logic is
 * unit-testable in isolation.
 */
import type { QueuedMutation } from '@defensivepedal/core';

import { TRIP_CRITICAL_TYPES } from '../store/queueSlice';

/** Dead mutations whose loss represents lost ride data worth surfacing. */
export const selectDeadCriticalMutations = (
  mutations: readonly QueuedMutation[],
): QueuedMutation[] =>
  mutations.filter(
    (mutation) =>
      mutation.status === 'dead' && TRIP_CRITICAL_TYPES.has(mutation.type),
  );

/**
 * Whether the ride-loss banner should be shown: there is at least one dead
 * trip-critical mutation the user has not already dismissed this session.
 */
export const hasUndismissedRideLoss = (
  mutations: readonly QueuedMutation[],
  dismissedIds: ReadonlySet<string>,
): boolean =>
  selectDeadCriticalMutations(mutations).some(
    (mutation) => !dismissedIds.has(mutation.id),
  );
