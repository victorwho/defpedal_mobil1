import type {
  AutocompleteResponse,
  CoverageResponse,
  ErrorResponse,
  GeoJsonLineString,
  HazardReportResponse,
  RerouteRequest,
  RiskSegment,
  RoutePreviewRequest,
  TripEndResponse,
  TripStartResponse,
  TripStatsDashboard,
  UserStats,
  WriteAckResponse,
  ReverseGeocodeResponse,
  RoutePreviewResponse,
  NeighborhoodSafetyScore,
  RideImpact,
  ImpactDashboard,
  GuardianTier,
  QuizQuestion,
  QuizAnswer,
} from '@defensivepedal/core';
import { getPreviewOrigin } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { config } from '../config';
import { getAuthenticatedUserFromRequest, requireAuthenticatedUser } from '../lib/auth';
import { buildCacheKey } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
import { fetchLoopRoute, type LoopRouteRequest } from '../lib/loopRoute';
import {
  sendStreakProtectionReminders,
  sendWeeklyImpactSummary,
  sendSocialImpactDigest,
} from '../lib/scheduledNotifications';
import {
  autocompleteRequestSchema,
  autocompleteResponseSchema,
  coverageQuerystringSchema,
  coverageResponseSchema,
  errorResponseSchema,
  hazardReportRequestSchema,
  hazardReportResponseSchema,
  HttpError,
  normalizeAutocompleteRequest,
  normalizeHazardReportRequest,
  normalizeNavigationFeedbackRequest,
  normalizeRerouteRequest,
  normalizeReverseGeocodeRequest,
  normalizeTripEndRequest,
  normalizeTripStartRequest,
  normalizeRoutePreviewRequest,
  navigationFeedbackRequestSchema,
  rerouteRequestSchema,
  reverseGeocodeRequestSchema,
  reverseGeocodeResponseSchema,
  routePreviewRequestSchema,
  routePreviewResponseSchema,
  tripEndRequestSchema,
  tripEndResponseSchema,
  tripStartRequestSchema,
  tripStartResponseSchema,
  type AutocompleteBody,
  type CoverageQuerystring,
  type HazardReportBody,
  type NavigationFeedbackBody,
  type RerouteBody,
  type ReverseGeocodeBody,
  type RoutePreviewBody,
  type TripEndBody,
  type TripStartBody,
  writeAckResponseSchema,
} from '../lib/http';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { supabaseAdmin } from '../lib/supabaseAdmin';

type NormalizedRouteRequest = RoutePreviewRequest | RerouteRequest;
type RateLimitPolicyKey = keyof MobileApiDependencies['rateLimitPolicies'];

/** Extract timezone from x-timezone header, default to UTC. */
const getTimezone = (request: FastifyRequest): string =>
  (request.headers['x-timezone'] as string | undefined) ?? 'UTC';

/**
 * Fire-and-forget: call qualify_streak_action RPC.
 * Failures are logged but never propagate to the caller.
 */
const qualifyStreakAsync = (
  userId: string,
  actionType: string,
  timeZone: string,
  logger: FastifyRequest['log'],
): void => {
  if (!supabaseAdmin) return;
  void supabaseAdmin
    .rpc('qualify_streak_action', {
      p_user_id: userId,
      p_action_type: actionType,
      p_time_zone: timeZone,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn({ event: 'streak_qualify_error', actionType, error: error.message }, 'streak qualification failed');
      }
    });
};

const buildEmptyRouteResponse = (
  mode: RoutePreviewBody['mode'],
  coverage: RoutePreviewResponse['coverage'],
): RoutePreviewResponse => ({
  routes: [],
  selectedMode: mode,
  coverage,
  generatedAt: new Date().toISOString(),
});

const setRateLimitHeaders = (
  reply: FastifyReply,
  decision: {
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfterMs: number;
  },
) => {
  reply.header('x-ratelimit-limit', decision.limit);
  reply.header('x-ratelimit-remaining', decision.remaining);
  reply.header('x-ratelimit-reset', Math.ceil(decision.resetAt / 1000));

  if (decision.retryAfterMs > 0) {
    reply.header('retry-after', Math.max(1, Math.ceil(decision.retryAfterMs / 1000)));
  }
};

const applyRateLimit = (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: MobileApiDependencies,
  policyKey: RateLimitPolicyKey,
  options: {
    userId?: string;
  } = {},
) =>
  dependencies.rateLimiter.consume({
    bucket: policyKey,
    key: buildRateLimitIdentity({
      ip: request.ip,
      userId: options.userId,
    }),
    limit: dependencies.rateLimitPolicies[policyKey].limit,
    windowMs: dependencies.rateLimitPolicies[policyKey].windowMs,
  }).then((decision) => {
    setRateLimitHeaders(reply, decision);

    if (!decision.allowed) {
      request.log.warn(
        {
          event: 'mobile_api_rate_limited',
          policy: policyKey,
          ip: request.ip,
          userId: options.userId,
        },
        'request rate limited',
      );

      throw new HttpError('Rate limit exceeded for this endpoint.', {
        statusCode: 429,
        code: 'RATE_LIMITED',
        details: [`Retry after ${Math.max(1, Math.ceil(decision.retryAfterMs / 1000))} seconds.`],
      });
    }
  });

const buildRouteResponse = async (
  dependencies: MobileApiDependencies,
  normalizedRequest: NormalizedRouteRequest,
  requestType: 'preview' | 'reroute',
  context: {
    request: FastifyRequest;
    reply: FastifyReply;
  },
): Promise<RoutePreviewResponse> => {
  const cacheTtlMs =
    requestType === 'preview'
      ? dependencies.routeResponseCacheTtlMs.preview
      : dependencies.routeResponseCacheTtlMs.reroute;
  const cacheKey = buildCacheKey(`routes:${requestType}`, {
    request: normalizedRequest,
    versions: config.versions,
  });

  if (cacheTtlMs > 0) {
    const cachedResponse = await dependencies.routeResponseCache.get<RoutePreviewResponse>(cacheKey);

    if (cachedResponse) {
      context.reply.header('x-route-cache', 'HIT');
      context.request.log.info(
        {
          event: 'mobile_api_route_cache',
          requestType,
          cacheStatus: 'hit',
          mode: normalizedRequest.mode,
        },
        'route response cache hit',
      );
      return cachedResponse;
    }
  }

  context.reply.header('x-route-cache', 'MISS');

  const coverage = dependencies.resolveCoverage(
    normalizedRequest.destination,
    normalizedRequest.countryHint,
  );

  let response: RoutePreviewResponse;

  if (normalizedRequest.mode === 'safe' && !coverage.safeRouting) {
    response = buildEmptyRouteResponse(normalizedRequest.mode, coverage);
    if (cacheTtlMs > 0) {
      await dependencies.routeResponseCache.set(cacheKey, response, cacheTtlMs);
    }
    return response;
  }

  if (normalizedRequest.mode === 'fast' && !coverage.fastRouting) {
    response = buildEmptyRouteResponse(normalizedRequest.mode, coverage);
    if (cacheTtlMs > 0) {
      await dependencies.routeResponseCache.set(cacheKey, response, cacheTtlMs);
    }
    return response;
  }

  try {
    const previewOrigin = getPreviewOrigin(normalizedRequest);
    const routeResponse =
      normalizedRequest.mode === 'safe'
        ? await dependencies.fetchSafeRoutes({
            origin: previewOrigin,
            destination: normalizedRequest.destination,
            avoidUnpaved: normalizedRequest.avoidUnpaved,
          })
        : await dependencies.fetchFastRoutes(
            previewOrigin,
            normalizedRequest.destination,
          );

    const elevationsByRoute = await Promise.all(
      routeResponse.routes.map(async (route) => {
        try {
          return await dependencies.getElevationProfile(route.geometry.coordinates);
        } catch {
          return null;
        }
      }),
    );

    const riskByRoute = await Promise.all(
      routeResponse.routes.map(async (route) => {
        try {
          return await dependencies.fetchRiskSegments(route.geometry);
        } catch {
          return [];
        }
      }),
    );

    const warningsByRoute = routeResponse.routes.map((_, index) => {
      const warnings: string[] = [];

      if (!elevationsByRoute[index]) {
        warnings.push('Elevation data unavailable; terrain-adjusted ETA is approximate.');
      }

      if (riskByRoute[index].length === 0) {
        warnings.push('Risk overlay unavailable for this route preview.');
      }

      return warnings;
    });

    response = dependencies.normalizeRoutePreviewResponse({
      routeResponse,
      mode: normalizedRequest.mode,
      coverage,
      elevationsByRoute,
      riskByRoute,
      warningsByRoute,
      includeDebug: normalizedRequest.debug,
    });

    if (cacheTtlMs > 0) {
      await dependencies.routeResponseCache.set(cacheKey, response, cacheTtlMs);
    }

    context.request.log.info(
      {
        event: 'mobile_api_route_cache',
        requestType,
        cacheStatus: 'miss',
        mode: normalizedRequest.mode,
        routeCount: response.routes.length,
      },
      'route response cache miss',
    );

    return response;
  } catch (error) {
    throw new HttpError(`Failed to generate ${normalizedRequest.mode} route preview.`, {
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
    });
  }
};

const requireWriteUser = (
  request: Parameters<typeof requireAuthenticatedUser>[0],
  dependencies: MobileApiDependencies,
) => requireAuthenticatedUser(request, dependencies.authenticateUser);

export const buildV1Routes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.get<{ Querystring: CoverageQuerystring; Reply: CoverageResponse | ErrorResponse }>(
      '/coverage',
      {
        schema: {
          querystring: coverageQuerystringSchema,
          response: {
            200: coverageResponseSchema,
            400: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) =>
        dependencies.buildCoverageResponse(
          {
            lat: request.query.lat,
            lon: request.query.lon,
          },
          request.query.countryHint,
        ),
    );

    app.post<{ Body: AutocompleteBody; Reply: AutocompleteResponse | ErrorResponse }>(
      '/search/autocomplete',
      {
        schema: {
          body: autocompleteRequestSchema,
          response: {
            200: autocompleteResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const normalizedRequest = normalizeAutocompleteRequest(request.body);

        try {
          return {
            suggestions: await dependencies.forwardGeocode(normalizedRequest),
            generatedAt: new Date().toISOString(),
          };
        } catch (error) {
          throw new HttpError('Search autocomplete failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post<{ Body: ReverseGeocodeBody; Reply: ReverseGeocodeResponse | ErrorResponse }>(
      '/search/reverse-geocode',
      {
        schema: {
          body: reverseGeocodeRequestSchema,
          response: {
            200: reverseGeocodeResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        try {
          return await dependencies.reverseGeocode(
            normalizeReverseGeocodeRequest(request.body),
          );
        } catch (error) {
          throw new HttpError('Reverse geocode failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post<{ Body: RoutePreviewBody; Reply: RoutePreviewResponse | ErrorResponse }>(
      '/routes/preview',
      {
        schema: {
          body: routePreviewRequestSchema,
          response: {
            200: routePreviewResponseSchema,
            400: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await applyRateLimit(request, reply, dependencies, 'routePreview');
        const normalizedRequest = normalizeRoutePreviewRequest(request.body);

        return buildRouteResponse(dependencies, normalizedRequest, 'preview', {
          request,
          reply,
        });
      },
    );

    app.post<{ Body: TripStartBody; Reply: TripStartResponse | ErrorResponse }>(
      '/trips/start',
      {
        schema: {
          body: tripStartRequestSchema,
          response: {
            200: tripStartResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          return await dependencies.startTripRecord(normalizeTripStartRequest(request.body), user.id);
        } catch (error) {
          throw new HttpError('Trip start failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post<{ Body: TripEndBody; Reply: TripEndResponse | ErrorResponse }>(
      '/trips/end',
      {
        schema: {
          body: tripEndRequestSchema,
          response: {
            200: tripEndResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          const result = await dependencies.finishTripRecord(normalizeTripEndRequest(request.body), user.id);
          qualifyStreakAsync(user.id, 'ride', getTimezone(request), request.log);
          return result;
        } catch (error) {
          throw new HttpError('Trip completion failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post(
      '/trips/track',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['tripId', 'clientTripId', 'routingMode', 'gpsBreadcrumbs', 'endReason', 'startedAt', 'endedAt'],
            properties: {
              tripId: { type: 'string', minLength: 1, maxLength: 100 },
              clientTripId: { type: 'string', minLength: 1, maxLength: 100 },
              routingMode: { type: 'string', enum: ['safe', 'fast'] },
              plannedRoutePolyline6: { type: 'string', maxLength: 500000 },
              plannedRouteDistanceMeters: { type: 'number', minimum: 0, maximum: 1000000 },
              gpsBreadcrumbs: {
                type: 'array',
                maxItems: 10000,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['lat', 'lon', 'ts'],
                  properties: {
                    lat: { type: 'number', minimum: -90, maximum: 90 },
                    lon: { type: 'number', minimum: -180, maximum: 180 },
                    ts: { type: 'number' },
                    acc: { type: ['number', 'null'] },
                    spd: { type: ['number', 'null'] },
                    hdg: { type: ['number', 'null'] },
                  },
                },
              },
              endReason: { type: 'string', enum: ['completed', 'stopped', 'app_killed'] },
              startedAt: { type: 'string', format: 'date-time' },
              endedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          const body = request.body as {
            tripId: string;
            clientTripId: string;
            routingMode: 'safe' | 'fast';
            plannedRoutePolyline6?: string;
            plannedRouteDistanceMeters?: number;
            gpsBreadcrumbs: Array<{ lat: number; lon: number; ts: number; acc: number | null; spd: number | null; hdg: number | null }>;
            endReason: 'completed' | 'stopped' | 'app_killed';
            startedAt: string;
            endedAt: string;
          };

          return await dependencies.saveTripTrack(
            {
              tripId: body.tripId,
              clientTripId: body.clientTripId,
              routingMode: body.routingMode,
              plannedRoutePolyline6: body.plannedRoutePolyline6,
              plannedRouteDistanceMeters: body.plannedRouteDistanceMeters,
              gpsBreadcrumbs: body.gpsBreadcrumbs,
              endReason: body.endReason,
              startedAt: body.startedAt,
              endedAt: body.endedAt,
            },
            user.id,
          );
        } catch (error) {
          throw new HttpError('Trip track save failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.get(
      '/trips/history',
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          return await dependencies.getTripHistory(user.id);
        } catch (error) {
          throw new HttpError('Trip history fetch failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post<{ Body: HazardReportBody; Reply: HazardReportResponse | ErrorResponse }>(
      '/hazards',
      {
        schema: {
          body: hazardReportRequestSchema,
          response: {
            200: hazardReportResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await getAuthenticatedUserFromRequest(
          request,
          dependencies.authenticateUser,
        );
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user?.id,
        });

        try {
          const result = await dependencies.submitHazardReport(
            normalizeHazardReportRequest(request.body),
            user?.id ?? null,
          );
          // Streak qualification (fire-and-forget)
          if (user?.id) {
            qualifyStreakAsync(user.id, 'hazard_report', getTimezone(request), request.log);
          }
          return result;
        } catch (error) {
          throw new HttpError('Hazard report failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    // ── Nearby hazards (for navigation alerts) ──

    app.get<{
      Querystring: { lat: string; lon: string; radiusMeters?: string };
    }>('/hazards/nearby', async (request, reply) => {
      const lat = parseFloat(request.query.lat);
      const lon = parseFloat(request.query.lon);
      const radiusMeters = parseFloat(request.query.radiusMeters ?? '1000');

      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        return reply.status(400).send({
          error: 'Invalid coordinates.',
          code: 'VALIDATION_ERROR',
          details: ['lat and lon must be valid numbers.'],
        });
      }

      try {
        // Convert radius to approximate degree delta for bbox query
        const degDelta = radiusMeters / 111_000;
        if (!supabaseAdmin) throw new Error('Supabase admin client not available');

        // location is JSONB with { latitude, longitude } — use raw SQL filter
        const { data, error } = await supabaseAdmin
          .from('hazards')
          .select('id, location, hazard_type, created_at, confirm_count, deny_count, expires_at')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) throw error;

        // Filter by bbox in JS since JSONB nested fields can't use .gte/.lte
        const hazards = (data ?? [])
          .filter((row: Record<string, unknown>) => {
            const loc = row.location as { latitude?: number; longitude?: number } | null;
            if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return false;
            return (
              loc.latitude >= lat - degDelta &&
              loc.latitude <= lat + degDelta &&
              loc.longitude >= lon - degDelta &&
              loc.longitude <= lon + degDelta
            );
          })
          .map((row: Record<string, unknown>) => {
            const loc = row.location as { latitude: number; longitude: number };
            return {
              id: row.id,
              lat: loc.latitude,
              lon: loc.longitude,
              hazardType: row.hazard_type,
              createdAt: row.created_at,
              confirmCount: (row.confirm_count as number) ?? 0,
              denyCount: (row.deny_count as number) ?? 0,
            };
          });

        return { hazards };
      } catch (error) {
        throw new HttpError('Failed to fetch nearby hazards.', {
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
          details: [error instanceof Error ? error.message : 'Unknown error.'],
        });
      }
    });

    // ── Hazard validation (Still there? Yes/No) ──

    app.post<{
      Params: { hazardId: string };
      Body: { response: 'confirm' | 'deny' | 'pass' };
    }>('/hazards/:hazardId/validate', {
      schema: {
        params: {
          type: 'object',
          required: ['hazardId'],
          properties: {
            hazardId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['response'],
          properties: {
            response: { type: 'string', enum: ['confirm', 'deny', 'pass'] },
          },
        },
      },
    }, async (request, reply) => {
      const user = await getAuthenticatedUserFromRequest(
        request,
        dependencies.authenticateUser,
      );

      if (!user) {
        return reply.status(401).send({
          error: 'Authentication required.',
          code: 'UNAUTHORIZED',
          details: ['You must be signed in to validate hazards.'],
        });
      }

      const { hazardId } = request.params;
      const { response: validationResponse } = request.body;

      try {
        if (!supabaseAdmin) throw new Error('Supabase admin client not available');

        const { error } = await supabaseAdmin
          .from('hazard_validations')
          .upsert(
            {
              hazard_id: hazardId,
              user_id: user.id,
              response: validationResponse,
              responded_at: new Date().toISOString(),
            },
            { onConflict: 'hazard_id,user_id' },
          );

        if (error) throw error;

        qualifyStreakAsync(user.id, 'hazard_validate', getTimezone(request), request.log);

        return { acceptedAt: new Date().toISOString() };
      } catch (error) {
        throw new HttpError('Hazard validation failed.', {
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
          details: [error instanceof Error ? error.message : 'Unknown error.'],
        });
      }
    });

    app.post<{ Body: NavigationFeedbackBody; Reply: WriteAckResponse | ErrorResponse }>(
      '/feedback',
      {
        schema: {
          body: navigationFeedbackRequestSchema,
          response: {
            200: writeAckResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          return await dependencies.submitNavigationFeedback(
            normalizeNavigationFeedbackRequest(request.body),
            user.id,
          );
        } catch (error) {
          throw new HttpError('Feedback submission failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    app.post<{
      Body: { coordinates: number[][] };
      Reply: { elevationProfile: number[] } | ErrorResponse;
    }>(
      '/elevation-profile',
      {
        schema: {
          response: {
            200: { type: 'object' as const, properties: { elevationProfile: { type: 'array' as const } } },
            400: errorResponseSchema,
            429: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await applyRateLimit(request, reply, dependencies, 'routePreview');

        const coordinates = request.body?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
          throw new HttpError('Invalid coordinates.', {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details: ['Body must contain a coordinates array with at least 2 points.'],
          });
        }

        try {
          const elevationProfile = await dependencies.getElevationProfile(
            coordinates as [number, number][],
          );
          return { elevationProfile: elevationProfile ?? [] };
        } catch (error) {
          throw new HttpError('Elevation profile fetch failed.', {
            statusCode: 500,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown error.'],
          });
        }
      },
    );

    app.post<{
      Body: { geometry: { type: string; coordinates: number[][] } };
      Reply: { riskSegments: RiskSegment[] } | ErrorResponse;
    }>(
      '/risk-segments',
      {
        schema: {
          response: {
            200: { type: 'object' as const, properties: { riskSegments: { type: 'array' as const } } },
            400: errorResponseSchema,
            429: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await applyRateLimit(request, reply, dependencies, 'routePreview');

        const geometry = request.body?.geometry;
        if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
          throw new HttpError('Invalid geometry.', {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            details: ['Body must contain a GeoJSON LineString geometry.'],
          });
        }

        try {
          const riskSegments = await dependencies.fetchRiskSegments(
            geometry as GeoJsonLineString,
          );
          return { riskSegments };
        } catch (error) {
          throw new HttpError('Risk segment fetch failed.', {
            statusCode: 500,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown error.'],
          });
        }
      },
    );

    app.post<{ Body: RerouteBody; Reply: RoutePreviewResponse | ErrorResponse }>(
      '/routes/reroute',
      {
        schema: {
          body: rerouteRequestSchema,
          response: {
            200: routePreviewResponseSchema,
            400: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await applyRateLimit(request, reply, dependencies, 'routeReroute');
        const normalizedRequest = normalizeRerouteRequest(request.body);

        return buildRouteResponse(dependencies, normalizedRequest, 'reroute', {
          request,
          reply,
        });
      },
    );

  // ── Push token registration ──
  app.put(
    '/push-token',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expoPushToken', 'deviceId', 'platform'],
          properties: {
            expoPushToken: { type: 'string', minLength: 1, maxLength: 200 },
            deviceId: { type: 'string', minLength: 1, maxLength: 200 },
            platform: { type: 'string', enum: ['android', 'ios'] },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await requireWriteUser(request, dependencies);

      const { expoPushToken, deviceId, platform } = request.body as {
        expoPushToken: string;
        deviceId: string;
        platform: string;
      };

      if (!expoPushToken || !deviceId || !platform) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }

      const { error } = await supabaseAdmin
        .from('push_tokens')
        .upsert(
          {
            user_id: user.id,
            expo_push_token: expoPushToken,
            device_id: deviceId,
            platform,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' },
        );

      if (error) {
        request.log.error({ error }, 'push token upsert failed');
        return reply.status(500).send({ error: 'Failed to register push token' });
      }

      return reply.send({ acceptedAt: new Date().toISOString() });
    },
  );

  app.delete(
    '/push-token',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await requireWriteUser(request, dependencies);

      const { deviceId } = request.body as { deviceId: string };
      if (!deviceId) {
        return reply.status(400).send({ error: 'Missing deviceId' });
      }

      await supabaseAdmin
        .from('push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('device_id', deviceId);

      return reply.send({ acceptedAt: new Date().toISOString() });
    },
  );

  // ── Admin notification send ──
  // NOTE: This endpoint is restricted to the internal admin bypass token only.
  // Regular Supabase-authenticated users are rejected regardless of their role.
  app.post(
    '/notifications/send',
    async (request, reply) => {
      // Only allow the dev-auth bypass user (internal/admin use only).
      // A real Supabase user JWT must never be able to reach this.
      if (!config.devAuthBypass.enabled) {
        return reply.status(403).send({
          error: 'This endpoint is disabled.',
          code: 'UNAUTHORIZED',
        });
      }

      const authHeader = request.headers.authorization ?? '';
      const accessToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';

      const { authenticateDeveloperBypassToken } = await import('../lib/auth');
      const adminUser = authenticateDeveloperBypassToken(accessToken);
      if (!adminUser) {
        return reply.status(403).send({
          error: 'Admin access required.',
          code: 'UNAUTHORIZED',
        });
      }

      const { dispatchNotification, broadcastNotification } = await import('../lib/notifications');
      const { userId, category, title, body, data } = request.body as {
        userId?: string;
        category: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
      };

      if (!category || !title || !body) {
        return reply.status(400).send({ error: 'Missing required fields: category, title, body' });
      }

      const VALID_CATEGORIES = ['weather', 'hazard', 'community', 'system'];
      if (!VALID_CATEGORIES.includes(category)) {
        return reply.status(400).send({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }

      try {
        if (userId) {
          await dispatchNotification(userId, category as 'weather' | 'hazard' | 'community' | 'system', { title, body, data });
          return reply.send({ sent: 1 });
        }

        const count = await broadcastNotification(category as 'weather' | 'hazard' | 'community' | 'system', { title, body, data });
        return reply.send({ sent: count });
      } catch (err) {
        request.log.error({ err }, 'notification send failed');
        return reply.status(500).send({ error: 'Failed to send notification' });
      }
    },
  );

  // GET /v1/stats — cumulative user trip stats + CO2 savings
  app.get<{ Reply: UserStats | ErrorResponse }>(
    '/stats',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['totalTrips', 'totalDistanceMeters', 'totalCo2SavedKg', 'totalDurationSeconds'],
            properties: {
              totalTrips: { type: 'integer' },
              totalDistanceMeters: { type: 'number' },
              totalCo2SavedKg: { type: 'number' },
              totalDurationSeconds: { type: 'number' },
            },
          },
          401: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await requireWriteUser(request, dependencies);
      await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

      try {
        return await dependencies.getUserStats(user.id);
      } catch (error) {
        throw new HttpError('Stats fetch failed.', {
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
          details: [error instanceof Error ? error.message : 'Unknown error.'],
        });
      }
    },
  );

  // GET /v1/stats/dashboard — full trip statistics dashboard
  app.get<{ Querystring: { tz?: string }; Reply: TripStatsDashboard | ErrorResponse }>(
    '/stats/dashboard',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            tz: { type: 'string', maxLength: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: [
              'totals', 'weekly', 'monthly',
              'currentStreakDays', 'longestStreakDays', 'modeSplit',
            ],
            properties: {
              totals: {
                type: 'object',
                additionalProperties: false,
                required: ['totalTrips', 'totalDistanceMeters', 'totalCo2SavedKg', 'totalDurationSeconds'],
                properties: {
                  totalTrips: { type: 'integer' },
                  totalDistanceMeters: { type: 'number' },
                  totalCo2SavedKg: { type: 'number' },
                  totalDurationSeconds: { type: 'number' },
                },
              },
              weekly: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['periodStart', 'trips', 'distanceMeters', 'durationSeconds'],
                  properties: {
                    periodStart: { type: 'string' },
                    trips: { type: 'integer' },
                    distanceMeters: { type: 'number' },
                    durationSeconds: { type: 'number' },
                  },
                },
              },
              monthly: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['periodStart', 'trips', 'distanceMeters', 'durationSeconds'],
                  properties: {
                    periodStart: { type: 'string' },
                    trips: { type: 'integer' },
                    distanceMeters: { type: 'number' },
                    durationSeconds: { type: 'number' },
                  },
                },
              },
              currentStreakDays: { type: 'integer' },
              longestStreakDays: { type: 'integer' },
              modeSplit: {
                type: 'object',
                additionalProperties: false,
                required: ['safeTrips', 'fastTrips'],
                properties: {
                  safeTrips: { type: 'integer' },
                  fastTrips: { type: 'integer' },
                },
              },
            },
          },
          401: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await requireWriteUser(request, dependencies);
      await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

      try {
        return await dependencies.getTripStatsDashboard(user.id, request.query.tz ?? 'UTC');
      } catch (error) {
        throw new HttpError('Stats dashboard fetch failed.', {
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
          details: [error instanceof Error ? error.message : 'Unknown error.'],
        });
      }
    },
  );

    // POST /v1/loop-route — generate a circular loop route from origin
    app.post<{
      Body: {
        origin: { lat: number; lon: number };
        distancePreferenceMeters: number;
        safetyFloor?: number;
        waypointCount?: 2 | 3;
      };
      Reply: RoutePreviewResponse | ErrorResponse;
    }>(
      '/loop-route',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['origin', 'distancePreferenceMeters'],
            properties: {
              origin: {
                type: 'object',
                additionalProperties: false,
                required: ['lat', 'lon'],
                properties: {
                  lat: { type: 'number', minimum: -90, maximum: 90 },
                  lon: { type: 'number', minimum: -180, maximum: 180 },
                },
              },
              distancePreferenceMeters: { type: 'number', minimum: 500, maximum: 50000 },
              safetyFloor: { type: 'number', minimum: 0, maximum: 100 },
              waypointCount: { type: 'integer', enum: [2, 3] },
            },
          },
          response: {
            200: routePreviewResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        const { origin, distancePreferenceMeters, safetyFloor, waypointCount } = request.body;

        const loopRequest: LoopRouteRequest = {
          origin,
          distancePreferenceMeters,
          safetyFloor,
          waypointCount,
        };

        try {
          const routeResponse = await fetchLoopRoute(loopRequest);

          const elevationsByRoute = await Promise.all(
            routeResponse.routes.map(async (route) => {
              try {
                return await dependencies.getElevationProfile(route.geometry.coordinates);
              } catch {
                return null;
              }
            }),
          );

          const riskByRoute = await Promise.all(
            routeResponse.routes.map(async (route) => {
              try {
                return await dependencies.fetchRiskSegments(route.geometry);
              } catch {
                return [];
              }
            }),
          );

          const warningsByRoute = routeResponse.routes.map((_, index) => {
            const warnings: string[] = [];
            if (!elevationsByRoute[index]) {
              warnings.push('Elevation data unavailable; terrain-adjusted ETA is approximate.');
            }
            if (riskByRoute[index].length === 0) {
              warnings.push('Risk overlay unavailable for this route preview.');
            }
            return warnings;
          });

          const coverageResponse = dependencies.buildCoverageResponse(origin);
          const coverage = coverageResponse.matched ?? coverageResponse.regions[0] ?? {
            countryCode: '',
            status: 'partial' as const,
            safeRouting: true,
            fastRouting: false,
          };

          return dependencies.normalizeRoutePreviewResponse({
            routeResponse,
            mode: 'safe',
            coverage,
            elevationsByRoute,
            riskByRoute,
            warningsByRoute,
          });
        } catch (error) {
          throw new HttpError('Failed to generate loop route.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error instanceof Error ? error.message : 'Unknown upstream error.'],
          });
        }
      },
    );

    // GET /v1/safety-score — neighborhood safety score from road risk data
    app.get<{
      Querystring: { lat: number; lon: number; radiusKm?: number };
      Reply: NeighborhoodSafetyScore | ErrorResponse;
    }>(
      '/safety-score',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            required: ['lat', 'lon'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
              radiusKm: { type: 'number', minimum: 0.1, maximum: 10 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['score', 'totalSegments', 'safeCount', 'averageCount', 'riskyCount', 'veryRiskyCount'],
              properties: {
                score: { type: 'number' },
                totalSegments: { type: 'integer' },
                safeCount: { type: 'integer' },
                averageCount: { type: 'integer' },
                riskyCount: { type: 'integer' },
                veryRiskyCount: { type: 'integer' },
              },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
          });
        }

        const { lat, lon, radiusKm } = request.query;
        const radiusMeters = (radiusKm ?? 1) * 1000;

        const { data, error } = await supabaseAdmin.rpc('get_neighborhood_safety_score', {
          p_lat: lat,
          p_lon: lon,
          p_radius_meters: radiusMeters,
        });

        if (error) {
          request.log.error({ event: 'safety_score_error', error: error.message }, 'safety score query failed');
          throw new HttpError('Safety score query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const row = Array.isArray(data) ? data[0] : data;

        return {
          score: Math.max(0, Math.min(100, Math.round(100 - Number(row?.avg_score ?? 0)))),
          totalSegments: Number(row?.total_segments ?? 0),
          safeCount: Number(row?.safe_count ?? 0),
          averageCount: Number(row?.average_count ?? 0),
          riskyCount: Number(row?.risky_count ?? 0),
          veryRiskyCount: Number(row?.very_risky_count ?? 0),
        };
      },
    );

    // GET /v1/risk-map — road risk segments as GeoJSON within radius
    app.get<{
      Querystring: { lat: number; lon: number; radiusKm?: number };
    }>(
      '/risk-map',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            required: ['lat', 'lon'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
              radiusKm: { type: 'number', minimum: 0.1, maximum: 5 },
            },
          },
          response: {
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Risk map is read-only public safety data — auth optional
        // Still try to authenticate for rate limiting, but don't require it
        const user = await getAuthenticatedUserFromRequest(request, dependencies.authenticateUser);
        if (user) {
          await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });
        }

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const { lat, lon, radiusKm } = request.query;
        const radiusMeters = (radiusKm ?? 1) * 1000;

        const { data, error } = await supabaseAdmin.rpc('get_road_risk_geojson', {
          p_lat: lat,
          p_lon: lon,
          p_radius_meters: radiusMeters,
        });

        if (error) {
          request.log.error({ event: 'risk_map_error', error: error.message }, 'risk map query failed');
          throw new HttpError('Risk map query failed.', { statusCode: 502, code: 'UPSTREAM_ERROR', details: [error.message] });
        }

        return data ?? { type: 'FeatureCollection', features: [] };
      },
    );

    // POST /v1/rides/:tripId/impact — record ride impact and return with random equivalent
    app.post<{
      Params: { tripId: string };
      Body: { distanceMeters: number };
      Reply: RideImpact | ErrorResponse;
    }>(
      '/rides/:tripId/impact',
      {
        schema: {
          params: {
            type: 'object',
            required: ['tripId'],
            properties: { tripId: { type: 'string', format: 'uuid' } },
          },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['distanceMeters'],
            properties: {
              distanceMeters: { type: 'number', minimum: 0 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['tripId', 'co2SavedKg', 'moneySavedEur', 'hazardsWarnedCount', 'distanceMeters', 'equivalentText'],
              properties: {
                tripId: { type: 'string' },
                co2SavedKg: { type: 'number' },
                moneySavedEur: { type: 'number' },
                hazardsWarnedCount: { type: 'integer' },
                distanceMeters: { type: 'number' },
                equivalentText: { type: ['string', 'null'] },
              },
            },
            401: errorResponseSchema,
            409: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const { tripId } = request.params;
        const { distanceMeters } = request.body;

        // Call record_ride_impact RPC
        const { data, error } = await supabaseAdmin.rpc('record_ride_impact', {
          p_trip_id: tripId,
          p_user_id: user.id,
          p_distance_meters: distanceMeters,
        });

        if (error) {
          // UNIQUE constraint violation = already recorded
          if (error.code === '23505') {
            throw new HttpError('Impact already recorded for this trip.', {
              statusCode: 409,
              code: 'BAD_REQUEST',
              details: [error.message],
            });
          }
          request.log.error({ event: 'ride_impact_error', error: error.message }, 'ride impact recording failed');
          throw new HttpError('Failed to record ride impact.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const row = Array.isArray(data) ? data[0] : data;
        const co2SavedKg = Number(row?.co2_saved_kg ?? 0);
        const moneySavedEur = Number(row?.money_saved_eur ?? 0);

        // Pick a random reward equivalent that matches the user's savings
        let equivalentText: string | null = null;
        const { data: equivalents } = await supabaseAdmin
          .from('reward_equivalents')
          .select('equivalent_text')
          .or(`and(category.eq.co2,threshold_value.lte.${co2SavedKg}),and(category.eq.money,threshold_value.lte.${moneySavedEur})`)
          .order('threshold_value', { ascending: false })
          .limit(10);

        if (equivalents && equivalents.length > 0) {
          const randomIndex = Math.floor(Math.random() * equivalents.length);
          equivalentText = (equivalents[randomIndex] as Record<string, unknown>).equivalent_text as string;
        }

        return {
          tripId,
          co2SavedKg,
          moneySavedEur,
          hazardsWarnedCount: Number(row?.hazards_warned_count ?? 0),
          distanceMeters: Number(row?.distance_meters ?? 0),
          equivalentText,
        };
      },
    );

    // GET /v1/rides/:tripId/impact — fetch existing ride impact
    app.get<{
      Params: { tripId: string };
      Reply: RideImpact | ErrorResponse;
    }>(
      '/rides/:tripId/impact',
      {
        schema: {
          params: {
            type: 'object',
            required: ['tripId'],
            properties: { tripId: { type: 'string', format: 'uuid' } },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['tripId', 'co2SavedKg', 'moneySavedEur', 'hazardsWarnedCount', 'distanceMeters', 'equivalentText'],
              properties: {
                tripId: { type: 'string' },
                co2SavedKg: { type: 'number' },
                moneySavedEur: { type: 'number' },
                hazardsWarnedCount: { type: 'integer' },
                distanceMeters: { type: 'number' },
                equivalentText: { type: ['string', 'null'] },
              },
            },
            401: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const { data, error } = await supabaseAdmin
          .from('ride_impacts')
          .select('trip_id, co2_saved_kg, money_saved_eur, hazards_warned_count, distance_meters')
          .eq('trip_id', request.params.tripId)
          .eq('user_id', user.id)
          .single();

        let impactRow = data;

        // Auto-compute impact if not found — look up distance from trip_tracks
        if (error || !impactRow) {
          const { data: track } = await supabaseAdmin
            .from('trip_tracks')
            .select('actual_distance_meters, planned_route_distance_meters')
            .eq('trip_id', request.params.tripId)
            .eq('user_id', user.id)
            .single();

          if (!track) {
            throw new HttpError('Trip not found.', { statusCode: 404, code: 'NOT_FOUND' });
          }

          const distMeters = Number(track.actual_distance_meters ?? track.planned_route_distance_meters ?? 0);

          // Auto-record the impact
          const { data: created } = await supabaseAdmin.rpc('record_ride_impact', {
            p_trip_id: request.params.tripId,
            p_user_id: user.id,
            p_distance_meters: distMeters,
          });

          const createdRow = Array.isArray(created) ? created[0] : created;
          if (createdRow) {
            impactRow = createdRow;
          } else {
            // Fallback: compute client-side
            impactRow = {
              trip_id: request.params.tripId,
              co2_saved_kg: distMeters / 1000 * 0.12,
              money_saved_eur: distMeters / 1000 * 0.35,
              hazards_warned_count: 0,
              distance_meters: distMeters,
            };
          }
        }

        // Pick a random reward equivalent
        let equivalentText: string | null = null;
        const co2 = Number(impactRow.co2_saved_kg ?? 0);
        const money = Number(impactRow.money_saved_eur ?? 0);
        const { data: equivalents } = await supabaseAdmin
          .from('reward_equivalents')
          .select('equivalent_text')
          .or(`and(category.eq.co2,threshold_value.lte.${co2}),and(category.eq.money,threshold_value.lte.${money})`)
          .order('threshold_value', { ascending: false })
          .limit(10);

        if (equivalents && equivalents.length > 0) {
          const randomIndex = Math.floor(Math.random() * equivalents.length);
          equivalentText = (equivalents[randomIndex] as Record<string, unknown>).equivalent_text as string;
        }

        return {
          tripId: impactRow.trip_id as string,
          co2SavedKg: Number(impactRow.co2_saved_kg),
          moneySavedEur: Number(impactRow.money_saved_eur),
          hazardsWarnedCount: Number(impactRow.hazards_warned_count ?? 0),
          distanceMeters: Number(impactRow.distance_meters ?? 0),
          equivalentText,
        };
      },
    );

    // GET /v1/impact-dashboard — full impact dashboard
    app.get<{
      Querystring: { tz?: string };
      Reply: ImpactDashboard | ErrorResponse;
    }>(
      '/impact-dashboard',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              tz: { type: 'string', maxLength: 50 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: [
                'streak', 'totalCo2SavedKg', 'totalMoneySavedEur',
                'totalHazardsReported', 'totalRidersProtected',
                'guardianTier', 'thisWeek',
              ],
              properties: {
                streak: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['currentStreak', 'longestStreak', 'lastQualifyingDate', 'freezeAvailable', 'freezeUsedDate'],
                  properties: {
                    currentStreak: { type: 'integer' },
                    longestStreak: { type: 'integer' },
                    lastQualifyingDate: { type: ['string', 'null'] },
                    freezeAvailable: { type: 'boolean' },
                    freezeUsedDate: { type: ['string', 'null'] },
                  },
                },
                totalCo2SavedKg: { type: 'number' },
                totalMoneySavedEur: { type: 'number' },
                totalHazardsReported: { type: 'integer' },
                totalRidersProtected: { type: 'integer' },
                guardianTier: { type: 'string' },
                thisWeek: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['rides', 'co2SavedKg', 'moneySavedEur', 'hazardsReported'],
                  properties: {
                    rides: { type: 'integer' },
                    co2SavedKg: { type: 'number' },
                    moneySavedEur: { type: 'number' },
                    hazardsReported: { type: 'integer' },
                  },
                },
              },
            },
            401: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const tz = request.query.tz ?? 'UTC';

        const { data, error } = await supabaseAdmin.rpc('get_impact_dashboard', {
          p_user_id: user.id,
          p_time_zone: tz,
        });

        if (error) {
          request.log.error({ event: 'impact_dashboard_error', error: error.message }, 'impact dashboard query failed');
          throw new HttpError('Impact dashboard query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // RPC returns JSONB, parse the result
        const d = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
        const streak = d.streak as Record<string, unknown> | undefined;
        const totals = d.totals as Record<string, unknown> | undefined;
        const thisWeek = d.thisWeek as Record<string, unknown> | undefined;

        return {
          streak: {
            currentStreak: Number(streak?.currentStreak ?? 0),
            longestStreak: Number(streak?.longestStreak ?? 0),
            lastQualifyingDate: (streak?.lastQualifyingDate as string) ?? null,
            freezeAvailable: Boolean(streak?.freezeAvailable ?? false),
            freezeUsedDate: null as string | null,
          },
          totalCo2SavedKg: Number(totals?.totalCo2SavedKg ?? 0),
          totalMoneySavedEur: Number(totals?.totalMoneySavedEur ?? 0),
          totalHazardsReported: Number(totals?.totalHazardsReported ?? 0),
          totalRidersProtected: Number(totals?.totalRidersProtected ?? 0),
          guardianTier: ((d.guardianTier as string) ?? 'reporter') as GuardianTier,
          thisWeek: {
            rides: Number(thisWeek?.rides ?? 0),
            co2SavedKg: Number(thisWeek?.co2SavedKg ?? 0),
            moneySavedEur: Number(thisWeek?.moneySavedEur ?? 0),
            hazardsReported: 0,
          },
        };
      },
    );

    // GET /v1/quiz/daily — random unasked question (30-day cooldown)
    app.get<{ Reply: QuizQuestion | ErrorResponse }>(
      '/quiz/daily',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'questionText', 'options', 'category', 'difficulty'],
              properties: {
                id: { type: 'string' },
                questionText: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                category: { type: 'string' },
                difficulty: { type: 'integer' },
              },
            },
            401: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        // Get question IDs answered in the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentAnswers } = await supabaseAdmin
          .from('user_quiz_history')
          .select('question_id')
          .eq('user_id', user.id)
          .gte('answered_at', thirtyDaysAgo);

        const excludeIds = (recentAnswers ?? []).map((r: Record<string, unknown>) => r.question_id as string);

        // Fetch all questions, exclude recently answered
        let query = supabaseAdmin
          .from('quiz_questions')
          .select('id, question_text, options, category, difficulty');

        if (excludeIds.length > 0) {
          query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data: questions, error } = await query;

        if (error) {
          throw new HttpError('Quiz query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        if (!questions || questions.length === 0) {
          throw new HttpError('No quiz questions available.', {
            statusCode: 404,
            code: 'BAD_REQUEST',
          });
        }

        // Pick a random question
        const randomIndex = Math.floor(Math.random() * questions.length);
        const q = questions[randomIndex] as Record<string, unknown>;

        return {
          id: q.id as string,
          questionText: q.question_text as string,
          options: q.options as string[],
          category: q.category as string,
          difficulty: Number(q.difficulty),
        };
      },
    );

    // POST /v1/quiz/answer — record answer, qualify streak, return result
    app.post<{
      Body: { questionId: string; selectedIndex: number };
      Reply: QuizAnswer | ErrorResponse;
    }>(
      '/quiz/answer',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['questionId', 'selectedIndex'],
            properties: {
              questionId: { type: 'string', format: 'uuid' },
              selectedIndex: { type: 'integer', minimum: 0, maximum: 3 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['questionId', 'selectedIndex', 'isCorrect', 'explanation'],
              properties: {
                questionId: { type: 'string' },
                selectedIndex: { type: 'integer' },
                isCorrect: { type: 'boolean' },
                explanation: { type: 'string' },
              },
            },
            401: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const { questionId, selectedIndex } = request.body;

        // Fetch the question to check the answer
        const { data: question, error: qError } = await supabaseAdmin
          .from('quiz_questions')
          .select('correct_index, explanation')
          .eq('id', questionId)
          .single();

        if (qError || !question) {
          throw new HttpError('Question not found.', {
            statusCode: 404,
            code: 'BAD_REQUEST',
          });
        }

        const isCorrect = selectedIndex === (question.correct_index as number);

        // Record the answer (upsert — 30-day cooldown means we might re-answer)
        const { error: insertError } = await supabaseAdmin
          .from('user_quiz_history')
          .upsert(
            {
              user_id: user.id,
              question_id: questionId,
              selected_index: selectedIndex,
              is_correct: isCorrect,
              answered_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,question_id' },
          );

        if (insertError) {
          request.log.error({ event: 'quiz_answer_error', error: insertError.message }, 'quiz answer recording failed');
          throw new HttpError('Failed to record quiz answer.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [insertError.message],
          });
        }

        // Qualify streak (fire-and-forget)
        qualifyStreakAsync(user.id, 'quiz', getTimezone(request), request.log);

        return {
          questionId,
          selectedIndex,
          isCorrect,
          explanation: question.explanation as string,
        };
      },
    );

    // GET /v1/hazards/my-impact — how many cyclists were protected by user's hazard reports
    app.get<{
      Reply: {
        totalHazardsReported: number;
        activeHazards: number;
        ridersProtected: number;
        validationsReceived: number;
        topHazards: Array<{
          id: string;
          hazard_type: string | null;
          created_at: string;
          expires_at: string | null;
          confirm_count: number;
          deny_count: number;
          validation_count: number;
        }>;
      } | ErrorResponse;
    }>(
      '/hazards/my-impact',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['totalHazardsReported', 'activeHazards', 'ridersProtected', 'validationsReceived', 'topHazards'],
              properties: {
                totalHazardsReported: { type: 'integer' },
                activeHazards: { type: 'integer' },
                ridersProtected: { type: 'integer' },
                validationsReceived: { type: 'integer' },
                topHazards: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      hazard_type: { type: ['string', 'null'] },
                      created_at: { type: 'string' },
                      expires_at: { type: ['string', 'null'] },
                      confirm_count: { type: 'integer' },
                      deny_count: { type: 'integer' },
                      validation_count: { type: 'integer' },
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
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const { data, error } = await supabaseAdmin.rpc('get_hazard_reporter_impact', {
          p_user_id: user.id,
        });

        if (error) {
          request.log.error({ event: 'hazard_impact_error', error: error.message }, 'hazard reporter impact query failed');
          throw new HttpError('Hazard impact query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const d = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
        const topHazards = (d.topHazards as Array<Record<string, unknown>> | undefined) ?? [];

        return {
          totalHazardsReported: Number(d.totalHazardsReported ?? 0),
          activeHazards: Number(d.activeHazards ?? 0),
          ridersProtected: Number(d.ridersProtected ?? 0),
          validationsReceived: Number(d.validationsReceived ?? 0),
          topHazards: topHazards.map((h) => ({
            id: h.id as string,
            hazard_type: (h.hazard_type as string) ?? null,
            created_at: h.created_at as string,
            expires_at: (h.expires_at as string) ?? null,
            confirm_count: Number(h.confirm_count ?? 0),
            deny_count: Number(h.deny_count ?? 0),
            validation_count: Number(h.validation_count ?? 0),
          })),
        };
      },
    );

    // ── Cron-triggered notification endpoints ──
    // Called by Cloud Scheduler with a shared secret in the Authorization header.
    // These are NOT user-facing — they process all eligible users in batch.

    const CRON_SECRET = process.env.CRON_SECRET ?? '';

    const verifyCronAuth = (request: FastifyRequest): void => {
      if (!CRON_SECRET) {
        throw new HttpError('Cron secret not configured.', { statusCode: 500, code: 'INTERNAL_ERROR' });
      }
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${CRON_SECRET}`) {
        throw new HttpError('Unauthorized cron call.', { statusCode: 401, code: 'UNAUTHORIZED' });
      }
    };

    // POST /v1/cron/streak-reminders — 8 PM daily
    app.post(
      '/cron/streak-reminders',
      async (request) => {
        verifyCronAuth(request);
        const result = await sendStreakProtectionReminders(request.log);
        return { ok: true, ...result };
      },
    );

    // POST /v1/cron/weekly-impact — Sunday 9 AM
    app.post(
      '/cron/weekly-impact',
      async (request) => {
        verifyCronAuth(request);
        const result = await sendWeeklyImpactSummary(request.log);
        return { ok: true, ...result };
      },
    );

    // POST /v1/cron/social-digest — 7 PM daily
    app.post(
      '/cron/social-digest',
      async (request) => {
        verifyCronAuth(request);
        const result = await sendSocialImpactDigest(request.log);
        return { ok: true, ...result };
      },
    );

  };

  return routes;
};
