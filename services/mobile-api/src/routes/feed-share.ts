import type { ErrorResponse, ShareTripRequest } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import {
  errorResponseSchema,
  normalizeShareTripRequest,
  shareTripRequestSchema,
  type ShareTripBody,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { getTimezone, qualifyStreakAsync } from '../lib/streaks';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { XP_VALUES } from '../lib/xp';
import { ensureSupabase, requireUser, toPointWkt } from './feed-helpers';

export const buildFeedShareRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

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

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'trip_share',
              p_base_xp: XP_VALUES.trip_share, p_multiplier: 1.0,
              p_source_id: data.id as string,
            }); } catch { /* non-fatal */ }
          })();
        }

        return {
          id: data.id as string,
          sharedAt: data.shared_at as string,
        };
      },
    );

  };

  return routes;
};
