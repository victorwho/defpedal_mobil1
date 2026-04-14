// @vitest-environment node
import type { RouteResponse } from '@defensivepedal/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app';
import { authenticateDeveloperBypassToken } from '../lib/auth';

const sampleRouteResponse: RouteResponse = {
  code: 'Ok',
  waypoints: [],
  routes: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [26.1025, 44.4268],
          [26.0989, 44.4301],
          [26.0946, 44.4378],
        ],
      },
      distance: 2100,
      duration: 620,
      weight_name: 'routability',
      weight: 37,
      legs: [
        {
          summary: 'Calea Victoriei',
          weight: 37,
          duration: 620,
          distance: 2100,
          steps: [
            {
              intersections: [],
              maneuver: {
                bearing_after: 12,
                bearing_before: 0,
                location: [26.1025, 44.4268],
                type: 'depart',
              },
              name: 'Start Street',
              duration: 120,
              distance: 400,
              driving_side: 'right',
              weight: 10,
              mode: 'cycling',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [26.1025, 44.4268],
                  [26.0989, 44.4301],
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

const mockAuthenticateUser = vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@test.local' });

const createApp = (dependencies: Parameters<typeof buildApp>[0]['dependencies'] = {}) =>
  buildApp({
    dependencies: {
      authenticateUser: mockAuthenticateUser,
      ...dependencies,
    },
  });

const authHeader = {
  authorization: 'Bearer test-access-token',
};

afterEach(async () => {
  vi.restoreAllMocks();
});

describe('mobile-api v1 routes', () => {
  it('authenticates a matching developer bypass bearer token only when enabled', () => {
    expect(
      authenticateDeveloperBypassToken('local-dev-token', {
        enabled: true,
        token: 'local-dev-token',
        userId: 'dev-auth-user',
        email: 'developer@example.com',
      }),
    ).toEqual({
      id: 'dev-auth-user',
      email: 'developer@example.com',
    });

    expect(
      authenticateDeveloperBypassToken('wrong-token', {
        enabled: true,
        token: 'local-dev-token',
        userId: 'dev-auth-user',
        email: 'developer@example.com',
      }),
    ).toBeNull();
  });

  it('reports the active shared-store backend from the health endpoint', async () => {
    const app = createApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        service: 'mobile-api',
        sharedStoreBackend: 'memory',
      });
    } finally {
      await app.close();
    }
  });

  it('rejects invalid coverage queries with a validation error payload', async () => {
    const app = createApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/coverage?lat=abc&lon=26.1',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Request validation failed.',
        code: 'VALIDATION_ERROR',
        details: ['querystring.lat: must be number'],
      });
    } finally {
      await app.close();
    }
  });

  it('returns a normalized safe-route preview using injected routing dependencies', async () => {
    const fetchSafeRoutes = vi.fn().mockResolvedValue(sampleRouteResponse);
    const getElevationProfile = vi.fn().mockResolvedValue([80, 96, 108]);
    const fetchRiskSegments = vi.fn().mockResolvedValue([
      {
        id: 'risk-1',
        riskScore: 18,
        riskCategory: 'Very safe',
        color: '#4CAF50',
        geometry: {
          type: 'LineString',
          coordinates: [
            [26.1025, 44.4268],
            [26.0946, 44.4378],
          ],
        },
      },
    ]);
    const app = createApp({
      fetchSafeRoutes,
      getElevationProfile,
      fetchRiskSegments,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/routes/preview',
        headers: authHeader,
        payload: {
          origin: {
            lat: 44.4268,
            lon: 26.1025,
          },
          startOverride: {
            lat: 44.4315,
            lon: 26.0872,
          },
          destination: {
            lat: 44.4378,
            lon: 26.0946,
          },
          mode: 'safe',
          countryHint: 'RO',
          debug: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchSafeRoutes).toHaveBeenCalledWith({
        origin: {
          lat: 44.4315,
          lon: 26.0872,
        },
        destination: {
          lat: 44.4378,
          lon: 26.0946,
        },
        avoidUnpaved: false,
        avoidHills: false,
      });

      const payload = response.json();
      expect(payload.selectedMode).toBe('safe');
      expect(payload.coverage).toMatchObject({
        countryCode: 'RO',
        status: 'supported',
        safeRouting: true,
        fastRouting: true,
      });
      expect(payload.routes).toHaveLength(1);
      expect(payload.routes[0]).toMatchObject({
        id: 'safe-1',
        source: 'custom_osrm',
        distanceMeters: 2100,
        durationSeconds: 620,
        totalClimbMeters: 28,
      });
      expect(payload.routes[0].warnings).toEqual([]);
      expect(payload.routes[0].riskSegments).toHaveLength(1);
      expect(payload.debug).toEqual([
        {
          routeId: 'safe-1',
          source: 'custom_osrm',
          routingProfileVersion: 'safety-profile-v1',
          selectedAlternativeIndex: 0,
          totalRiskScore: 37,
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns a normalized fast-route preview using the mapbox dependency path', async () => {
    const fetchFastRoutes = vi.fn().mockResolvedValue(sampleRouteResponse);
    const app = createApp({
      fetchFastRoutes,
      getElevationProfile: vi.fn().mockResolvedValue([80, 96, 108]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 28, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/routes/preview',
        headers: authHeader,
        payload: {
          origin: {
            lat: 44.4268,
            lon: 26.1025,
          },
          destination: {
            lat: 44.4378,
            lon: 26.0946,
          },
          mode: 'fast',
          countryHint: 'RO',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchFastRoutes).toHaveBeenCalledWith(
        {
          lat: 44.4268,
          lon: 26.1025,
        },
        {
          lat: 44.4378,
          lon: 26.0946,
        },
      );

      const payload = response.json();
      expect(payload.selectedMode).toBe('fast');
      expect(payload.routes).toHaveLength(1);
      expect(payload.routes[0]).toMatchObject({
        id: 'fast-1',
        source: 'mapbox',
        routingEngineVersion: 'mapbox-directions-cycling-v5',
        routingProfileVersion: 'mapbox-cycling',
      });
    } finally {
      await app.close();
    }
  });

  it('caches identical route preview responses within the configured ttl', async () => {
    const fetchSafeRoutes = vi.fn().mockResolvedValue(sampleRouteResponse);
    const app = createApp({
      fetchSafeRoutes,
      getElevationProfile: vi.fn().mockResolvedValue([80, 96, 108]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 28, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      routeResponseCacheTtlMs: {
        preview: 60000,
        reroute: 15000,
      },
    });

    const payload = {
      origin: {
        lat: 44.4268,
        lon: 26.1025,
      },
      destination: {
        lat: 44.4378,
        lon: 26.0946,
      },
      mode: 'safe',
      countryHint: 'RO',
    };

    try {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/routes/preview',
        headers: authHeader,
        payload,
      });

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/v1/routes/preview',
        headers: authHeader,
        payload,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(firstResponse.headers['x-route-cache']).toBe('MISS');
      expect(secondResponse.headers['x-route-cache']).toBe('HIT');
      expect(fetchSafeRoutes).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('ignores the custom start override when handling reroute requests', async () => {
    const fetchSafeRoutes = vi.fn().mockResolvedValue(sampleRouteResponse);
    const app = createApp({
      fetchSafeRoutes,
      getElevationProfile: vi.fn().mockResolvedValue([80, 96, 108]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 28, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/routes/reroute',
        headers: authHeader,
        payload: {
          origin: {
            lat: 44.4268,
            lon: 26.1025,
          },
          startOverride: {
            lat: 44.4315,
            lon: 26.0872,
          },
          destination: {
            lat: 44.4378,
            lon: 26.0946,
          },
          mode: 'safe',
          countryHint: 'RO',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchSafeRoutes).toHaveBeenCalledWith({
        origin: {
          lat: 44.4268,
          lon: 26.1025,
        },
        destination: {
          lat: 44.4378,
          lon: 26.0946,
        },
        avoidUnpaved: false,
        avoidHills: false,
      });
    } finally {
      await app.close();
    }
  });

  it('rate limits reroute requests after the configured threshold', async () => {
    const app = createApp({
      fetchSafeRoutes: vi.fn().mockResolvedValue(sampleRouteResponse),
      getElevationProfile: vi.fn().mockResolvedValue([80, 96, 108]),
      getElevationGain: vi.fn().mockResolvedValue({ elevationGain: 28, elevationLoss: 0 }),
      fetchRiskSegments: vi.fn().mockResolvedValue([]),
      rateLimitPolicies: {
        routePreview: {
          limit: 30,
          windowMs: 60000,
        },
        routeReroute: {
          limit: 1,
          windowMs: 60000,
        },
        write: {
          limit: 20,
          windowMs: 60000,
        },
      },
    });

    const payload = {
      origin: {
        lat: 44.4268,
        lon: 26.1025,
      },
      destination: {
        lat: 44.4378,
        lon: 26.0946,
      },
      mode: 'safe',
      countryHint: 'RO',
    };

    try {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/routes/reroute',
        headers: authHeader,
        payload,
      });

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/v1/routes/reroute',
        headers: authHeader,
        payload,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(429);
      expect(secondResponse.headers['x-ratelimit-remaining']).toBe('0');
      expect(secondResponse.json()).toMatchObject({
        error: 'Rate limit exceeded for this endpoint.',
        code: 'RATE_LIMITED',
      });
    } finally {
      await app.close();
    }
  });

  it('normalizes autocomplete payloads before forwarding them upstream', async () => {
    const forwardGeocode = vi.fn().mockResolvedValue([
      {
        id: 'place.1',
        label: 'Piata Victoriei, Bucharest',
        primaryText: 'Piata Victoriei',
        coordinates: {
          lat: 44.4521,
          lon: 26.0865,
        },
      },
    ]);
    const app = createApp({
      forwardGeocode,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/search/autocomplete',
        payload: {
          query: '  Piata Victoriei  ',
          countryHint: 'RO',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(forwardGeocode).toHaveBeenCalledWith({
        query: 'Piata Victoriei',
        locale: 'en',
        countryHint: 'RO',
        limit: 5,
      });
      expect(response.json().suggestions).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('rejects autocomplete queries that are only whitespace', async () => {
    const app = createApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/search/autocomplete',
        payload: {
          query: '   ',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'Autocomplete query must be at least 2 non-space characters.',
        code: 'BAD_REQUEST',
      });
    } finally {
      await app.close();
    }
  });

  it('accepts trip lifecycle writes through injected persistence dependencies', async () => {
    const startTripRecord = vi.fn().mockResolvedValue({
      clientTripId: 'client-trip-1',
      tripId: 'trip-123',
      acceptedAt: '2026-03-14T10:00:00.000Z',
    });
    const finishTripRecord = vi.fn().mockResolvedValue({
      clientTripId: 'client-trip-1',
      tripId: 'trip-123',
      acceptedAt: '2026-03-14T10:45:00.000Z',
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      startTripRecord,
      finishTripRecord,
    });

    try {
      const startResponse = await app.inject({
        method: 'POST',
        url: '/v1/trips/start',
        headers: authHeader,
        payload: {
          clientTripId: 'client-trip-1',
          sessionId: 'session-1',
          startLocationText: 'Current rider location',
          startCoordinate: {
            lat: 44.4268,
            lon: 26.1025,
          },
          destinationText: 'Piata Victoriei',
          destinationCoordinate: {
            lat: 44.4521,
            lon: 26.0865,
          },
          distanceMeters: 2500,
          startedAt: '2026-03-14T10:00:00.000Z',
        },
      });

      expect(startResponse.statusCode).toBe(200);
      expect(startTripRecord).toHaveBeenCalledWith({
        clientTripId: 'client-trip-1',
        sessionId: 'session-1',
        startLocationText: 'Current rider location',
        startCoordinate: {
          lat: 44.4268,
          lon: 26.1025,
        },
        destinationText: 'Piata Victoriei',
        destinationCoordinate: {
          lat: 44.4521,
          lon: 26.0865,
        },
        distanceMeters: 2500,
        startedAt: '2026-03-14T10:00:00.000Z',
      }, 'user-123');

      const endResponse = await app.inject({
        method: 'POST',
        url: '/v1/trips/end',
        headers: authHeader,
        payload: {
          clientTripId: 'client-trip-1',
          tripId: 'trip-123',
          endedAt: '2026-03-14T10:45:00.000Z',
          reason: 'completed',
        },
      });

      expect(endResponse.statusCode).toBe(200);
      expect(finishTripRecord).toHaveBeenCalledWith({
        clientTripId: 'client-trip-1',
        tripId: 'trip-123',
        endedAt: '2026-03-14T10:45:00.000Z',
        reason: 'completed',
      }, 'user-123');
    } finally {
      await app.close();
    }
  });

  it('accepts hazard and feedback submissions through injected persistence dependencies', async () => {
    const submitHazardReport = vi.fn().mockResolvedValue({
      reportId: 'hazard-1',
      acceptedAt: '2026-03-14T11:00:00.000Z',
    });
    const submitNavigationFeedback = vi.fn().mockResolvedValue({
      acceptedAt: '2026-03-14T11:05:00.000Z',
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      submitHazardReport,
      submitNavigationFeedback,
    });

    try {
      const hazardResponse = await app.inject({
        method: 'POST',
        url: '/v1/hazards',
        headers: authHeader,
        payload: {
          coordinate: {
            lat: 44.447,
            lon: 26.097,
          },
          reportedAt: '2026-03-14T11:00:00.000Z',
          source: 'manual',
          hazardType: 'blocked_bike_lane',
        },
      });

      expect(hazardResponse.statusCode).toBe(200);
      expect(submitHazardReport).toHaveBeenCalledWith({
        coordinate: {
          lat: 44.447,
          lon: 26.097,
        },
        reportedAt: '2026-03-14T11:00:00.000Z',
        source: 'manual',
        hazardType: 'blocked_bike_lane',
      }, 'user-123');

      const feedbackResponse = await app.inject({
        method: 'POST',
        url: '/v1/feedback',
        headers: authHeader,
        payload: {
          clientTripId: 'client-trip-1',
          sessionId: 'session-1',
          startLocationText: 'Current rider location',
          destinationText: 'Piata Victoriei',
          distanceMeters: 2500,
          durationSeconds: 780,
          rating: 4,
          feedbackText: 'Felt safe except near the final junction.',
          submittedAt: '2026-03-14T11:05:00.000Z',
        },
      });

      expect(feedbackResponse.statusCode).toBe(200);
      expect(submitNavigationFeedback).toHaveBeenCalledWith({
        clientTripId: 'client-trip-1',
        tripId: undefined,
        sessionId: 'session-1',
        startLocationText: 'Current rider location',
        destinationText: 'Piata Victoriei',
        distanceMeters: 2500,
        durationSeconds: 780,
        rating: 4,
        feedbackText: 'Felt safe except near the final junction.',
        submittedAt: '2026-03-14T11:05:00.000Z',
      }, 'user-123');
    } finally {
      await app.close();
    }
  });

  it('accepts anonymous hazard submissions like the web app flow', async () => {
    const submitHazardReport = vi.fn().mockResolvedValue({
      reportId: 'hazard-1',
      acceptedAt: '2026-03-14T11:00:00.000Z',
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
      submitHazardReport,
    });

    try {
      const hazardResponse = await app.inject({
        method: 'POST',
        url: '/v1/hazards',
        payload: {
          coordinate: {
            lat: 44.447,
            lon: 26.097,
          },
          reportedAt: '2026-03-14T11:00:00.000Z',
          source: 'manual',
        },
      });

      expect(hazardResponse.statusCode).toBe(200);
      expect(submitHazardReport).toHaveBeenCalledWith({
        coordinate: {
          lat: 44.447,
          lon: 26.097,
        },
        reportedAt: '2026-03-14T11:00:00.000Z',
        source: 'manual',
        hazardType: undefined,
      }, null);
    } finally {
      await app.close();
    }
  });

  it('rate limits authenticated write endpoints after the configured threshold', async () => {
    const submitHazardReport = vi.fn().mockResolvedValue({
      reportId: 'hazard-1',
      acceptedAt: '2026-03-14T11:00:00.000Z',
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      submitHazardReport,
      rateLimitPolicies: {
        routePreview: {
          limit: 30,
          windowMs: 60000,
        },
        routeReroute: {
          limit: 60,
          windowMs: 60000,
        },
        write: {
          limit: 1,
          windowMs: 60000,
        },
      },
    });

    const payload = {
      coordinate: {
        lat: 44.447,
        lon: 26.097,
      },
      reportedAt: '2026-03-14T11:00:00.000Z',
      source: 'manual',
    };

    try {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/hazards',
        headers: authHeader,
        payload,
      });

      const secondResponse = await app.inject({
        method: 'POST',
        url: '/v1/hazards',
        headers: authHeader,
        payload,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(429);
      expect(submitHazardReport).toHaveBeenCalledTimes(1);
      expect(secondResponse.json()).toMatchObject({
        error: 'Rate limit exceeded for this endpoint.',
        code: 'RATE_LIMITED',
      });
    } finally {
      await app.close();
    }
  });

  it('returns cumulative user stats from the stats endpoint', async () => {
    const getUserStats = vi.fn().mockResolvedValue({
      totalTrips: 12,
      totalDistanceMeters: 48200,
      totalCo2SavedKg: 5.78,
      totalDurationSeconds: 14400,
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      getUserStats,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats',
        headers: authHeader,
      });

      expect(response.statusCode).toBe(200);
      expect(getUserStats).toHaveBeenCalledWith('user-123');
      expect(response.json()).toEqual({
        totalTrips: 12,
        totalDistanceMeters: 48200,
        totalCo2SavedKg: 5.78,
        totalDurationSeconds: 14400,
      });
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated stats requests', async () => {
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
      });
    } finally {
      await app.close();
    }
  });

  it('returns a 502 when the stats dependency throws', async () => {
    const getUserStats = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      getUserStats,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats',
        headers: authHeader,
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        error: 'Stats fetch failed.',
        code: 'UPSTREAM_ERROR',
        details: ['DB connection lost'],
      });
    } finally {
      await app.close();
    }
  });

  it('returns the full trip statistics dashboard', async () => {
    const dashboardData = {
      totals: {
        totalTrips: 25,
        totalDistanceMeters: 112000,
        totalCo2SavedKg: 13.44,
        totalDurationSeconds: 36000,
      },
      weekly: [
        { periodStart: '2026-03-30', trips: 3, distanceMeters: 15000, durationSeconds: 5400 },
        { periodStart: '2026-03-31', trips: 1, distanceMeters: 4200, durationSeconds: 1800 },
      ],
      monthly: [
        { periodStart: '2026-03-01', trips: 10, distanceMeters: 48000, durationSeconds: 18000 },
      ],
      currentStreakDays: 4,
      longestStreakDays: 12,
      modeSplit: { safeTrips: 18, fastTrips: 7 },
    };
    const getTripStatsDashboard = vi.fn().mockResolvedValue(dashboardData);
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      getTripStatsDashboard,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats/dashboard',
        headers: authHeader,
      });

      expect(response.statusCode).toBe(200);
      expect(getTripStatsDashboard).toHaveBeenCalledWith('user-123', 'UTC');

      const payload = response.json();
      expect(payload.totals).toEqual({
        totalTrips: 25,
        totalDistanceMeters: 112000,
        totalCo2SavedKg: 13.44,
        totalDurationSeconds: 36000,
      });
      expect(payload.weekly).toHaveLength(2);
      expect(payload.monthly).toHaveLength(1);
      expect(payload.currentStreakDays).toBe(4);
      expect(payload.longestStreakDays).toBe(12);
      expect(payload.modeSplit).toEqual({ safeTrips: 18, fastTrips: 7 });
    } finally {
      await app.close();
    }
  });

  it('forwards the tz query parameter to the dashboard dependency', async () => {
    const getTripStatsDashboard = vi.fn().mockResolvedValue({
      totals: { totalTrips: 0, totalDistanceMeters: 0, totalCo2SavedKg: 0, totalDurationSeconds: 0 },
      weekly: [],
      monthly: [],
      currentStreakDays: 0,
      longestStreakDays: 0,
      modeSplit: { safeTrips: 0, fastTrips: 0 },
    });
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      getTripStatsDashboard,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats/dashboard?tz=Europe/Bucharest',
        headers: authHeader,
      });

      expect(response.statusCode).toBe(200);
      expect(getTripStatsDashboard).toHaveBeenCalledWith('user-123', 'Europe/Bucharest');
    } finally {
      await app.close();
    }
  });

  it('rejects unauthenticated dashboard requests', async () => {
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats/dashboard',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
      });
    } finally {
      await app.close();
    }
  });

  it('returns a 502 when the dashboard dependency throws', async () => {
    const getTripStatsDashboard = vi.fn().mockRejectedValue(new Error('RPC timeout'));
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'rider@example.com',
      }),
      getTripStatsDashboard,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/stats/dashboard',
        headers: authHeader,
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        error: 'Stats dashboard fetch failed.',
        code: 'UPSTREAM_ERROR',
        details: ['RPC timeout'],
      });
    } finally {
      await app.close();
    }
  });

  it('rejects anonymous feedback writes with an unauthorized error payload', async () => {
    const app = createApp({
      authenticateUser: vi.fn().mockResolvedValue(null),
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/feedback',
        payload: {
          clientTripId: 'client-trip-1',
          sessionId: 'session-1',
          startLocationText: 'Current rider location',
          destinationText: 'Piata Victoriei',
          distanceMeters: 2500,
          durationSeconds: 780,
          rating: 4,
          feedbackText: 'Felt safe except near the final junction.',
          submittedAt: '2026-03-14T11:05:00.000Z',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
        details: ['Sign in from the mobile app before syncing trips, hazards, or feedback.'],
      });
    } finally {
      await app.close();
    }
  });
});
