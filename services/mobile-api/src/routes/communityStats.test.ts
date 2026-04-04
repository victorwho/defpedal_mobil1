// @vitest-environment node
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

// Mock supabaseAdmin before any imports that use it
vi.mock('../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              range: vi.fn(() => Promise.resolve({ data: [], error: null })),
              then: vi.fn(),
            })),
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        gte: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  },
}));

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const mockRpc = vi.mocked(supabaseAdmin!.rpc);

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({
    dependencies: {
      authenticateUser: async () => ({ id: 'test-user', email: 'test@test.com' }),
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /community/stats', () => {
  it('returns community stats for valid coordinates', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          total_trips: 42,
          total_distance_meters: 150_000,
          total_duration_seconds: 36_000,
          unique_riders: 8,
        },
      ],
      error: null,
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toEqual({
      localityName: null,
      totalTrips: 42,
      totalDistanceMeters: 150_000,
      totalDurationSeconds: 36_000,
      totalCo2SavedKg: 18,
      uniqueRiders: 8,
    });

    expect(mockRpc).toHaveBeenCalledWith('get_community_stats', {
      user_lat: 44.43,
      user_lon: 26.10,
      radius_meters: 15_000,
    });
  });

  it('accepts optional radiusKm parameter', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          total_trips: 10,
          total_distance_meters: 50_000,
          total_duration_seconds: 12_000,
          unique_riders: 3,
        },
      ],
      error: null,
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10&radiusKm=30',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);

    expect(mockRpc).toHaveBeenCalledWith('get_community_stats', {
      user_lat: 44.43,
      user_lon: 26.10,
      radius_meters: 30_000,
    });
  });

  it('returns 502 when the database query fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection refused' },
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.error).toBe('Community stats query failed.');
  });

  it('returns 401 without authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for missing required query parameters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for out-of-range latitude', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=91&lon=26.10',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns zeros when the RPC returns null row', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [null],
      error: null,
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.totalTrips).toBe(0);
    expect(body.totalDistanceMeters).toBe(0);
    expect(body.totalDurationSeconds).toBe(0);
    expect(body.totalCo2SavedKg).toBe(0);
    expect(body.uniqueRiders).toBe(0);
  });

  it('calculates CO2 from total distance using EU average 120g/km', async () => {
    // 10 km = 10,000 m → 10 * 0.12 = 1.2 kg
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          total_trips: 1,
          total_distance_meters: 10_000,
          total_duration_seconds: 1800,
          unique_riders: 1,
        },
      ],
      error: null,
    } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/community/stats?lat=44.43&lon=26.10',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().totalCo2SavedKg).toBe(1.2);
  });
});
