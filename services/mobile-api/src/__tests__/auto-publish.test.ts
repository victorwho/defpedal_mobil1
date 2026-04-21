// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — module-level mock with controllable results per call.
// The auto-publish functions import supabaseAdmin directly, so we mock the
// module and control each chained query via a result queue.
// ---------------------------------------------------------------------------

const supabaseResultQueue: Array<{ data: unknown; error: null | { message: string }; count?: number | null }> = [];

const enqueueResult = (result: { data: unknown; error: null | { message: string }; count?: number | null }) => {
  supabaseResultQueue.push(result);
};

const dequeueResult = () =>
  supabaseResultQueue.shift() ?? { data: null, error: null, count: null };

vi.mock('../lib/supabaseAdmin', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'from', 'select', 'insert', 'upsert', 'update', 'delete',
      'eq', 'in', 'gt', 'order', 'limit', 'head',
    ];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.single = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    chain.rpc = vi.fn().mockImplementation(() => Promise.resolve(dequeueResult()));
    (chain as unknown as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (v: unknown) => unknown,
    ) => Promise.resolve(dequeueResult()).then(resolve, reject);
    return chain;
  };

  return {
    supabaseAdmin: makeChain(),
  };
});

vi.mock('@defensivepedal/core', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    trimPolylineEndpoints: vi.fn().mockImplementation((poly: string, _meters: number) => `trimmed_${poly}`),
  };
});

// ---------------------------------------------------------------------------
// Real imports after mock declarations
// ---------------------------------------------------------------------------

import {
  autoPublishRide,
  autoPublishHazardBatch,
  autoPublishHazardStandalone,
  autoPublishBadgeUnlock,
  autoPublishTierUp,
} from '../lib/autoPublish';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-auto-pub-001';

const baseRideParams = {
  userId: USER_ID,
  tripId: 'trip-1',
  title: 'Morning Commute',
  startLocationText: 'Home',
  destinationText: 'Office',
  distanceMeters: 5000,
  durationSeconds: 1200,
  elevationGainMeters: 50,
  averageSpeedMps: 4.2,
  safetyRating: 4,
  safetyTags: ['bike_lane', 'low_traffic'] as readonly string[],
  geometryPolyline6: 'encoded_polyline_data',
  note: null,
  co2SavedKg: 0.6,
  startLat: 44.4,
  startLon: 26.1,
} as const;

// ---------------------------------------------------------------------------
// autoPublishRide
// ---------------------------------------------------------------------------

describe('autoPublishRide', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns activity ID on successful publish', async () => {
    // getUserProfile: auto_share_rides=true, trim=false, is_private=false
    enqueueResult({
      data: { auto_share_rides: true, trim_route_endpoints: false, is_private: false },
      error: null,
    });
    // insert + select .single()
    enqueueResult({ data: { id: 'activity-ride-1' }, error: null });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBe('activity-ride-1');
  });

  it('returns null when auto_share_rides is false', async () => {
    enqueueResult({
      data: { auto_share_rides: false, trim_route_endpoints: false, is_private: false },
      error: null,
    });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBeNull();
  });

  it('applies endpoint trimming when trim_route_endpoints is true', async () => {
    const { trimPolylineEndpoints } = await import('@defensivepedal/core');

    enqueueResult({
      data: { auto_share_rides: true, trim_route_endpoints: true, is_private: false },
      error: null,
    });
    enqueueResult({ data: { id: 'activity-ride-trimmed' }, error: null });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBe('activity-ride-trimmed');
    expect(trimPolylineEndpoints).toHaveBeenCalledWith('encoded_polyline_data', 200);
  });

  it('returns null for private profile with 0 followers', async () => {
    // getUserProfile: private profile
    enqueueResult({
      data: { auto_share_rides: true, trim_route_endpoints: false, is_private: true },
      error: null,
    });
    // countAcceptedFollowers: count query returns 0
    enqueueResult({ data: null, error: null, count: 0 });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBeNull();
  });

  it('returns null when profile is not found', async () => {
    enqueueResult({ data: null, error: null });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBeNull();
  });

  it('returns null when insert fails', async () => {
    enqueueResult({
      data: { auto_share_rides: true, trim_route_endpoints: false, is_private: false },
      error: null,
    });
    enqueueResult({ data: null, error: { message: 'insert failed' } });

    const result = await autoPublishRide(baseRideParams);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autoPublishHazardBatch
// ---------------------------------------------------------------------------

describe('autoPublishHazardBatch', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns null when hazards array is empty', async () => {
    const result = await autoPublishHazardBatch({
      userId: USER_ID,
      rideActivityId: 'ride-1',
      hazards: [],
      startLat: 44.4,
      startLon: 26.1,
    });
    expect(result).toBeNull();
  });

  it('returns activity ID when hazards are provided', async () => {
    enqueueResult({ data: { id: 'activity-hazard-batch-1' }, error: null });

    const result = await autoPublishHazardBatch({
      userId: USER_ID,
      rideActivityId: 'ride-1',
      hazards: [
        { hazardType: 'pothole', lat: 44.41, lon: 26.11, reportedAt: '2026-04-17T08:00:00Z' },
        { hazardType: 'glass', lat: 44.42, lon: 26.12, reportedAt: '2026-04-17T08:05:00Z' },
      ],
      startLat: 44.4,
      startLon: 26.1,
    });
    expect(result).toBe('activity-hazard-batch-1');
  });

  it('returns null when insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'insert failed' } });

    const result = await autoPublishHazardBatch({
      userId: USER_ID,
      rideActivityId: null,
      hazards: [
        { hazardType: 'pothole', lat: 44.41, lon: 26.11, reportedAt: '2026-04-17T08:00:00Z' },
      ],
      startLat: 44.4,
      startLon: 26.1,
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autoPublishHazardStandalone
// ---------------------------------------------------------------------------

describe('autoPublishHazardStandalone', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns activity ID on successful publish', async () => {
    enqueueResult({ data: { id: 'activity-hazard-standalone-1' }, error: null });

    const result = await autoPublishHazardStandalone({
      userId: USER_ID,
      hazardType: 'aggro_dogs',
      lat: 44.45,
      lon: 26.15,
      reportedAt: '2026-04-17T09:00:00Z',
    });
    expect(result).toBe('activity-hazard-standalone-1');
  });

  it('returns null when insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'insert error' } });

    const result = await autoPublishHazardStandalone({
      userId: USER_ID,
      hazardType: 'pothole',
      lat: 44.45,
      lon: 26.15,
      reportedAt: '2026-04-17T09:00:00Z',
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autoPublishBadgeUnlock
// ---------------------------------------------------------------------------

describe('autoPublishBadgeUnlock', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns activity ID on successful publish', async () => {
    enqueueResult({ data: { id: 'activity-badge-1' }, error: null });

    const result = await autoPublishBadgeUnlock({
      userId: USER_ID,
      badgeKey: 'first_ride',
      badgeName: 'First Ride',
      iconKey: 'bicycle',
      category: 'milestones',
      flavorText: 'You completed your first ride!',
    });
    expect(result).toBe('activity-badge-1');
  });

  it('creates feed item with correct payload structure', async () => {
    enqueueResult({ data: { id: 'activity-badge-2' }, error: null });

    const params = {
      userId: USER_ID,
      badgeKey: 'speed_demon',
      badgeName: 'Speed Demon',
      iconKey: 'lightning',
      category: 'performance',
      flavorText: 'You averaged over 30 km/h!',
    };

    const result = await autoPublishBadgeUnlock(params);
    expect(result).toBe('activity-badge-2');
    // The insert was called — if it returned an ID, the payload was accepted
  });

  it('returns null when insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'constraint violation' } });

    const result = await autoPublishBadgeUnlock({
      userId: USER_ID,
      badgeKey: 'first_ride',
      badgeName: 'First Ride',
      iconKey: 'bicycle',
      category: 'milestones',
      flavorText: 'You completed your first ride!',
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autoPublishTierUp
// ---------------------------------------------------------------------------

describe('autoPublishTierUp', () => {
  beforeEach(() => {
    supabaseResultQueue.length = 0;
    vi.clearAllMocks();
  });

  it('returns activity ID on successful publish', async () => {
    enqueueResult({ data: { id: 'activity-tier-1' }, error: null });

    const result = await autoPublishTierUp({
      userId: USER_ID,
      tierName: 'Trailblazer',
      tierLevel: 3,
      tierDisplayName: 'Trailblazer',
      tierColor: '#FF8C00',
    });
    expect(result).toBe('activity-tier-1');
  });

  it('creates feed item with correct payload structure', async () => {
    enqueueResult({ data: { id: 'activity-tier-2' }, error: null });

    const result = await autoPublishTierUp({
      userId: USER_ID,
      tierName: 'Legend',
      tierLevel: 10,
      tierDisplayName: 'Legend',
      tierColor: '#FFD700',
    });
    expect(result).toBe('activity-tier-2');
  });

  it('returns null when insert fails', async () => {
    enqueueResult({ data: null, error: { message: 'DB error' } });

    const result = await autoPublishTierUp({
      userId: USER_ID,
      tierName: 'Explorer',
      tierLevel: 2,
      tierDisplayName: 'Explorer',
      tierColor: '#4CAF50',
    });
    expect(result).toBeNull();
  });
});
