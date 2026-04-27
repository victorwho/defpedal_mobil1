import type { CyclingGoal, ErrorResponse, ProfileResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { requireFullUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  profileResponseSchema,
  profileUpdateRequestSchema,
  type ProfileUpdateBody,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { ensureSupabase, requireUser } from './feed-helpers';

export const buildFeedProfileRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

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
        if (request.body.isPrivate !== undefined) updates.is_private = request.body.isPrivate;
        if (request.body.notifyWeather !== undefined) updates.notify_weather = request.body.notifyWeather;
        if (request.body.notifyHazard !== undefined) updates.notify_hazard = request.body.notifyHazard;
        if (request.body.notifyCommunity !== undefined) updates.notify_community = request.body.notifyCommunity;
        if (request.body.notifyStreak !== undefined) updates.notify_streak = request.body.notifyStreak;
        if (request.body.notifyImpactSummary !== undefined) updates.notify_impact_summary = request.body.notifyImpactSummary;
        if (request.body.quietHoursStart !== undefined) updates.quiet_hours_start = request.body.quietHoursStart;
        if (request.body.quietHoursEnd !== undefined) updates.quiet_hours_end = request.body.quietHoursEnd;
        if (request.body.quietHoursTimezone !== undefined) updates.quiet_hours_timezone = request.body.quietHoursTimezone;
        if (request.body.shareConversionFeedOptin !== undefined)
          updates.share_conversion_feed_optin = request.body.shareConversionFeedOptin;
        if (request.body.keepFullGpsHistory !== undefined)
          updates.keep_full_gps_history = request.body.keepFullGpsHistory;

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
          .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal, is_private, share_conversion_feed_optin, keep_full_gps_history')
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
          isPrivate: Boolean(data.is_private),
          shareConversionFeedOptin:
            data.share_conversion_feed_optin === undefined ||
            data.share_conversion_feed_optin === null
              ? true
              : Boolean(data.share_conversion_feed_optin),
          keepFullGpsHistory: Boolean(data.keep_full_gps_history),
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
          .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal, is_private, share_conversion_feed_optin, keep_full_gps_history')
          .eq('id', user.id)
          .single();

        if (error || !data) {
          // Auto-create profile if missing
          const email = user.email ?? 'rider';
          const fallbackName = email.includes('@') ? email.split('@')[0] : email;
          const { data: created, error: createError } = await db
            .from('profiles')
            .upsert({ id: user.id, display_name: fallbackName }, { onConflict: 'id' })
            .select('id, display_name, username, avatar_url, auto_share_rides, trim_route_endpoints, cycling_goal, is_private, share_conversion_feed_optin, keep_full_gps_history')
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
            isPrivate: Boolean(created.is_private),
            shareConversionFeedOptin:
              created.share_conversion_feed_optin === undefined ||
              created.share_conversion_feed_optin === null
                ? true
                : Boolean(created.share_conversion_feed_optin),
            keepFullGpsHistory: Boolean(created.keep_full_gps_history),
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
          isPrivate: Boolean(data.is_private),
          shareConversionFeedOptin:
            data.share_conversion_feed_optin === undefined ||
            data.share_conversion_feed_optin === null
              ? true
              : Boolean(data.share_conversion_feed_optin),
          keepFullGpsHistory: Boolean(data.keep_full_gps_history),
        };
      },
    );

    // NOTE: follow/unfollow endpoints moved to routes/follow.ts (enhanced with private profile handling)

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

          // Parse PostGIS geography -> {lat, lon}
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

    // DELETE /profile — irreversible account deletion (Play Store User Data
    // policy + GDPR Art. 17 right to erasure).
    //
    // Requires `confirmation: 'DELETE'` in the body to prevent accidents.
    // `requireFullUser` rejects anonymous Supabase sessions (they have no
    // email and no account-bound data to delete — the anon row will be
    // recycled by Supabase's anonymous user GC).
    //
    // Mechanism: a single call to supabaseAdmin.auth.admin.deleteUser(uid)
    // cascades through all FKs in supabase/migrations/202604200001_cascade_user_fks.sql
    // and the related community-feed schema (trip_shares, feed_likes, feed_comments,
    // trip_loves all FK to auth.users ON DELETE CASCADE). Tables that anonymise
    // user_id rather than delete (hazards, navigation_feedback, notifications)
    // do so via ON DELETE SET NULL — preserving community trust signals while
    // removing the user's PII.
    app.delete<{ Body: { confirmation: string }; Reply: ErrorResponse | { deletedAt: string } }>(
      '/profile',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['confirmation'],
            properties: {
              confirmation: {
                type: 'string',
                enum: ['DELETE'],
                description: 'Must be the literal string "DELETE" to confirm intent.',
              },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['deletedAt'],
              properties: {
                deletedAt: { type: 'string', format: 'date-time' },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies.authenticateUser);

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

        if (request.body.confirmation !== 'DELETE') {
          throw new HttpError('Confirmation token is invalid.', {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details: ['confirmation must be the literal string "DELETE".'],
          });
        }

        const db = ensureSupabase();

        // Delete from auth.users — cascades remove the rest.
        const { error } = await db.auth.admin.deleteUser(user.id);

        if (error) {
          request.log.error({ err: error, userId: user.id }, 'account deletion failed');
          throw new HttpError('Account deletion failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        request.log.info({ userId: user.id }, 'account deleted by user request');

        return { deletedAt: new Date().toISOString() };
      },
    );

  };

  return routes;
};
