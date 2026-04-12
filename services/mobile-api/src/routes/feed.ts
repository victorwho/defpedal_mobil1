import type {
  CityHeartbeat,
  CommunityStats,
  ErrorResponse,
  FeedItem,
  FeedResponse,
  HazardType,
} from '@defensivepedal/core';
import { calculateCo2SavedKg } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import {
  communityStatsQuerystringSchema,
  communityStatsResponseSchema,
  errorResponseSchema,
  feedQuerystringSchema,
  feedResponseSchema,
  heartbeatQuerystringSchema,
  heartbeatResponseSchema,
  type CommunityStatsQuerystring,
  type FeedQuerystring,
  type HeartbeatQuerystring,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { ensureSupabase, mapFeedRow, requireUser } from './feed-helpers';
import { buildFeedCommentRoutes } from './feed-comments';
import { buildFeedProfileRoutes } from './feed-profile';
import { buildFeedReactionRoutes } from './feed-reactions';
import { buildFeedShareRoutes } from './feed-share';

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_RADIUS_KM = 15;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const buildFeedRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // GET /feed — nearby feed
    app.get<{ Querystring: FeedQuerystring; Reply: FeedResponse | ErrorResponse }>(
      '/feed',
      {
        schema: {
          querystring: feedQuerystringSchema,
          response: {
            200: feedResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, cursor, limit: rawLimit, radiusKm: rawRadius } = request.query;
        const limit = rawLimit ?? DEFAULT_FEED_LIMIT;
        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;

        // Use RPC for spatial + aggregate query
        const { data, error } = await db.rpc('get_nearby_feed', {
          user_lat: lat,
          user_lon: lon,
          radius_meters: radiusMeters,
          feed_limit: limit,
          cursor_shared_at: cursor ?? null,
          requesting_user_id: user.id,
        });

        if (error) {
          request.log.error({ event: 'feed_query_error', error: error.message }, 'feed query failed');
          throw new HttpError('Feed query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        const items: FeedItem[] = rows.map((row) => mapFeedRow(row, user.id));
        const nextCursor = items.length === limit ? (items[items.length - 1]?.sharedAt ?? null) : null;

        return { items, cursor: nextCursor };
      },
    );

    // GET /community/stats — aggregate stats for nearby community
    app.get<{ Querystring: CommunityStatsQuerystring; Reply: CommunityStats | ErrorResponse }>(
      '/community/stats',
      {
        schema: {
          querystring: communityStatsQuerystringSchema,
          response: {
            200: communityStatsResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, radiusKm: rawRadius } = request.query;
        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;

        const { data, error } = await db.rpc('get_community_stats', {
          user_lat: lat,
          user_lon: lon,
          radius_meters: radiusMeters,
        });

        if (error) {
          request.log.error({ event: 'community_stats_error', error: error.message }, 'community stats query failed');
          throw new HttpError('Community stats query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const row = Array.isArray(data) ? data[0] : data;
        const totalDistanceMeters = Number(row?.total_distance_meters ?? 0);

        return {
          localityName: null,
          totalTrips: Number(row?.total_trips ?? 0),
          totalDistanceMeters,
          totalDurationSeconds: Number(row?.total_duration_seconds ?? 0),
          totalCo2SavedKg: calculateCo2SavedKg(totalDistanceMeters),
          uniqueRiders: Number(row?.unique_riders ?? 0),
        };
      },
    );

    // GET /community/heartbeat — city pulse dashboard
    app.get<{ Querystring: HeartbeatQuerystring; Reply: CityHeartbeat | ErrorResponse }>(
      '/community/heartbeat',
      {
        schema: {
          querystring: heartbeatQuerystringSchema,
          response: {
            200: heartbeatResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, radiusKm: rawRadius, days: rawDays } = request.query;
        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;
        const days = rawDays ?? 7;

        const { data, error } = await db.rpc('get_city_heartbeat', {
          user_lat: lat,
          user_lon: lon,
          radius_meters: radiusMeters,
          p_days: days,
        });

        if (error) {
          request.log.error({ event: 'heartbeat_error', error: error.message }, 'heartbeat query failed');
          throw new HttpError('Heartbeat query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        let result: Record<string, unknown>;
        try {
          result = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
        } catch {
          throw new HttpError('Heartbeat data parsing failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: ['Invalid RPC response format.'],
          });
        }
        const today = result.today as Record<string, unknown>;
        const totals = result.totals as Record<string, unknown>;

        const response: CityHeartbeat = {
          localityName: null,
          today: {
            rides: Number(today?.rides ?? 0),
            distanceMeters: Number(today?.distanceMeters ?? 0),
            co2SavedKg: Number(today?.co2SavedKg ?? 0),
            communitySeconds: Number(today?.communitySeconds ?? 0),
            activeRiders: Number(today?.activeRiders ?? 0),
          },
          daily: ((result.daily as Record<string, unknown>[]) ?? []).map((d) => ({
            day: String(d.day),
            rides: Number(d.rides ?? 0),
            distanceMeters: Number(d.distanceMeters ?? 0),
            co2SavedKg: Number(d.co2SavedKg ?? 0),
            communitySeconds: Number(d.communitySeconds ?? 0),
          })),
          totals: {
            rides: Number(totals?.rides ?? 0),
            distanceMeters: Number(totals?.distanceMeters ?? 0),
            durationSeconds: Number(totals?.durationSeconds ?? 0),
            co2SavedKg: Number(totals?.co2SavedKg ?? 0),
            communitySeconds: Number(totals?.communitySeconds ?? 0),
            uniqueRiders: Number(totals?.uniqueRiders ?? 0),
          },
          hazardHotspots: ((result.hazardHotspots as Record<string, unknown>[]) ?? []).map((h) => ({
            hazardType: (String(h.hazardType ?? 'other')) as HazardType,
            count: Number(h.count ?? 0),
            lat: Number(h.lat ?? 0),
            lon: Number(h.lon ?? 0),
          })),
          topContributors: ((result.topContributors as Record<string, unknown>[]) ?? []).map((c) => ({
            displayName: String(c.displayName ?? 'Rider'),
            avatarUrl: (c.avatarUrl as string) ?? null,
            rideCount: Number(c.rideCount ?? 0),
            distanceKm: Number(c.distanceKm ?? 0),
          })),
        };

        return response;
      },
    );

    // Register sub-plugins for remaining feed endpoints
    void app.register(buildFeedShareRoutes(dependencies));
    void app.register(buildFeedReactionRoutes(dependencies));
    void app.register(buildFeedCommentRoutes(dependencies));
    void app.register(buildFeedProfileRoutes(dependencies));

  };

  return routes;
};
