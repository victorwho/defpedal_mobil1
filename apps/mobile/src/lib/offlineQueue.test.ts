import type { QueuedMutation, HazardVoteQueuePayload } from '@defensivepedal/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { castHazardVote, createQueuedMutation, createClientTripId } from './offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createQueuedMutation', () => {
    it('creates a hazard mutation with correct shape', () => {
      const payload = {
        lat: 44.43,
        lon: 26.1,
        type: 'pothole' as const,
        severity: 'medium' as const,
      };

      const mutation = createQueuedMutation('hazard', payload as any);

      expect(mutation.id).toMatch(/^hazard-/);
      expect(mutation.type).toBe('hazard');
      expect(mutation.payload).toEqual(payload);
      expect(mutation.retryCount).toBe(0);
      expect(mutation.status).toBe('queued');
      expect(mutation.lastError).toBeNull();
      expect(mutation.createdAt).toBeDefined();
      // createdAt should be a valid ISO date
      expect(() => new Date(mutation.createdAt)).not.toThrow();
    });

    it('creates a trip_start mutation', () => {
      const payload = {
        routeId: 'route-123',
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.11 },
      };

      const mutation = createQueuedMutation('trip_start', payload as any);

      expect(mutation.id).toMatch(/^trip_start-/);
      expect(mutation.type).toBe('trip_start');
      expect(mutation.payload).toEqual(payload);
      expect(mutation.status).toBe('queued');
    });

    it('creates a trip_end mutation', () => {
      const payload = {
        distanceMeters: 5000,
        durationSeconds: 1200,
      };

      const mutation = createQueuedMutation('trip_end', payload as any);

      expect(mutation.id).toMatch(/^trip_end-/);
      expect(mutation.type).toBe('trip_end');
    });

    it('creates a trip_track mutation', () => {
      const payload = {
        points: [{ lat: 44.43, lon: 26.1, timestamp: new Date().toISOString() }],
      };

      const mutation = createQueuedMutation('trip_track', payload as any);

      expect(mutation.id).toMatch(/^trip_track-/);
      expect(mutation.type).toBe('trip_track');
    });

    it('creates a trip_share mutation', () => {
      const payload = {
        tripId: 'trip-123',
        caption: 'Great ride!',
      };

      const mutation = createQueuedMutation('trip_share', payload as any);

      expect(mutation.id).toMatch(/^trip_share-/);
      expect(mutation.type).toBe('trip_share');
    });

    it('creates a feedback mutation', () => {
      const payload = {
        tripId: 'trip-123',
        rating: 4,
        comment: 'Good route',
      };

      const mutation = createQueuedMutation('feedback', payload as any);

      expect(mutation.id).toMatch(/^feedback-/);
      expect(mutation.type).toBe('feedback');
    });

    it('generates unique IDs for each mutation', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const mutation = createQueuedMutation('hazard', {} as any);
        ids.add(mutation.id);
      }
      expect(ids.size).toBe(50);
    });

    it('uses crypto.randomUUID when available', () => {
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(mockUuid as `${string}-${string}-${string}-${string}-${string}`);

      const mutation = createQueuedMutation('hazard', {} as any);

      expect(mutation.id).toBe(`hazard-${mockUuid}`);
    });
  });

  describe('createClientTripId', () => {
    it('creates an ID prefixed with client-trip-', () => {
      const id = createClientTripId();

      expect(id).toMatch(/^client-trip-/);
    });

    it('generates unique IDs', () => {
      const id1 = createClientTripId();
      const id2 = createClientTripId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('castHazardVote', () => {
    const makeVote = (
      hazardId: string,
      direction: 'up' | 'down',
      overrides: Partial<QueuedMutation> = {},
    ): QueuedMutation => ({
      id: `hazard_vote-${hazardId}-${direction}-${Math.random()}`,
      type: 'hazard_vote',
      payload: {
        hazardId,
        direction,
        clientSubmittedAt: new Date().toISOString(),
      } as HazardVoteQueuePayload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'queued',
      lastError: null,
      ...overrides,
    });

    it('appends a fresh entry when queue has no pending vote for the hazard', () => {
      const next = castHazardVote([], 'haz-1', 'up');

      expect(next).toHaveLength(1);
      expect(next[0].type).toBe('hazard_vote');
      expect((next[0].payload as HazardVoteQueuePayload).hazardId).toBe('haz-1');
      expect((next[0].payload as HazardVoteQueuePayload).direction).toBe('up');
    });

    it('collapses a prior queued, retryCount=0 vote for the SAME hazard', () => {
      const old = makeVote('haz-1', 'up');
      const next = castHazardVote([old], 'haz-1', 'down');

      expect(next).toHaveLength(1);
      expect(next[0].id).not.toBe(old.id);
      expect((next[0].payload as HazardVoteQueuePayload).direction).toBe('down');
    });

    it('preserves a queued vote for a DIFFERENT hazard', () => {
      const other = makeVote('haz-2', 'up');
      const next = castHazardVote([other], 'haz-1', 'down');

      expect(next).toHaveLength(2);
      expect(next[0]).toBe(other);
    });

    it('does NOT collapse a vote that is syncing (in-flight)', () => {
      const inFlight = makeVote('haz-1', 'up', { status: 'syncing' });
      const next = castHazardVote([inFlight], 'haz-1', 'down');

      expect(next).toHaveLength(2);
      // The in-flight mutation must be preserved so the drain loop owns it.
      expect(next[0]).toBe(inFlight);
    });

    it('does NOT collapse a vote that has retryCount > 0', () => {
      const retried = makeVote('haz-1', 'up', { retryCount: 2, status: 'failed' });
      const next = castHazardVote([retried], 'haz-1', 'down');

      expect(next).toHaveLength(2);
      expect(next[0]).toBe(retried);
    });

    it('does NOT collapse a vote that is failed with retryCount === 0 (defensive)', () => {
      // Shouldn't happen in practice (failed always bumps retryCount) but be safe.
      const failed = makeVote('haz-1', 'up', { status: 'failed' });
      const next = castHazardVote([failed], 'haz-1', 'down');

      // Status gate: only 'queued' is collapsed.
      expect(next).toHaveLength(2);
    });

    it('does NOT mutate the input queue', () => {
      const first = makeVote('haz-1', 'up');
      const queue = [first];
      const next = castHazardVote(queue, 'haz-1', 'down');

      expect(queue).toHaveLength(1);
      expect(queue[0]).toBe(first);
      expect(next).not.toBe(queue);
    });

    it('preserves non-hazard_vote mutations in the queue', () => {
      const tripStart: QueuedMutation = {
        id: 'trip_start-abc',
        type: 'trip_start',
        payload: {} as never,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'queued',
      };
      const oldVote = makeVote('haz-1', 'up');
      const next = castHazardVote([tripStart, oldVote], 'haz-1', 'down');

      expect(next).toHaveLength(2);
      expect(next[0]).toBe(tripStart);
      expect(next[1].type).toBe('hazard_vote');
      expect((next[1].payload as HazardVoteQueuePayload).direction).toBe('down');
    });
  });
});
