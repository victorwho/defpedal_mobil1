import type {
  HazardReportRequest,
  NavigationFeedbackRequest,
  QueuedMutation,
  QueuedMutationType,
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
  trip_start: TripStartRequest;
  trip_end: QueuedTripEndPayload;
  trip_track: QueuedTripTrackPayload;
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
