import type {
  CityHeartbeat,
  CommunityStats,
  CyclingGoal,
  ErrorResponse,
  FeedComment,
  FeedItem,
  FeedResponse,
  HazardType,
  ProfileResponse,
  SafetyTag,
  ShareTripRequest,
  WriteAckResponse,
} from '@defensivepedal/core';
import { calculateCo2SavedKg } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import {
  communityStatsQuerystringSchema,
  communityStatsResponseSchema,
  errorResponseSchema,
  feedCommentRequestSchema,
  feedCommentsResponseSchema,
  feedQuerystringSchema,
  feedResponseSchema,
  heartbeatQuerystringSchema,
  heartbeatResponseSchema,
  normalizeShareTripRequest,
  profileResponseSchema,
  profileUpdateRequestSchema,
  shareTripRequestSchema,
  type CommunityStatsQuerystring,
  type FeedCommentBody,
  type FeedQuerystring,
  type HeartbeatQuerystring,
  type ProfileUpdateBody,
  type ShareTripBody,
  type TripShareIdParams,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_RADIUS_KM = 15;

const requireUser = (
  request: Parameters<typeof requireAuthenticatedUser>[0],
  dependencies: MobileApiDependencies,
) => requireAuthenticatedUser(request, dependencies.authenticateUser);

const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new HttpError('Database unavailable.', {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    });
  }
  return supabaseAdmin;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toPointWkt = (lat: number, lon: number) => `POINT(${lon} ${lat})`;

// Streak helpers (shared with v1.ts)
import { getTimezone, qualifyStreakAsync } from '../lib/streaks';

const mapFeedRow = (row: Record<string, unknown>, userId: string): FeedItem => {
  const profile = row.profiles as Record<string, unknown> | null;
  const username = profile?.username as string | null;
  return {
    id: row.id as string,
    user: {
      id: row.user_id as string,
      displayName: username ? `@${username}` : (profile?.display_name as string) ?? 'Rider',
      avatarUrl: (profile?.avatar_url as string) ?? null,
    },
    title: (row.title as string) ?? '',
    startLocationText: (row.start_location_text as string) ?? '',
    destinationText: (row.destination_text as string) ?? '',
    distanceMeters: Number(row.distance_meters) || 0,
    durationSeconds: Number(row.duration_seconds) || 0,
    elevationGainMeters: row.elevation_gain_meters != null ? Number(row.elevation_gain_meters) : null,
    averageSpeedMps: row.average_speed_mps != null ? Number(row.average_speed_mps) : null,
    safetyRating: row.safety_rating != null ? Number(row.safety_rating) : null,
    safetyTags: (row.safety_tags as SafetyTag[]) ?? [],
    geometryPolyline6: row.geometry_polyline6 as string,
    note: (row.note as string) ?? null,
    sharedAt: row.shared_at as string,
    likeCount: Number(row.like_count ?? 0),
    loveCount: Number(row.love_count ?? 0),
    co2SavedKg: calculateCo2SavedKg(Number(row.distance_meters) || 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
    lovedByMe: Boolean(row.loved_by_me ?? false),
  };
};

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

        const result = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
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

    // POST /feed/share — share a trip
    app.post<{ Body: ShareTripBody; Reply: { id: string; sharedAt: string } | ErrorResponse }>(
      '/feed/share',
      {
        schema: {
          body: shareTripRequestSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'sharedAt'],
              properties: {
                id: { type: 'string' },
                sharedAt: { type: 'string', format: 'date-time' },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const req: ShareTripRequest = normalizeShareTripRequest(request.body);

        const { data, error } = await db
          .from('trip_shares')
          .insert([
            {
              user_id: user.id,
              trip_id: req.tripId ?? null,
              title: req.title,
              start_location_text: req.startLocationText,
              destination_text: req.destinationText,
              distance_meters: req.distanceMeters,
              duration_seconds: req.durationSeconds,
              elevation_gain_meters: req.elevationGainMeters,
              average_speed_mps: req.averageSpeedMps,
              safety_rating: req.safetyRating,
              geometry_polyline6: req.geometryPolyline6,
              start_coordinate: toPointWkt(req.startCoordinate.lat, req.startCoordinate.lon),
              safety_tags: req.safetyTags ?? [],
              note: req.note ?? null,
            },
          ])
          .select('id, shared_at')
          .single();

        if (error || !data) {
          throw new HttpError('Failed to share trip.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error?.message ?? 'Unknown error.'],
          });
        }

        qualifyStreakAsync(user.id, 'trip_share', getTimezone(request), request.log);

        return {
          id: data.id as string,
          sharedAt: data.shared_at as string,
        };
      },
    );

    // POST /feed/:id/like
    app.post<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/like',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { error } = await db
          .from('feed_likes')
          .upsert(
            { trip_share_id: request.params.id, user_id: user.id },
            { onConflict: 'trip_share_id,user_id' },
          );

        if (error) {
          throw new HttpError('Like failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // Fire-and-forget community notification to trip owner
        void (async () => {
          try {
            const { data: share } = await db
              .from('trip_shares')
              .select('user_id')
              .eq('id', request.params.id)
              .single();
            if (share && share.user_id !== user.id) {
              const { dispatchNotification } = await import('../lib/notifications');
              await dispatchNotification(share.user_id, 'community', {
                title: 'Someone liked your ride! 🚴',
                body: 'A fellow cyclist appreciated your trip.',
                data: { type: 'community', tripShareId: request.params.id },
              });
            }
          } catch { /* ignore notification failures */ }
        })();

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // DELETE /feed/:id/like
    app.delete<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/like',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { error } = await db
          .from('feed_likes')
          .delete()
          .eq('trip_share_id', request.params.id)
          .eq('user_id', user.id);

        if (error) {
          throw new HttpError('Unlike failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // POST /feed/:id/love
    app.post<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/love',
      {
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, format: 'uuid' } } },
          response: {
            200: { type: 'object', additionalProperties: false, required: ['acceptedAt'], properties: { acceptedAt: { type: 'string', format: 'date-time' } } },
            401: errorResponseSchema, 502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const { error } = await db.from('trip_loves').upsert(
          { trip_share_id: request.params.id, user_id: user.id },
          { onConflict: 'trip_share_id,user_id' },
        );
        if (error) throw new HttpError('Love failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        return { acceptedAt: new Date().toISOString() };
      },
    );

    // DELETE /feed/:id/love
    app.delete<{ Params: TripShareIdParams; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/love',
      {
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, format: 'uuid' } } },
          response: {
            200: { type: 'object', additionalProperties: false, required: ['acceptedAt'], properties: { acceptedAt: { type: 'string', format: 'date-time' } } },
            401: errorResponseSchema, 502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const { error } = await db.from('trip_loves').delete().eq('trip_share_id', request.params.id).eq('user_id', user.id);
        if (error) throw new HttpError('Unlove failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        return { acceptedAt: new Date().toISOString() };
      },
    );

    // GET /feed/:id/comments
    app.get<{ Params: TripShareIdParams; Reply: { comments: FeedComment[] } | ErrorResponse }>(
      '/feed/:id/comments',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
          response: {
            200: feedCommentsResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        // Step 1: fetch comments (no embedded join — feed_comments.user_id references
        // auth.users, not profiles, so PostgREST can't resolve the relationship automatically)
        const { data: rows, error } = await db
          .from('feed_comments')
          .select('id, user_id, body, created_at')
          .eq('trip_share_id', request.params.id)
          .order('created_at', { ascending: true });

        if (error) {
          throw new HttpError('Failed to load comments.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const commentRows = rows ?? [];

        // Step 2: batch-fetch profiles for all unique commenter user IDs
        const userIds = [...new Set(commentRows.map((r) => r.user_id as string))];
        const profileMap = new Map<string, { display_name: string; username: string | null; avatar_url: string | null }>();

        if (userIds.length > 0) {
          const { data: profileRows, error: profileError } = await db
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', userIds);

          if (profileError) {
            // Non-fatal: comments still load, authors fall back to "Rider"
            request.log.warn(
              { event: 'comments_profile_lookup_failed', error: profileError.message },
              'profile batch lookup failed for comment authors',
            );
          }

          for (const p of profileRows ?? []) {
            profileMap.set(p.id as string, {
              display_name: p.display_name as string,
              username: (p.username as string) ?? null,
              avatar_url: (p.avatar_url as string) ?? null,
            });
          }
        }

        const comments: FeedComment[] = commentRows.map((row) => {
          const profile = profileMap.get(row.user_id as string) ?? null;
          return {
            id: row.id as string,
            user: {
              id: row.user_id as string,
              displayName: profile?.username ? `@${profile.username}` : (profile?.display_name ?? 'Rider'),
              avatarUrl: profile?.avatar_url ?? null,
            },
            body: row.body as string,
            createdAt: row.created_at as string,
          };
        });

        return { comments };
      },
    );

    // POST /feed/:id/comments
    app.post<{ Params: TripShareIdParams; Body: FeedCommentBody; Reply: WriteAckResponse | ErrorResponse }>(
      '/feed/:id/comments',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, format: 'uuid' } },
          },
          body: feedCommentRequestSchema,
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['acceptedAt'],
              properties: { acceptedAt: { type: 'string', format: 'date-time' } },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { error } = await db
          .from('feed_comments')
          .insert([
            {
              trip_share_id: request.params.id,
              user_id: user.id,
              body: request.body.body.trim(),
            },
          ]);

        if (error) {
          throw new HttpError('Comment failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // Fire-and-forget community notification to trip owner
        void (async () => {
          try {
            const { data: share } = await db
              .from('trip_shares')
              .select('user_id')
              .eq('id', request.params.id)
              .single();
            if (share && share.user_id !== user.id) {
              const { dispatchNotification } = await import('../lib/notifications');
              await dispatchNotification(share.user_id, 'community', {
                title: 'New comment on your trip 💬',
                body: request.body.body.trim().slice(0, 100),
                data: { type: 'community', tripShareId: request.params.id },
              });
            }
          } catch { /* ignore notification failures */ }
        })();

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // PATCH /profile
    app.patch<{ Body: ProfileUpdateBody; Reply: ProfileResponse | ErrorResponse }>(
      '/profile',
      {
        schema: {
          body: profileUpdateRequestSchema,
          response: {
            200: profileResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireUser(request, dependencies);

        const rlDecision = await dependencies.rateLimiter.consume({
          bucket: 'write',
          key: buildRateLimitIdentity({ userId: user.id }),
          limit: dependencies.rateLimitPolicies.write.limit,
          windowMs: dependencies.rateLimitPolicies.write.windowMs,
        });
        reply.header('x-ratelimit-limit', rlDecision.limit);
        reply.header('x-ratelimit-remaining', rlDecision.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rlDecision.resetAt / 1000));
        if (!rlDecision.allowed) {
          throw new HttpError('Rate limit exceeded for this endpoint.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rlDecision.retryAfterMs / 1000))} seconds.`],
          });
        }

        const db = ensureSupabase();

        const updates: Record<string, unknown> = {};
        if (request.body.displayName !== undefined) updates.display_name = request.body.displayName.trim();
        if (request.body.username !== undefined) updates.username = request.body.username.trim().toLowerCase();
        if (request.body.autoShareRides !== undefined) updates.auto_share_rides = request.body.autoShareRides;
        if (request.body.trimRouteEndpoints !== undefined) updates.trim_route_endpoints = request.body.trimRouteEndpoints;
        if (request.body.cyclingGoal !== undefined) updates.cycling_goal = request.body.cyclingGoal;
        if (request.body.avatarUrl !== undefined) updates.avatar_url = request.body.avatarUrl;
        if (request.body.notifyWeather !== undefined) updates.notify_weather = request.body.notifyWeather;
        if (request.body.notifyHazard !== undefined) updates.notify_hazard = request.body.notifyHazard;
        if (request.body.notifyCommunity !== undefined) updates.notify_community = request.body.notifyCommunity;
        if (request.body.notifyStreak !== undefined) updates.notify_streak = request.body.notifyStreak;
        if (request.body.notifyImpactSummary !== undefined) updates.notify_impact_summary = request.body.notifyImpactSummary;
        if (request.body.quietHoursStart !== undefined) updates.quiet_hours_start = request.body.quietHoursStart;
        if (request.body.quietHoursEnd !== undefined) updates.quiet_hours_end = request.body.quietHoursEnd;
        if (request.body.quietHoursTimezone !== undefined) updates.quiet_hours_timezone = request.body.quietHoursTimezone;

        if (Object.keys(updates).length > 0) {
          const { error } = await db
            .from('profiles')
            .upsert({ id: user.id, ...updates }, { onConflict: 'id' });

          if (error) {
            // Check for unique constraint violation on username
            if (error.code === '23505' && error.message.includes('username')) {
              throw new HttpError('Username already taken.', {
                statusCode: 409,
                code: 'CONFLICT',
                details: ['This username is already in use. Please choose a different one.'],
              });
            }
            throw new HttpError('Profile update failed.', {
              statusCode: 502,
              code: 'UPSTREAM_ERROR',
              details: [error.message],
            });
          }
        }

        const { data, error } = await db
          .from('profiles')
          .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal')
          .eq('id', user.id)
          .single();

        if (error || !data) {
          throw new HttpError('Profile read failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error?.message ?? 'Not found'],
          });
        }

        return {
          id: data.id as string,
          displayName: data.display_name as string,
          username: (data.username as string) ?? null,
          avatarUrl: (data.avatar_url as string) ?? null,
          autoShareRides: Boolean(data.auto_share_rides),
          trimRouteEndpoints: Boolean(data.trim_route_endpoints),
          cyclingGoal: (data.cycling_goal as CyclingGoal) ?? null,
        };
      },
    );

    // GET /profile
    app.get<{ Reply: ProfileResponse | ErrorResponse }>(
      '/profile',
      {
        schema: {
          response: {
            200: profileResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { data, error } = await db
          .from('profiles')
          .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal')
          .eq('id', user.id)
          .single();

        if (error || !data) {
          // Auto-create profile if missing
          const email = user.email ?? 'rider';
          const fallbackName = email.includes('@') ? email.split('@')[0] : email;
          const { data: created, error: createError } = await db
            .from('profiles')
            .upsert({ id: user.id, display_name: fallbackName }, { onConflict: 'id' })
            .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal')
            .single();

          if (createError || !created) {
            throw new HttpError('Profile not found.', {
              statusCode: 502,
              code: 'UPSTREAM_ERROR',
              details: [createError?.message ?? 'Not found'],
            });
          }

          return {
            id: created.id as string,
            displayName: created.display_name as string,
            username: (created.username as string) ?? null,
            avatarUrl: (created.avatar_url as string) ?? null,
            autoShareRides: Boolean(created.auto_share_rides),
            trimRouteEndpoints: Boolean(created.trim_route_endpoints),
            cyclingGoal: (created.cycling_goal as CyclingGoal) ?? null,
          };
        }

        return {
          id: data.id as string,
          displayName: data.display_name as string,
          username: (data.username as string) ?? null,
          avatarUrl: (data.avatar_url as string) ?? null,
          autoShareRides: Boolean(data.auto_share_rides),
          trimRouteEndpoints: Boolean(data.trim_route_endpoints),
          cyclingGoal: (data.cycling_goal as CyclingGoal) ?? null,
        };
      },
    );

    // POST /users/:id/follow — follow a user
    app.post<{ Params: { id: string } }>(
      '/users/:id/follow',
      {
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
          response: { 200: { type: 'object', properties: { followedAt: { type: 'string' } } }, 401: errorResponseSchema, 409: errorResponseSchema },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();
        const targetId = request.params.id;

        if (targetId === user.id) {
          throw new HttpError('Cannot follow yourself.', { statusCode: 400, code: 'BAD_REQUEST' });
        }

        const { error } = await db.from('user_follows').insert({ follower_id: user.id, following_id: targetId });

        if (error) {
          if (error.code === '23505') return { followedAt: new Date().toISOString() }; // already following
          throw new HttpError('Follow failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        }

        return { followedAt: new Date().toISOString() };
      },
    );

    // DELETE /users/:id/follow — unfollow a user
    app.delete<{ Params: { id: string } }>(
      '/users/:id/follow',
      {
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
          response: { 200: { type: 'object', properties: { unfollowedAt: { type: 'string' } } }, 401: errorResponseSchema },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        await db.from('user_follows').delete().match({ follower_id: user.id, following_id: request.params.id });

        return { unfollowedAt: new Date().toISOString() };
      },
    );

    // GET /recent-destinations — 3 most recent distinct ride destinations
    app.get<{ Reply: { destinations: Array<{ label: string; coordinates: { lat: number; lon: number } }> } }>(
      '/recent-destinations',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              required: ['destinations'],
              properties: {
                destinations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['label', 'coordinates'],
                    properties: {
                      label: { type: 'string' },
                      coordinates: {
                        type: 'object',
                        required: ['lat', 'lon'],
                        properties: {
                          lat: { type: 'number' },
                          lon: { type: 'number' },
                        },
                      },
                      rodeAt: { type: 'string' },
                    },
                  },
                },
              },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        // Fetch 3 most recent distinct destinations from completed rides
        const { data, error } = await db
          .from('trips')
          .select('destination_text, destination_location, ended_at')
          .eq('user_id', user.id)
          .not('ended_at', 'is', null)
          .not('destination_text', 'is', null)
          .order('ended_at', { ascending: false })
          .limit(20); // over-fetch to deduplicate

        if (error) {
          throw new HttpError('Failed to load recent destinations.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // Deduplicate by destination_text (keep most recent), limit to 3
        const seen = new Set<string>();
        const destinations: Array<{ label: string; coordinates: { lat: number; lon: number }; rodeAt: string }> = [];

        for (const row of data ?? []) {
          const label = row.destination_text as string;
          if (seen.has(label)) continue;
          seen.add(label);

          // Parse PostGIS geography → {lat, lon}
          // destination_location is stored as geography(Point, 4326)
          // Supabase returns it as a GeoJSON-like string or object
          let lat = 0;
          let lon = 0;
          const loc = row.destination_location;
          if (typeof loc === 'string') {
            // Format: POINT(lon lat) or SRID=4326;POINT(lon lat)
            const match = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(loc);
            if (match) {
              lon = parseFloat(match[1]);
              lat = parseFloat(match[2]);
            }
          } else if (loc && typeof loc === 'object') {
            // GeoJSON: { type: 'Point', coordinates: [lon, lat] }
            const coords = (loc as { coordinates?: number[] }).coordinates;
            if (coords) {
              lon = coords[0];
              lat = coords[1];
            }
          }

          if (lat === 0 && lon === 0) continue; // skip invalid

          destinations.push({
            label,
            coordinates: { lat, lon },
            rodeAt: row.ended_at as string,
          });

          if (destinations.length >= 3) break;
        }

        return { destinations };
      },
    );

    // GET /users/:id/profile — public user profile with trips and follow status
    app.get<{ Params: { id: string } }>(
      '/users/:id/profile',
      {
        schema: {
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
          response: { 401: errorResponseSchema, 404: errorResponseSchema, 502: errorResponseSchema },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { data, error } = await db.rpc('get_user_public_profile', {
          p_user_id: request.params.id,
          p_requesting_user_id: user.id,
        });

        if (error) {
          throw new HttpError('Profile fetch failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        }

        if (!data) {
          throw new HttpError('User not found.', { statusCode: 404, code: 'NOT_FOUND' });
        }

        return data;
      },
    );
  };

  return routes;
};
