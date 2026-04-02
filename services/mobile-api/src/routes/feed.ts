import type {
  ErrorResponse,
  FeedComment,
  FeedItem,
  FeedResponse,
  ProfileResponse,
  SafetyTag,
  ShareTripRequest,
  WriteAckResponse,
} from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  feedCommentRequestSchema,
  feedCommentsResponseSchema,
  feedQuerystringSchema,
  feedResponseSchema,
  normalizeShareTripRequest,
  profileResponseSchema,
  profileUpdateRequestSchema,
  shareTripRequestSchema,
  type FeedCommentBody,
  type FeedQuerystring,
  type ProfileUpdateBody,
  type ShareTripBody,
  type TripShareIdParams,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
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

const mapFeedRow = (row: Record<string, unknown>, userId: string): FeedItem => {
  const profile = row.profiles as Record<string, unknown> | null;
  return {
    id: row.id as string,
    user: {
      id: row.user_id as string,
      displayName: (profile?.display_name as string) ?? 'Rider',
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
            properties: { id: { type: 'string', minLength: 1 } },
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
            properties: { id: { type: 'string', minLength: 1 } },
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
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } },
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
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } },
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
            properties: { id: { type: 'string', minLength: 1 } },
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

        const { data, error } = await db
          .from('feed_comments')
          .select('id, user_id, body, created_at, profiles(display_name, avatar_url)')
          .eq('trip_share_id', request.params.id)
          .order('created_at', { ascending: true });

        if (error) {
          throw new HttpError('Failed to load comments.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const comments: FeedComment[] = (data ?? []).map((row: Record<string, unknown>) => {
          const profile = row.profiles as Record<string, unknown> | null;
          return {
            id: row.id as string,
            user: {
              id: row.user_id as string,
              displayName: (profile?.display_name as string) ?? 'Rider',
              avatarUrl: (profile?.avatar_url as string) ?? null,
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
            properties: { id: { type: 'string', minLength: 1 } },
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
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const updates: Record<string, unknown> = {};
        if (request.body.displayName !== undefined) updates.display_name = request.body.displayName.trim();
        if (request.body.autoShareRides !== undefined) updates.auto_share_rides = request.body.autoShareRides;
        if (request.body.trimRouteEndpoints !== undefined) updates.trim_route_endpoints = request.body.trimRouteEndpoints;

        if (Object.keys(updates).length > 0) {
          const { error } = await db
            .from('profiles')
            .upsert({ id: user.id, ...updates }, { onConflict: 'id' });

          if (error) {
            throw new HttpError('Profile update failed.', {
              statusCode: 502,
              code: 'UPSTREAM_ERROR',
              details: [error.message],
            });
          }
        }

        const { data, error } = await db
          .from('profiles')
          .select('id, display_name, avatar_url, auto_share_rides, trim_route_endpoints')
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
          avatarUrl: (data.avatar_url as string) ?? null,
          autoShareRides: Boolean(data.auto_share_rides),
          trimRouteEndpoints: Boolean(data.trim_route_endpoints),
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
          .select('id, display_name, avatar_url, auto_share_rides, trim_route_endpoints')
          .eq('id', user.id)
          .single();

        if (error || !data) {
          // Auto-create profile if missing
          const email = user.email ?? 'rider';
          const fallbackName = email.includes('@') ? email.split('@')[0] : email;
          const { data: created, error: createError } = await db
            .from('profiles')
            .upsert({ id: user.id, display_name: fallbackName }, { onConflict: 'id' })
            .select('id, display_name, avatar_url, auto_share_rides, trim_route_endpoints')
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
            avatarUrl: (created.avatar_url as string) ?? null,
            autoShareRides: Boolean(created.auto_share_rides),
            trimRouteEndpoints: Boolean(created.trim_route_endpoints),
          };
        }

        return {
          id: data.id as string,
          displayName: data.display_name as string,
          avatarUrl: (data.avatar_url as string) ?? null,
          autoShareRides: Boolean(data.auto_share_rides),
          trimRouteEndpoints: Boolean(data.trim_route_endpoints),
        };
      },
    );
  };

  return routes;
};
