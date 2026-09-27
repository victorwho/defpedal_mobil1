import type {
  CitySuggestionRequest,
  HazardReportRequest,
  HazardVoteDirection,
  HazardVoteQueuePayload,
  NavigationFeedbackRequest,
  QueuedMutation,
  SesizareRequest,
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
  city_suggestion: CitySuggestionRequest;
  sesizare: SesizareRequest;
};

/**
 * Id for a queued mutation. Opaque — nothing parses it beyond the prefix.
 *
 * ⚠️ This is an IDEMPOTENCY KEY, not just a label. `hazard` mutations send it as
 * `clientHazardId` and `trip_start` sends its own as `client_trip_id`, and the
 * server deduplicates on both. So its uniqueness is a data-integrity property.
 *
 * ⚠️ The fallback branch is the one that actually runs on device. Confirmed from
 * production data 2026-09-27: the first real hazard reported through this path
 * carried `hazard-1790529134544-2912`, i.e. `crypto.randomUUID` is NOT available
 * in this React Native runtime and never has been.
 *
 * That old fallback was `Date.now()` plus a random integer 0-10000 — about 13
 * bits of entropy inside a millisecond. `hazards_client_hazard_id_key` is unique
 * on the id ALONE (deliberately: `user_id` is nullable on that endpoint, and a
 * NULL in a composite NULLS DISTINCT index would leave unauthenticated reports
 * undeduplicated), so two riders reporting in the same millisecond who drew the
 * same number would collide — and the loser's hazard would be DROPPED as a
 * duplicate, silently. Vanishingly unlikely at today's volume, but silent data
 * loss is the failure mode that hides, so the entropy is worth more than the
 * 10001 values it had.
 *
 * ~51 bits from the random mantissa instead. Deliberately NOT expo-crypto: it is
 * a native module, which would need the lazy `require` + `hasExpoNativeModule`
 * guard this codebase mandates (error-log #2b/#21b), and that is a lot of
 * machinery for something `Math.random` settles.
 */
/**
 * The branch that ACTUALLY RUNS ON DEVICE, split out so it can be tested.
 *
 * ⚠️ Under vitest (Node) `crypto.randomUUID` exists, so a test calling
 * `createQueuedMutation` takes the UUID branch above and never reaches this one.
 * The first version of the collision test did exactly that and passed happily
 * against the old 13-bit fallback — it was exercising a path that never runs on a
 * phone, which is the same blind spot that let a crash ship in RankUpOverlay.
 * Exported for tests for that reason, not because anything else should call it.
 */
export const createFallbackId = (prefix: string): string => {
  const entropy = `${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  return `${prefix}-${Date.now()}-${entropy}`;
};

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return createFallbackId(prefix);
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
