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

const { getUserStats, getTripStatsDashboard } = await import('./submissions');

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
  it('maps RPC data to TripStatsDashboard with bucket normalization', async () => {
    mockRpc.mockResolvedValue({
      data: {
        totals: { totalTrips: 20, totalDistanceMeters: 100000, totalDurationSeconds: 28800 },
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
      },
      error: null,
    });

    const dashboard = await getTripStatsDashboard('user-1');

    expect(mockRpc).toHaveBeenCalledWith('get_trip_stats_dashboard', { requesting_user_id: 'user-1', time_zone: 'UTC' });
    expect(dashboard.totals.totalTrips).toBe(20);
    expect(dashboard.totals.totalDistanceMeters).toBe(100000);
    // CO2 = 100000m * 120g/km / 1000 = 12.0 kg
    expect(dashboard.totals.totalCo2SavedKg).toBe(12);
    expect(dashboard.totals.totalDurationSeconds).toBe(28800);

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
    expect(dashboard.modeSplit).toEqual({ safeTrips: 15, fastTrips: 5 });
  });

  it('returns empty dashboard when the RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const dashboard = await getTripStatsDashboard('user-2');

    expect(dashboard.totals.totalTrips).toBe(0);
    expect(dashboard.weekly).toEqual([]);
    expect(dashboard.monthly).toEqual([]);
    expect(dashboard.currentStreakDays).toBe(0);
    expect(dashboard.longestStreakDays).toBe(0);
    expect(dashboard.modeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
  });

  it('handles missing optional fields with safe defaults', async () => {
    mockRpc.mockResolvedValue({
      data: {
        totals: { totalTrips: 1, totalDistanceMeters: 5000, totalDurationSeconds: 900 },
        weekly: null,
        monthly: null,
        currentStreakDays: undefined,
        longestStreakDays: undefined,
        modeSplit: null,
      },
      error: null,
    });

    const dashboard = await getTripStatsDashboard('user-3');

    expect(dashboard.weekly).toEqual([]);
    expect(dashboard.monthly).toEqual([]);
    expect(dashboard.currentStreakDays).toBe(0);
    expect(dashboard.longestStreakDays).toBe(0);
    expect(dashboard.modeSplit).toEqual({ safeTrips: 0, fastTrips: 0 });
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    });

    await expect(getTripStatsDashboard('user-4')).rejects.toThrow('function not found');
  });
});
