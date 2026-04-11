import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  mobileEnv: {
    mobileApiUrl: 'https://test-api.example.com',
    mapboxPublicToken: 'pk.test_token',
    usesNgrokTunnel: false,
  },
}));

vi.mock('./supabase', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
}));

vi.mock('./mapbox-search', () => ({
  mapboxAutocomplete: vi.fn().mockResolvedValue({ suggestions: [], generatedAt: new Date().toISOString() }),
  mapboxReverseGeocode: vi.fn().mockResolvedValue({ coordinate: { lat: 0, lon: 0 }, label: null }),
  mapboxGetCoverage: vi.fn().mockResolvedValue({ regions: [], generatedAt: new Date().toISOString() }),
  reverseGeocodeLocality: vi.fn().mockResolvedValue(null),
}));

vi.mock('./mapbox-routing', () => ({
  directPreviewRoute: vi.fn().mockResolvedValue({ routes: [], selectedMode: 'safe', generatedAt: new Date().toISOString() }),
  directReroute: vi.fn().mockResolvedValue({ routes: [], selectedMode: 'safe', generatedAt: new Date().toISOString() }),
}));

import { mobileApi } from './api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetchResponse = (data: unknown, ok = true, status = 200) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mobileApi', () => {
  describe('reportHazard', () => {
    it('sends POST to /v1/hazards', async () => {
      const hazardResponse = { id: 'hazard-1', createdAt: '2026-04-08T10:00:00Z' };
      mockFetchResponse(hazardResponse);

      const result = await mobileApi.reportHazard({
        lat: 44.43,
        lon: 26.1,
        type: 'pothole',
        severity: 'medium',
      } as any);

      expect(result).toEqual(hazardResponse);
      expect(fetch).toHaveBeenCalledTimes(1);

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://test-api.example.com/v1/hazards');
      expect(options?.method).toBe('POST');
    });
  });

  describe('startTrip', () => {
    it('sends POST to /v1/trips/start', async () => {
      const tripResponse = { tripId: 'trip-123', startedAt: '2026-04-08T10:00:00Z' };
      mockFetchResponse(tripResponse);

      const result = await mobileApi.startTrip({
        routeId: 'route-1',
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
      } as any);

      expect(result).toEqual(tripResponse);
    });
  });

  describe('endTrip', () => {
    it('sends POST to /v1/trips/end', async () => {
      const endResponse = { tripId: 'trip-123', endedAt: '2026-04-08T11:00:00Z' };
      mockFetchResponse(endResponse);

      const result = await mobileApi.endTrip({
        tripId: 'trip-123',
        distanceMeters: 5000,
        durationSeconds: 1200,
      } as any);

      expect(result).toEqual(endResponse);
    });
  });

  describe('getTripHistory', () => {
    it('sends GET to /v1/trips/history', async () => {
      const historyResponse = [
        { tripId: 'trip-1', startedAt: '2026-04-07T08:00:00Z' },
        { tripId: 'trip-2', startedAt: '2026-04-06T09:00:00Z' },
      ];
      mockFetchResponse(historyResponse);

      const result = await mobileApi.getTripHistory();

      expect(result).toEqual(historyResponse);
    });
  });

  describe('submitFeedback', () => {
    it('sends POST to /v1/feedback', async () => {
      const ackResponse = { ok: true };
      mockFetchResponse(ackResponse);

      const result = await mobileApi.submitFeedback({
        tripId: 'trip-123',
        rating: 4,
        comment: 'Good route',
      } as any);

      expect(result).toEqual(ackResponse);
    });
  });

  describe('getNearbyHazards', () => {
    it('sends GET with query parameters', async () => {
      mockFetchResponse({ hazards: [{ id: 'h1', type: 'pothole' }] });

      const result = await mobileApi.getNearbyHazards(44.43, 26.1, 500);

      expect(result).toEqual([{ id: 'h1', type: 'pothole' }]);
      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('lat=44.43');
      expect(url).toContain('lon=26.1');
      expect(url).toContain('radiusMeters=500');
    });

    it('uses default radius when not specified', async () => {
      mockFetchResponse({ hazards: [] });

      await mobileApi.getNearbyHazards(44.43, 26.1);

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('radiusMeters=1000');
    });
  });

  describe('validateHazard', () => {
    it('sends POST to /v1/hazards/:id/validate', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.validateHazard('hazard-1', 'still_there' as any);

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('/v1/hazards/hazard-1/validate');
    });
  });

  describe('getFeed', () => {
    it('sends GET with lat/lon and optional cursor', async () => {
      const feedResponse = { items: [], nextCursor: null };
      mockFetchResponse(feedResponse);

      const result = await mobileApi.getFeed(44.43, 26.1, 'cursor-abc', 10);

      expect(result).toEqual(feedResponse);
      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('lat=44.43');
      expect(url).toContain('lon=26.1');
      expect(url).toContain('cursor=cursor-abc');
      expect(url).toContain('limit=10');
    });
  });

  describe('shareTripToFeed', () => {
    it('sends POST to /v1/feed/share', async () => {
      const shareResponse = { id: 'share-1', sharedAt: '2026-04-08T10:00:00Z' };
      mockFetchResponse(shareResponse);

      const result = await mobileApi.shareTripToFeed({
        tripId: 'trip-123',
        caption: 'Great ride!',
      } as any);

      expect(result).toEqual(shareResponse);
    });
  });

  describe('likeFeedItem / unlikeFeedItem', () => {
    it('sends POST to like', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.likeFeedItem('share-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/feed/share-1/like');
      expect(options?.method).toBe('POST');
    });

    it('sends DELETE to unlike', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.unlikeFeedItem('share-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/feed/share-1/like');
      expect(options?.method).toBe('DELETE');
    });
  });

  describe('loveFeedItem / unloveFeedItem', () => {
    it('sends POST to love', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.loveFeedItem('share-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/feed/share-1/love');
      expect(options?.method).toBe('POST');
    });

    it('sends DELETE to unlove', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.unloveFeedItem('share-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/feed/share-1/love');
      expect(options?.method).toBe('DELETE');
    });
  });

  describe('getFeedComments / postFeedComment', () => {
    it('sends GET for comments', async () => {
      mockFetchResponse({ comments: [{ id: 'c1', body: 'Nice!' }] });

      const result = await mobileApi.getFeedComments('share-1');

      expect(result.comments).toHaveLength(1);
    });

    it('sends POST for new comment', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.postFeedComment('share-1', { body: 'Great ride!' } as any);

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('POST');
    });
  });

  describe('getProfile / updateProfile', () => {
    it('sends GET for profile', async () => {
      const profile = { id: 'user-1', displayName: 'Victor' };
      mockFetchResponse(profile);

      const result = await mobileApi.getProfile();

      expect(result).toEqual(profile);
    });

    it('sends PATCH for profile update', async () => {
      mockFetchResponse({ id: 'user-1', displayName: 'Victor Updated' });

      await mobileApi.updateProfile({ displayName: 'Victor Updated' } as any);

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('PATCH');
    });
  });

  describe('push token registration', () => {
    it('sends PUT to register push token', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.registerPushToken('ExponentPushToken[xxx]', 'device-1', 'android');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/push-token');
      expect(options?.method).toBe('PUT');
      const body = JSON.parse(options?.body as string);
      expect(body.expoPushToken).toBe('ExponentPushToken[xxx]');
      expect(body.deviceId).toBe('device-1');
      expect(body.platform).toBe('android');
    });

    it('sends DELETE to unregister push token', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.unregisterPushToken('device-1');

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('DELETE');
    });
  });

  describe('getCommunityStats', () => {
    it('sends GET with lat/lon/radius', async () => {
      const stats = { totalTrips: 100, totalKm: 5000 };
      mockFetchResponse(stats);

      const result = await mobileApi.getCommunityStats(44.43, 26.1, 20);

      expect(result).toEqual(stats);
      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('lat=44.43');
      expect(url).toContain('lon=26.1');
      expect(url).toContain('radiusKm=20');
    });
  });

  describe('habit engine endpoints', () => {
    it('fetchLoopRoute sends POST', async () => {
      mockFetchResponse({ routes: [] });

      await mobileApi.fetchLoopRoute({ lat: 44.43, lon: 26.1 }, 5000);

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('POST');
      const body = JSON.parse(options?.body as string);
      expect(body.origin).toEqual({ lat: 44.43, lon: 26.1 });
      expect(body.distancePreferenceMeters).toBe(5000);
    });

    it('fetchSafetyScore sends GET with params', async () => {
      mockFetchResponse({ score: 75 });

      await mobileApi.fetchSafetyScore(44.43, 26.1, 5);

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('lat=44.43');
      expect(url).toContain('lon=26.1');
      expect(url).toContain('radiusKm=5');
    });

    it('fetchBadges sends GET', async () => {
      mockFetchResponse({ badges: [], summary: {} });

      await mobileApi.fetchBadges();

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('/v1/badges');
    });

    it('fetchDailyQuiz sends GET', async () => {
      mockFetchResponse({ id: 'q1', question: 'What is safest?', options: [] });

      await mobileApi.fetchDailyQuiz();

      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('/v1/quiz/daily');
    });

    it('submitQuizAnswer sends POST', async () => {
      mockFetchResponse({ correct: true });

      await mobileApi.submitQuizAnswer('q1', 2);

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('POST');
      const body = JSON.parse(options?.body as string);
      expect(body.questionId).toBe('q1');
      expect(body.selectedIndex).toBe(2);
    });
  });

  describe('social endpoints', () => {
    it('followUser sends POST', async () => {
      mockFetchResponse({ followedAt: '2026-04-08T10:00:00Z' });

      await mobileApi.followUser('user-2');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/users/user-2/follow');
      expect(options?.method).toBe('POST');
    });

    it('unfollowUser sends DELETE', async () => {
      mockFetchResponse({ unfollowedAt: '2026-04-08T10:00:00Z' });

      await mobileApi.unfollowUser('user-2');

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('DELETE');
    });
  });

  describe('saved routes', () => {
    it('getSavedRoutes returns routes array', async () => {
      mockFetchResponse({ routes: [{ id: 'route-1' }, { id: 'route-2' }] });

      const result = await mobileApi.getSavedRoutes();

      expect(result).toEqual([{ id: 'route-1' }, { id: 'route-2' }]);
    });

    it('saveRoute sends POST', async () => {
      mockFetchResponse({ id: 'route-new' });

      await mobileApi.saveRoute({ name: 'My Route' } as any);

      const [, options] = vi.mocked(fetch).mock.calls[0];
      expect(options?.method).toBe('POST');
    });

    it('deleteSavedRoute sends DELETE', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.deleteSavedRoute('route-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/saved-routes/route-1');
      expect(options?.method).toBe('DELETE');
    });

    it('useSavedRoute sends PATCH', async () => {
      mockFetchResponse({ ok: true });

      await mobileApi.useSavedRoute('route-1');

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/v1/saved-routes/route-1/use');
      expect(options?.method).toBe('PATCH');
    });
  });

  describe('error handling', () => {
    it('throws on non-OK response', async () => {
      mockFetchResponse({ error: 'Not found', details: [] }, false, 404);

      await expect(mobileApi.getTripHistory()).rejects.toThrow('Not found');
    });

    it('throws with detail when available', async () => {
      mockFetchResponse(
        { error: 'Validation failed', details: ['Field required'] },
        false,
        400,
      );

      await expect(mobileApi.submitFeedback({} as any)).rejects.toThrow('Validation failed Field required');
    });

    it('throws fallback message for non-JSON error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('not json'); },
        text: async () => 'Internal Server Error',
      } as Response);

      await expect(mobileApi.getTripHistory()).rejects.toThrow('Internal Server Error');
    });
  });

  describe('delegation to mapbox modules', () => {
    it('getCoverage delegates to mapboxGetCoverage', async () => {
      const { mapboxGetCoverage } = await import('./mapbox-search');

      await mobileApi.getCoverage(44.43, 26.1, 'RO');

      expect(mapboxGetCoverage).toHaveBeenCalledWith(44.43, 26.1, 'RO');
    });

    it('previewRoute delegates to directPreviewRoute', async () => {
      const { directPreviewRoute } = await import('./mapbox-routing');

      const payload = {
        origin: { lat: 44.43, lon: 26.1 },
        destination: { lat: 44.44, lon: 26.12 },
        mode: 'safe' as const,
        avoidUnpaved: false,
        avoidHills: false,
      };

      await mobileApi.previewRoute(payload);

      expect(directPreviewRoute).toHaveBeenCalledWith(payload);
    });

    it('autocomplete delegates to mapboxAutocomplete', async () => {
      const { mapboxAutocomplete } = await import('./mapbox-search');

      const payload = { query: 'test' };
      await mobileApi.autocomplete(payload);

      expect(mapboxAutocomplete).toHaveBeenCalledWith(payload);
    });
  });

  describe('fetchRiskMap', () => {
    it('fetches risk map with direct fetch (no auth)', async () => {
      const featureCollection = { type: 'FeatureCollection', features: [] };
      mockFetchResponse(featureCollection);

      const result = await mobileApi.fetchRiskMap(44.43, 26.1, 5);

      expect(result).toEqual(featureCollection);
      const url = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(url).toContain('/v1/risk-map');
      expect(url).toContain('lat=44.43');
      expect(url).toContain('lon=26.1');
      expect(url).toContain('radiusKm=5');
    });

    it('returns empty FeatureCollection on error', async () => {
      mockFetchResponse(null, false);

      const result = await mobileApi.fetchRiskMap(44.43, 26.1);

      expect(result).toEqual({ type: 'FeatureCollection', features: [] });
    });
  });
});
