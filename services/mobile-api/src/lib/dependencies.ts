import { authenticateUser, type AuthenticatedUser } from './auth';
import { createMemoryRouteResponseCache, type RouteResponseCache } from './cache';
import { fetchSafeRoutes } from './clients/customOsrm';
import { fetchFastRoutes, forwardGeocode, reverseGeocode } from './clients/mapbox';
import { config } from '../config';
import { buildCoverageResponse, resolveCoverage } from './coverage';
import { getElevationProfile } from './elevation';
import { normalizeRoutePreviewResponse } from './normalize';
import {
  createMemoryRateLimiter,
  type RateLimiter,
  type RateLimitPolicies,
} from './rateLimit';
import { createRedisSharedStore } from './redisStore';
import { fetchRiskSegments } from './risk';
import {
  finishTripRecord,
  getTripHistory,
  getTripStatsDashboard,
  getUserStats,
  saveTripTrack,
  startTripRecord,
  submitHazardReport,
  submitNavigationFeedback,
} from './submissions';

export type MobileApiDependencies = {
  authenticateUser: (accessToken: string) => Promise<AuthenticatedUser | null>;
  buildCoverageResponse: typeof buildCoverageResponse;
  resolveCoverage: typeof resolveCoverage;
  fetchSafeRoutes: typeof fetchSafeRoutes;
  fetchFastRoutes: typeof fetchFastRoutes;
  forwardGeocode: typeof forwardGeocode;
  reverseGeocode: typeof reverseGeocode;
  getElevationProfile: typeof getElevationProfile;
  fetchRiskSegments: typeof fetchRiskSegments;
  normalizeRoutePreviewResponse: typeof normalizeRoutePreviewResponse;
  submitHazardReport: typeof submitHazardReport;
  startTripRecord: typeof startTripRecord;
  finishTripRecord: typeof finishTripRecord;
  saveTripTrack: typeof saveTripTrack;
  getTripHistory: typeof getTripHistory;
  getUserStats: typeof getUserStats;
  getTripStatsDashboard: typeof getTripStatsDashboard;
  submitNavigationFeedback: typeof submitNavigationFeedback;
  routeResponseCache: RouteResponseCache;
  rateLimiter: RateLimiter;
  rateLimitPolicies: RateLimitPolicies;
  routeResponseCacheTtlMs: {
    preview: number;
    reroute: number;
  };
  sharedStoreBackend: 'memory' | 'redis';
  initialize: () => Promise<void>;
  dispose: () => Promise<void>;
};

const buildDefaultDependencies = (): MobileApiDependencies => {
  const sharedStore = config.redis.url
    ? createRedisSharedStore({
        url: config.redis.url,
        keyPrefix: config.redis.keyPrefix,
        connectTimeoutMs: config.redis.connectTimeoutMs,
      })
    : {
        backend: 'memory' as const,
        routeResponseCache: createMemoryRouteResponseCache(),
        rateLimiter: createMemoryRateLimiter(),
        initialize: async () => undefined,
        dispose: async () => undefined,
      };

  return {
    authenticateUser,
    buildCoverageResponse,
    resolveCoverage,
    fetchSafeRoutes,
    fetchFastRoutes,
    forwardGeocode,
    reverseGeocode,
    getElevationProfile,
    fetchRiskSegments,
    normalizeRoutePreviewResponse,
    submitHazardReport,
    startTripRecord,
    finishTripRecord,
    saveTripTrack,
    getTripHistory,
    getUserStats,
    getTripStatsDashboard,
    submitNavigationFeedback,
    routeResponseCache: sharedStore.routeResponseCache,
    rateLimiter: sharedStore.rateLimiter,
    rateLimitPolicies: config.rateLimits,
    routeResponseCacheTtlMs: {
      preview: config.routeResponseCache.previewTtlMs,
      reroute: config.routeResponseCache.rerouteTtlMs,
    },
    sharedStoreBackend: sharedStore.backend,
    initialize: sharedStore.initialize,
    dispose: sharedStore.dispose,
  };
};

export const createMobileApiDependencies = (
  overrides: Partial<MobileApiDependencies> = {},
): MobileApiDependencies => ({
  ...buildDefaultDependencies(),
  ...overrides,
});
