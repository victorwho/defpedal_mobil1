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
