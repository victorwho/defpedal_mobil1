import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createQueuedMutation, createClientTripId } from './offlineQueue';

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
});
