// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock supabaseAdmin before importing submissions
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

const { getUserStats, getTripStatsDashboard, deleteTripTrack } = await import('./submissions');

afterEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('getUserStats', () => {
  it('maps the RPC row to a UserStats shape with computed CO2', async () => {
    mockRpc.mockResolvedValue({
      data: [{ total_trips: 10, total_distance_meters: 50000, total_duration_seconds: 7200 }],
      error: null,
    });

    const stats = await getUserStats('user-1');

    expect(mockRpc).toHaveBeenCalledWith('get_user_trip_stats', { requesting_user_id: 'user-1' });
    expect(stats.totalTrips).toBe(10);
    expect(stats.totalDistanceMeters).toBe(50000);
    expect(stats.totalDurationSeconds).toBe(7200);
    // CO2 = 50000m * 120g/km / 1000 = 6.0 kg
    expect(stats.totalCo2SavedKg).toBe(6);
  });

  it('handles a single-object RPC response (non-array)', async () => {
    mockRpc.mockResolvedValue({
      data: { total_trips: 3, total_distance_meters: 12000, total_duration_seconds: 3600 },
      error: null,
    });

    const stats = await getUserStats('user-2');

    expect(stats.totalTrips).toBe(3);
    expect(stats.totalDistanceMeters).toBe(12000);
    expect(stats.totalDurationSeconds).toBe(3600);
  });

  it('returns zero stats when the RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const stats = await getUserStats('user-3');

    expect(stats.totalTrips).toBe(0);
    expect(stats.totalDistanceMeters).toBe(0);
    expect(stats.totalCo2SavedKg).toBe(0);
    expect(stats.totalDurationSeconds).toBe(0);
  });

  it('returns zero stats when the RPC returns an empty array', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const stats = await getUserStats('user-4');

    expect(stats.totalTrips).toBe(0);
    expect(stats.totalDistanceMeters).toBe(0);
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    await expect(getUserStats('user-5')).rejects.toThrow('connection refused');
  });
});

describe('getTripStatsDashboard', () => {
  it('maps RPC data to TripStatsDashboard with per-period totals + mode splits', async () => {
    mockRpc.mockResolvedValue({
      data: {
        totals: { totalTrips: 20, totalDistanceMeters: 100000, totalDurationSeconds: 28800 },
        weeklyTotals: { totalTrips: 4, totalDistanceMeters: 18000, totalDurationSeconds: 5400 },
        monthlyTotals: { totalTrips: 10, totalDistanceMeters: 48000, totalDurationSeconds: 14400 },
        weekly: [
          { period_start: '2026-03-30', trips: 3, distance_meters: 15000, duration_seconds: 5400 },
          { period_start: '2026-03-31', trips: 2, distance_meters: 8000, duration_seconds: 3600 },
        ],
        monthly: [
          { period_start: '2026-03-01', trips: 10, distance_meters: 48000, duration_seconds: 14400 },
        ],
        currentStreakDays: 5,
        longestStreakDays: 14,
        modeSplit: { safeTrips: 15, fastTrips: 5 },
        weeklyModeSplit: { safeTrips: 3, fastTrips: 1 },
        monthlyModeSplit: { safeTrips: 7, fastTrips: 3 },
      },
      error: null,
    });

    const dashboard = await getTripStatsDashboard('user-1');

    expect(mockRpc).toHaveBeenCalledWith('get_trip_stats_dashboard', { requesting_user_id: 'user-1', time_zone: 'UTC' });

    // Lifetime totals
    expect(dashboard.totals.totalTrips).toBe(20);
    expect(dashboard.totals.totalDistanceMeters).toBe(100000);
    expect(dashboard.totals.totalCo2SavedKg).toBe(12);
    expect(dashboard.totals.totalDurationSeconds).toBe(28800);

    // Period-scoped totals (per-period CO2 derived from per-period distance)
    expect(dashboard.weeklyTotals.totalTrips).toBe(4);
    expect(dashboard.weeklyTotals.totalDistanceMeters).toBe(18000);
    // 18000m * 120g/km / 1000 = 2.16 kg
    expect(dashboard.weeklyTotals.totalCo2SavedKg).toBeCloseTo(2.16, 5);

    expect(dashboard.monthlyTotals.totalTrips).toBe(10);
    expect(dashboard.monthlyTotals.totalDistanceMeters).toBe(48000);
    // 48000m * 120g/km / 1000 = 5.76 kg
    expect(dashboard.monthlyTotals.totalCo2SavedKg).toBeCloseTo(5.76, 5);

    // Weekly buckets: period_start → periodStart
    expect(dashboard.weekly).toHaveLength(2);
    expect(dashboard.weekly[0]).toEqual({
      periodStart: '2026-03-30',
      trips: 3,
      distanceMeters: 15000,
      durationSeconds: 5400,
    });

    // Monthly buckets
    expect(dashboard.monthly).toHaveLength(1);
    expect(dashboard.monthly[0].periodStart).toBe('2026-03-01');

    expect(dashboard.currentStreakDays).toBe(5);
    expect(dashboard.longestStreakDays).toBe(14);

    // Mode splits — one per period
    expect(dashboard.modeSplit).toEqual({ safeTrips: 15, fastTrips: 5 });
    expect(dashboard.weeklyModeSplit).toEqual({ safeTrips: 3, fastTrips: 1 });
    expect(dashboard.monthlyModeSplit).toEqual({ safeTrips: 7, fastTrips: 3 });
  });

  it('returns empty dashboard when the RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const dashboard = await getTripStatsDashboard('user-2');

    expect(dashboard.totals.totalTrips).toBe(0);
    expect(dashboard.weeklyTotals.totalTrips).toBe(0);
    expect(dashboard.monthlyTotals.totalTrips).toBe(0);
    expect(dashboard.weekly).toEqual([]);
    expect(dashboard.monthly).toEqual([]);
    expect(dashboard.currentStreakDays).toBe(0);
    expect(dashboard.longestStreakDays).toBe(0);
    expect(dashboard.modeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
    expect(dashboard.weeklyModeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
    expect(dashboard.monthlyModeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
  });

  it('handles missing optional fields with safe defaults', async () => {
    mockRpc.mockResolvedValue({
      data: {
        totals: { totalTrips: 1, totalDistanceMeters: 5000, totalDurationSeconds: 900 },
        // weeklyTotals / monthlyTotals deliberately absent — should default to zero
        weekly: null,
        monthly: null,
        currentStreakDays: undefined,
        longestStreakDays: undefined,
        modeSplit: null,
      },
      error: null,
    });

    const dashboard = await getTripStatsDashboard('user-3');

    expect(dashboard.totals.totalTrips).toBe(1);
    expect(dashboard.weeklyTotals.totalTrips).toBe(0);
    expect(dashboard.monthlyTotals.totalTrips).toBe(0);
    expect(dashboard.weekly).toEqual([]);
    expect(dashboard.monthly).toEqual([]);
    expect(dashboard.currentStreakDays).toBe(0);
    expect(dashboard.longestStreakDays).toBe(0);
    expect(dashboard.modeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
    expect(dashboard.weeklyModeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
    expect(dashboard.monthlyModeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    });

    await expect(getTripStatsDashboard('user-4')).rejects.toThrow('function not found');
  });
});

describe('deleteTripTrack', () => {
  /**
   * The function does up to three `from(...).delete().eq().eq()...` chains in
   * sequence: trip_tracks (with .select), trip_shares, and activity_feed.
   * The helper wires `mockFrom` to dispatch by table name and records every
   * `.eq()` call against each table.
   */
  type ChainResult = { data: Array<Record<string, unknown>> | null; error: { message: string } | null };

  const buildChains = (results: {
    trip_tracks: ChainResult;
    trip_shares?: ChainResult;
    activity_feed?: ChainResult;
  }) => {
    const calls: Record<string, Array<{ field: string; value: unknown }>> = {
      trip_tracks: [],
      trip_shares: [],
      activity_feed: [],
    };

    const buildTripTracksChain = () => {
      const select = vi.fn().mockResolvedValue(results.trip_tracks);
      const eqUser = vi.fn((field: string, value: unknown) => {
        calls.trip_tracks.push({ field, value });
        return { select };
      });
      const eqId = vi.fn((field: string, value: unknown) => {
        calls.trip_tracks.push({ field, value });
        return { eq: eqUser };
      });
      const del = vi.fn(() => ({ eq: eqId }));
      return { delete: del };
    };

    const buildSimpleDeleteChain = (table: 'trip_shares' | 'activity_feed') => {
      const final = Promise.resolve(results[table] ?? { data: [], error: null });
      const eq3: Record<string, unknown> = { ...final, then: final.then.bind(final) };
      const eq2 = vi.fn((field: string, value: unknown) => {
        calls[table].push({ field, value });
        // For trip_shares (2 eq calls) the second eq is terminal; for
        // activity_feed (3 eq calls) we hand back another eq.
        return table === 'trip_shares' ? final : { eq: vi.fn((f: string, v: unknown) => { calls[table].push({ field: f, value: v }); return final; }) };
      });
      const _eq1 = eq2;
      const eq1 = vi.fn((field: string, value: unknown) => {
        calls[table].push({ field, value });
        return { eq: _eq1 };
      });
      const del = vi.fn(() => ({ eq: eq1 }));
      // Suppress unused-warning for eq3
      void eq3;
      return { delete: del };
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_tracks') return buildTripTracksChain();
      if (table === 'trip_shares') return buildSimpleDeleteChain('trip_shares');
      if (table === 'activity_feed') return buildSimpleDeleteChain('activity_feed');
      throw new Error(`Unexpected table: ${table}`);
    });

    return { calls };
  };

  it('deletes trip_tracks, trip_shares, and activity_feed entries for the same trip', async () => {
    const { calls } = buildChains({
      trip_tracks: { data: [{ id: 'track-1', trip_id: 'trip-A' }], error: null },
    });

    const result = await deleteTripTrack('track-1', 'user-1');

    expect(result).toEqual({ status: 'deleted' });
    // trip_tracks scoped on id + user_id
    expect(calls.trip_tracks).toEqual([
      { field: 'id', value: 'track-1' },
      { field: 'user_id', value: 'user-1' },
    ]);
    // trip_shares scoped on user_id + parent trip_id
    expect(calls.trip_shares).toEqual([
      { field: 'user_id', value: 'user-1' },
      { field: 'trip_id', value: 'trip-A' },
    ]);
    // activity_feed scoped on user_id + type='ride' + payload->>tripId
    expect(calls.activity_feed).toEqual([
      { field: 'user_id', value: 'user-1' },
      { field: 'type', value: 'ride' },
      { field: 'payload->>tripId', value: 'trip-A' },
    ]);
  });

  it('returns not_found when no trip_tracks row matches (e.g. wrong user)', async () => {
    const { calls } = buildChains({
      trip_tracks: { data: [], error: null },
    });

    const result = await deleteTripTrack('track-2', 'user-2');

    expect(result).toEqual({ status: 'not_found' });
    // Skip the share + activity_feed cleanup when the trip isn't ours.
    expect(calls.trip_shares).toEqual([]);
    expect(calls.activity_feed).toEqual([]);
  });

  it('treats null data as not_found and skips downstream cleanups', async () => {
    const { calls } = buildChains({
      trip_tracks: { data: null, error: null },
    });

    const result = await deleteTripTrack('track-3', 'user-3');

    expect(result).toEqual({ status: 'not_found' });
    expect(calls.trip_shares).toEqual([]);
    expect(calls.activity_feed).toEqual([]);
  });

  it('throws when the trip_tracks delete returns an error', async () => {
    buildChains({
      trip_tracks: { data: null, error: { message: 'connection refused' } },
    });

    await expect(deleteTripTrack('track-4', 'user-4')).rejects.toThrow('connection refused');
  });

  it('throws (502 surface) when the trip_shares cleanup fails', async () => {
    buildChains({
      trip_tracks: { data: [{ id: 'track-5', trip_id: 'trip-B' }], error: null },
      trip_shares: { data: null, error: { message: 'fk violation' } },
    });

    await expect(deleteTripTrack('track-5', 'user-5')).rejects.toThrow(/trip_shares cleanup failed/);
  });

  it('throws (502 surface) when the activity_feed cleanup fails', async () => {
    buildChains({
      trip_tracks: { data: [{ id: 'track-6', trip_id: 'trip-C' }], error: null },
      activity_feed: { data: null, error: { message: 'permission denied' } },
    });

    await expect(deleteTripTrack('track-6', 'user-6')).rejects.toThrow(/activity_feed cleanup failed/);
  });

  it('skips share and activity cleanup when the deleted row has a null trip_id (legacy data)', async () => {
    const { calls } = buildChains({
      trip_tracks: { data: [{ id: 'track-legacy', trip_id: null }], error: null },
    });

    const result = await deleteTripTrack('track-legacy', 'user-legacy');

    expect(result).toEqual({ status: 'deleted' });
    // No parent trip_id ⇒ nothing to clean up downstream.
    expect(calls.trip_shares).toEqual([]);
    expect(calls.activity_feed).toEqual([]);
  });
});
