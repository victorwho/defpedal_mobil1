import type {
  HazardReportRequest,
  HazardVoteDirection,
  HazardVoteQueuePayload,
  NavigationFeedbackRequest,
  QueuedMutation,
  QueuedMutationType,
  ShareTripRequest,
  TripEndRequest,
  TripStartRequest,
  TripTrackRequest,
} from '@defensivepedal/core';

export type QueuedTripEndPayload = Omit<TripEndRequest, 'tripId'> & {
  tripId?: string;
};

export type QueuedTripTrackPayload = Omit<TripTrackRequest, 'tripId'> & {
  tripId?: string;
};

export type QueuedMutationPayloadByType = {
  hazard: HazardReportRequest;
  hazard_vote: HazardVoteQueuePayload;
  trip_start: TripStartRequest;
  trip_end: QueuedTripEndPayload;
  trip_track: QueuedTripTrackPayload;
  trip_share: ShareTripRequest;
  feedback: NavigationFeedbackRequest;
};

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
};

export const createQueuedMutation = <TType extends QueuedMutationType>(
  type: TType,
  payload: QueuedMutationPayloadByType[TType],
): QueuedMutation => ({
  id: createId(type),
  type,
  payload,
  createdAt: new Date().toISOString(),
  retryCount: 0,
  status: 'queued',
  lastError: null,
});

export const createClientTripId = (): string => createId('client-trip');

/**
 * Collapses a pending `hazard_vote` for the same `hazardId` before enqueuing a
 * fresh one. Only drops entries where `status === 'queued'` AND `retryCount === 0`
 * — mutations that are `in_flight` (syncing), `failed`, or have `retryCount > 0`
 * belong to the drain loop and must complete/retry as their own entity; racing
 * with them would break at-least-once delivery.
 *
 * Server is authoritative via the `UNIQUE (hazard_id, user_id)` constraint, so
 * last-write-wins is correct even without this collapse — it's a bandwidth
 * optimization for users who rapid-flip up/down while offline.
 */
export const castHazardVote = (
  queue: readonly QueuedMutation[],
  hazardId: string,
  direction: HazardVoteDirection,
  submittedAt: string = new Date().toISOString(),
): QueuedMutation[] => {
  const filtered = queue.filter((mutation) => {
    if (mutation.type !== 'hazard_vote') return true;
    const payload = mutation.payload as HazardVoteQueuePayload;
    if (payload.hazardId !== hazardId) return true;
    if (mutation.status !== 'queued') return true;
    if (mutation.retryCount !== 0) return true;
    return false;
  });

  const fresh = createQueuedMutation('hazard_vote', {
    hazardId,
    direction,
    clientSubmittedAt: submittedAt,
  });

  return [...filtered, fresh];
};
