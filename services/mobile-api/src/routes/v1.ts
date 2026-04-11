import type {
  AutocompleteResponse,
  BadgeResponse,
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
  QuizQuestion,
  QuizAnswer,
  SavedRoute,
  XpBreakdownItem,
  XpAwardResult,
  TiersResponse,
} from '@defensivepedal/core';
import { XP_VALUES, badgeTierToXpAction, calculateRideMultiplier, XP_ACTION_LABELS } from '../lib/xp';
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
  normalizeSavedRouteCreateRequest,
  savedRouteCreateRequestSchema,
  savedRouteListResponseSchema,
  savedRouteResponseSchema,
  type SavedRouteCreateBody,
  writeAckResponseSchema,
} from '../lib/http';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { supabaseAdmin } from '../lib/supabaseAdmin';

type NormalizedRouteRequest = RoutePreviewRequest | RerouteRequest;
type RateLimitPolicyKey = keyof MobileApiDependencies['rateLimitPolicies'];

// Streak helpers (shared with feed.ts)
import { getTimezone, qualifyStreakAsync } from '../lib/streaks';
import { QUIZ_QUESTIONS, findQuizQuestion } from '../data/quiz-questions';

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
            avoidHills: normalizedRequest.avoidHills,
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
              bikeType: { type: 'string', maxLength: 50 },
              aqiAtStart: { type: ['integer', 'null'], minimum: 0, maximum: 500 },
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
            // XP award (fire-and-forget)
            if (supabaseAdmin) {
              void (async () => {
                try { await supabaseAdmin.rpc('award_xp', {
                  p_user_id: user.id, p_action: 'hazard_report',
                  p_base_xp: XP_VALUES.hazard_report, p_multiplier: 1.0,
                }); } catch { /* non-fatal */ }
              })();
            }
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

      await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

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

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try { await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id, p_action: 'hazard_validate',
              p_base_xp: XP_VALUES.hazard_validate, p_multiplier: 1.0,
            }); } catch { /* non-fatal */ }
          })();
        }

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
      Reply: {
        elevationProfile: number[];
        elevationGain: number;
        elevationLoss: number;
      } | ErrorResponse;
    }>(
      '/elevation-profile',
      {
        schema: {
          response: {
            200: {
              type: 'object' as const,
              properties: {
                elevationProfile: { type: 'array' as const },
                elevationGain: { type: 'number' as const },
                elevationLoss: { type: 'number' as const },
              },
            },
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
          const typedCoords = coordinates as [number, number][];

          // Fetch profile and gain/loss in parallel
          const [elevationProfile, gainLoss] = await Promise.all([
            dependencies.getElevationProfile(typedCoords),
            dependencies.getElevationGain(typedCoords),
          ]);

          return {
            elevationProfile: elevationProfile ?? [],
            elevationGain: Math.round(gainLoss.elevationGain),
            elevationLoss: Math.round(gainLoss.elevationLoss),
          };
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

        const row = (Array.isArray(data) ? data[0] : data) ?? null;
        const totalSegments = Number(row?.total_segments ?? 0);

        return {
          // When no road risk segments exist for the area, return score 0 (no data),
          // not 100 (which would falsely imply a perfectly safe area).
          score: totalSegments === 0
            ? 0
            : Math.max(0, Math.min(100, Math.round(100 - Number(row?.avg_score ?? 0)))),
          totalSegments,
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

    // POST /v1/rides/:tripId/impact — record ride impact and return with random equivalent + new badges
    app.post<{
      Params: { tripId: string };
      Body: {
        distanceMeters: number;
        elevationGainM?: number;
        weatherCondition?: string;
        windSpeedKmh?: number;
        temperatureC?: number;
        aqiLevel?: string;
        rideStartHour?: number;
        durationMinutes?: number;
      };
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
              distanceMeters:   { type: 'number', minimum: 0 },
              elevationGainM:   { type: 'number', minimum: 0 },
              weatherCondition: { type: 'string', maxLength: 64 },
              windSpeedKmh:     { type: 'number', minimum: 0 },
              temperatureC:     { type: 'number' },
              aqiLevel:         { type: 'string', maxLength: 32 },
              rideStartHour:    { type: 'integer', minimum: 0, maximum: 23 },
              durationMinutes:  { type: 'number', minimum: 0 },
              routeType:        { type: 'string', enum: ['safe', 'fast'] },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['tripId', 'co2SavedKg', 'moneySavedEur', 'hazardsWarnedCount', 'distanceMeters', 'equivalentText', 'personalMicrolives', 'communitySeconds', 'newBadges', 'xpBreakdown', 'totalXpEarned', 'currentTotalXp', 'riderTier', 'tierPromotion'],
              properties: {
                tripId: { type: 'string' },
                co2SavedKg: { type: 'number' },
                moneySavedEur: { type: 'number' },
                hazardsWarnedCount: { type: 'integer' },
                distanceMeters: { type: 'number' },
                equivalentText: { type: ['string', 'null'] },
                personalMicrolives: { type: 'number' },
                communitySeconds: { type: 'number' },
                newBadges: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['badgeKey', 'name', 'flavorText', 'iconKey', 'earnedAt'],
                    properties: {
                      badgeKey:   { type: 'string' },
                      tier:       { type: ['string', 'null'] },
                      name:       { type: 'string' },
                      flavorText: { type: 'string' },
                      iconKey:    { type: 'string' },
                      earnedAt:   { type: 'string' },
                    },
                  },
                },
                xpBreakdown: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['action', 'label', 'baseXp', 'multiplier', 'finalXp'],
                    properties: {
                      action:     { type: 'string' },
                      label:      { type: 'string' },
                      baseXp:     { type: 'integer' },
                      multiplier: { type: 'number' },
                      finalXp:    { type: 'integer' },
                      sourceId:   { type: 'string' },
                    },
                  },
                },
                totalXpEarned: { type: 'integer' },
                currentTotalXp: { type: 'integer' },
                riderTier: { type: 'string' },
                tierPromotion: {
                  type: ['object', 'null'],
                  additionalProperties: true,
                  properties: {
                    xpAwarded:        { type: 'integer' },
                    totalXp:          { type: 'integer' },
                    oldTier:          { type: 'string' },
                    newTier:          { type: 'string' },
                    promoted:         { type: 'boolean' },
                    tierDisplayName:  { type: 'string' },
                    tierTagline:      { type: 'string' },
                    tierColor:        { type: 'string' },
                    tierLevel:        { type: 'integer' },
                    tierPerk:         { type: 'string' },
                  },
                },
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
        const {
          distanceMeters,
          elevationGainM,
          weatherCondition,
          windSpeedKmh,
          temperatureC,
          aqiLevel,
          rideStartHour,
          durationMinutes,
        } = request.body;

        // Call record_ride_impact RPC with full ride metadata
        const { data, error } = await supabaseAdmin.rpc('record_ride_impact', {
          p_trip_id: tripId,
          p_user_id: user.id,
          p_distance_meters: distanceMeters,
          p_elevation_gain_m:  elevationGainM  ?? 0,
          p_weather_condition: weatherCondition ?? null,
          p_wind_speed_kmh:    windSpeedKmh    ?? null,
          p_temperature_c:     temperatureC    ?? null,
          p_aqi_level:         aqiLevel        ?? null,
          p_ride_start_hour:   rideStartHour   ?? null,
          p_duration_minutes:  durationMinutes  ?? 0,
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

        // Also compute and record microlives
        let personalMicrolives = 0;
        let communitySeconds = 0;
        try {
          // Fetch bike_type and aqi from the trip_track record
          const { data: trackData } = await supabaseAdmin
            .from('trip_tracks')
            .select('bike_type, aqi_at_start')
            .eq('trip_id', tripId)
            .single();

          const { data: mlData } = await supabaseAdmin.rpc('record_ride_microlives', {
            p_trip_id: tripId,
            p_user_id: user.id,
            p_distance_meters: distanceMeters,
            p_bike_type: (trackData?.bike_type as string) ?? 'acoustic',
            p_european_aqi: (trackData?.aqi_at_start as number) ?? null,
            p_validated: true,
          });

          if (mlData) {
            const ml = typeof mlData === 'object' ? mlData : {};
            personalMicrolives = Number((ml as Record<string, unknown>).personalMicrolives ?? 0);
            communitySeconds = Number((ml as Record<string, unknown>).communitySeconds ?? 0);
          }
        } catch {
          // Microlives recording failure is non-fatal
        }

        // Check and award badges (non-fatal)
        let newBadges: RideImpact['newBadges'] = [];
        try {
          const { data: badgeData } = await supabaseAdmin.rpc('check_and_award_badges', {
            p_user_id: user.id,
          });
          if (Array.isArray(badgeData)) {
            newBadges = badgeData.map((b: Record<string, unknown>) => ({
              badgeKey:   String(b.badge_key ?? ''),
              tier:       null,
              name:       String(b.name ?? ''),
              flavorText: String(b.flavor_text ?? ''),
              iconKey:    String(b.icon_key ?? ''),
              earnedAt:   String(b.earned_at ?? new Date().toISOString()),
            }));
          }
        } catch {
          // Badge check failure is non-fatal
        }

        // --- XP AWARDING (non-fatal, same pattern as badge check) ---
        const xpBreakdown: XpBreakdownItem[] = [];
        let lastAwardResult: XpAwardResult | null = null;

        try {
          // 1. Determine ride type for XP
          const routeType = (request.body as Record<string, unknown>).routeType as string | undefined ?? 'safe';
          const rideAction = routeType === 'fast' ? 'ride_fast' : 'ride_safe';
          const rideBaseXp = XP_VALUES[rideAction];

          // 2. Check if first ride of the day
          const { data: todayRides } = await supabaseAdmin
            .from('xp_events')
            .select('id')
            .eq('user_id', user.id)
            .in('action', ['ride_safe', 'ride_fast'])
            .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
            .limit(1);
          const isFirstOfDay = !todayRides || todayRides.length === 0;

          // 3. Get current streak
          const { data: streakRow } = await supabaseAdmin
            .from('streak_state')
            .select('current_streak')
            .eq('user_id', user.id)
            .single();
          const currentStreak = (streakRow?.current_streak as number) ?? 0;

          // 4. Get weather condition from ride_impacts
          const { data: rideData } = await supabaseAdmin
            .from('ride_impacts')
            .select('weather_condition')
            .eq('trip_id', tripId)
            .single();

          // 5. Calculate multiplier
          const multiplier = calculateRideMultiplier({
            isFirstOfDay,
            currentStreak,
            weatherCondition: rideData?.weather_condition as string | null,
          });

          // 6. Award ride XP
          const { data: rideXpResult } = await supabaseAdmin.rpc('award_xp', {
            p_user_id: user.id,
            p_action: rideAction,
            p_base_xp: rideBaseXp,
            p_multiplier: multiplier,
            p_source_id: tripId,
          });
          const rideXp = rideXpResult as XpAwardResult;
          lastAwardResult = rideXp;

          xpBreakdown.push({
            action: rideAction,
            label: XP_ACTION_LABELS[rideAction],
            baseXp: rideBaseXp,
            multiplier,
            finalXp: rideXp.xpAwarded,
          });

          // 7. Award XP for each new badge earned
          for (const badge of newBadges) {
            const { data: badgeDef } = await supabaseAdmin
              .from('badge_definitions')
              .select('tier, is_hidden, is_seasonal')
              .eq('badge_key', badge.badgeKey)
              .single();

            if (badgeDef) {
              const badgeAction = badgeTierToXpAction(
                badgeDef.tier as number,
                badgeDef.is_hidden as boolean,
                badgeDef.is_seasonal as boolean,
              );
              const badgeXpValue = XP_VALUES[badgeAction];

              const { data: badgeXpResult } = await supabaseAdmin.rpc('award_xp', {
                p_user_id: user.id,
                p_action: badgeAction,
                p_base_xp: badgeXpValue,
                p_multiplier: 1.0,
                p_source_id: badge.badgeKey,
              });

              const bxp = badgeXpResult as XpAwardResult;
              if (bxp.promoted) lastAwardResult = bxp;

              xpBreakdown.push({
                action: badgeAction,
                label: `${XP_ACTION_LABELS[badgeAction]}: ${badge.name}`,
                baseXp: badgeXpValue,
                multiplier: 1.0,
                finalXp: bxp.xpAwarded,
                sourceId: badge.badgeKey,
              });
            }
          }

          // 8. Award streak day XP
          if (currentStreak > 0) {
            const { data: streakXp } = await supabaseAdmin.rpc('award_xp', {
              p_user_id: user.id,
              p_action: 'streak_day',
              p_base_xp: XP_VALUES.streak_day,
              p_multiplier: 1.0,
              p_source_id: `streak_day_${currentStreak}`,
            });
            const sxp = streakXp as XpAwardResult;
            if (sxp.promoted) lastAwardResult = sxp;

            xpBreakdown.push({
              action: 'streak_day',
              label: `Streak day (Day ${currentStreak})`,
              baseXp: XP_VALUES.streak_day,
              multiplier: 1.0,
              finalXp: sxp.xpAwarded,
            });
          }
        } catch {
          // XP awarding failure is non-fatal
        }

        const totalXpEarned = xpBreakdown.reduce((sum, item) => sum + item.finalXp, 0);

        return {
          tripId,
          co2SavedKg,
          moneySavedEur,
          hazardsWarnedCount: Number(row?.hazards_warned_count ?? 0),
          distanceMeters: Number(row?.distance_meters ?? 0),
          equivalentText,
          personalMicrolives,
          communitySeconds,
          newBadges,
          xpBreakdown,
          totalXpEarned,
          currentTotalXp: lastAwardResult?.totalXp ?? 0,
          riderTier: (lastAwardResult?.newTier ?? 'kickstand') as import('@defensivepedal/core').RiderTierName,
          tierPromotion: lastAwardResult?.promoted ? lastAwardResult : null,
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
              required: ['tripId', 'co2SavedKg', 'moneySavedEur', 'hazardsWarnedCount', 'distanceMeters', 'equivalentText', 'personalMicrolives', 'communitySeconds', 'newBadges', 'xpBreakdown', 'totalXpEarned', 'currentTotalXp', 'riderTier', 'tierPromotion'],
              properties: {
                tripId: { type: 'string' },
                co2SavedKg: { type: 'number' },
                moneySavedEur: { type: 'number' },
                hazardsWarnedCount: { type: 'integer' },
                distanceMeters: { type: 'number' },
                equivalentText: { type: ['string', 'null'] },
                personalMicrolives: { type: 'number' },
                communitySeconds: { type: 'number' },
                newBadges: { type: 'array', items: { type: 'object' } },
                xpBreakdown: { type: 'array', items: { type: 'object' } },
                totalXpEarned: { type: 'integer' },
                currentTotalXp: { type: 'integer' },
                riderTier: { type: 'string' },
                tierPromotion: { type: ['object', 'null'] },
              },
            },
            401: errorResponseSchema,
            404: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireAuthenticatedUser(request, dependencies.authenticateUser);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        let newBadgesFromCheck: RideImpact['newBadges'] = [];

        const { data, error } = await supabaseAdmin
          .from('ride_impacts')
          .select('trip_id, co2_saved_kg, money_saved_eur, hazards_warned_count, distance_meters')
          .eq('trip_id', request.params.tripId)
          .eq('user_id', user.id)
          .single();

        let impactRow = data;
        let personalMicrolives = 0;
        let communitySeconds = 0;

        // Auto-compute impact if not found — look up distance from trip_tracks
        if (error || !impactRow) {
          const { data: track } = await supabaseAdmin
            .from('trip_tracks')
            .select('actual_distance_meters, planned_route_distance_meters, bike_type, aqi_at_start')
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

          // Auto-record microlives alongside impact (non-fatal)
          try {
            const { data: mlData } = await supabaseAdmin.rpc('record_ride_microlives', {
              p_trip_id: request.params.tripId,
              p_user_id: user.id,
              p_distance_meters: distMeters,
              p_bike_type: (track.bike_type as string) ?? 'acoustic',
              p_european_aqi: (track.aqi_at_start as number) ?? null,
              p_validated: true,
            });
            // Store so we can skip the lookup below
            if (mlData) {
              const ml = typeof mlData === 'object' ? mlData : {};
              personalMicrolives = Number((ml as Record<string, unknown>).personalMicrolives ?? 0);
              communitySeconds = Number((ml as Record<string, unknown>).communitySeconds ?? 0);
            }
          } catch { /* microlives recording is non-fatal */ }

          // Check and award badges after auto-creating impact (non-fatal)
          try {
            const { data: badgeData } = await supabaseAdmin.rpc('check_and_award_badges', {
              p_user_id: user.id,
            });
            if (Array.isArray(badgeData)) {
              newBadgesFromCheck = badgeData.map((b: Record<string, unknown>) => ({
                badgeKey:   String(b.badge_key ?? ''),
                tier:       null,
                name:       String(b.name ?? ''),
                flavorText: String(b.flavor_text ?? ''),
                iconKey:    String(b.icon_key ?? ''),
                earnedAt:   String(b.earned_at ?? new Date().toISOString()),
              }));
            }
          } catch { /* badge check is non-fatal */ }
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

        // Fetch microlives for this trip if not already computed above
        if (personalMicrolives === 0 && communitySeconds === 0) {
          const { data: mlRow } = await supabaseAdmin
            .from('ride_microlives')
            .select('personal_microlives, community_seconds')
            .eq('trip_id', impactRow.trip_id)
            .maybeSingle();
          if (mlRow) {
            personalMicrolives = Number((mlRow as Record<string, unknown>).personal_microlives ?? 0);
            communitySeconds = Number((mlRow as Record<string, unknown>).community_seconds ?? 0);
          }
        }

        // Fetch user's current XP/tier for the response
        let currentTotalXp = 0;
        let currentRiderTier: import('@defensivepedal/core').RiderTierName = 'kickstand';
        try {
          const { data: prof } = await supabaseAdmin
            .from('profiles')
            .select('total_xp, rider_tier')
            .eq('id', user.id)
            .single();
          if (prof) {
            currentTotalXp = (prof.total_xp as number) ?? 0;
            currentRiderTier = ((prof.rider_tier as string) ?? 'kickstand') as import('@defensivepedal/core').RiderTierName;
          }
        } catch { /* non-fatal */ }

        return {
          tripId: impactRow.trip_id as string,
          co2SavedKg: Number(impactRow.co2_saved_kg),
          moneySavedEur: Number(impactRow.money_saved_eur),
          hazardsWarnedCount: Number(impactRow.hazards_warned_count ?? 0),
          distanceMeters: Number(impactRow.distance_meters ?? 0),
          equivalentText,
          personalMicrolives,
          communitySeconds,
          newBadges: newBadgesFromCheck,
          xpBreakdown: [],
          totalXpEarned: 0,
          currentTotalXp,
          riderTier: currentRiderTier,
          tierPromotion: null,
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
                'thisWeek', 'totalMicrolives', 'totalCommunitySeconds',
                'totalXp', 'riderTier',
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
                totalMicrolives: { type: 'number' },
                totalCommunitySeconds: { type: 'number' },
                totalXp: { type: 'integer' },
                riderTier: { type: 'string' },
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
        const user = await requireAuthenticatedUser(request, dependencies.authenticateUser);
        await applyRateLimit(request, reply, dependencies, 'routePreview', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const tz = request.query.tz ?? 'UTC';

        // Run badge check in parallel with dashboard fetch (non-fatal)
        const [dashResult] = await Promise.all([
          supabaseAdmin.rpc('get_impact_dashboard', {
            p_user_id: user.id,
            p_time_zone: tz,
          }),
          supabaseAdmin.rpc('check_and_award_badges', {
            p_user_id: user.id,
          }).then(() => null, () => null),
        ]);

        const { data, error } = dashResult;

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

        let totalCo2 = Number(totals?.totalCo2SavedKg ?? 0);
        let totalMoney = Number(totals?.totalMoneySavedEur ?? 0);
        let totalHazards = Number(totals?.totalHazardsReported ?? 0);
        let totalRiders = Number(totals?.totalRidersProtected ?? 0);

        // Fallback: if profile-based totals are all zero, derive from trips table
        // (covers rides completed before record_ride_impact was deployed)
        if (totalCo2 === 0 && totalMoney === 0) {
          try {
            const tripStats = await dependencies.getUserStats(user.id);
            if (tripStats.totalDistanceMeters > 0) {
              const distKm = tripStats.totalDistanceMeters / 1000;
              totalCo2 = tripStats.totalCo2SavedKg;
              totalMoney = distKm * 0.35;
            }
          } catch { /* fallback is optional */ }
        }

        let weekRides = Number(thisWeek?.rides ?? 0);
        let weekCo2 = Number(thisWeek?.co2SavedKg ?? 0);
        let weekMoney = Number(thisWeek?.moneySavedEur ?? 0);
        const weekHazards = Number(thisWeek?.hazardsReported ?? 0);

        // Fallback: if thisWeek from ride_impacts is empty, compute from trips table
        if (weekRides === 0 && totalCo2 > 0) {
          try {
            const dashStats = await dependencies.getTripStatsDashboard(user.id, tz);
            if (dashStats.totals.totalTrips > 0 && dashStats.weekly.length > 0) {
              const latestWeek = dashStats.weekly[dashStats.weekly.length - 1];
              weekRides = latestWeek.trips;
              const weekDistKm = latestWeek.distanceMeters / 1000;
              weekCo2 = weekDistKm * 0.12;
              weekMoney = weekDistKm * 0.35;
            }
          } catch { /* fallback is optional */ }
        }

        return {
          streak: {
            currentStreak: Number(streak?.currentStreak ?? 0),
            longestStreak: Number(streak?.longestStreak ?? 0),
            lastQualifyingDate: (streak?.lastQualifyingDate as string) ?? null,
            freezeAvailable: Boolean(streak?.freezeAvailable ?? false),
            freezeUsedDate: null as string | null,
          },
          totalCo2SavedKg: totalCo2,
          totalMoneySavedEur: totalMoney,
          totalHazardsReported: totalHazards,
          totalRidersProtected: totalRiders,
          thisWeek: {
            rides: weekRides,
            co2SavedKg: weekCo2,
            moneySavedEur: weekMoney,
            hazardsReported: weekHazards,
          },
          totalMicrolives: Number(totals?.totalMicrolives ?? 0) > 0
            ? Number(totals?.totalMicrolives ?? 0)
            : totalCo2 > 0 ? (totalCo2 / 0.12) * 0.4 : 0,  // 0.4 ML/km, CO2 = 0.12 kg/km
          totalCommunitySeconds: Number(totals?.totalCommunitySeconds ?? 0) > 0
            ? Number(totals?.totalCommunitySeconds ?? 0)
            : totalCo2 > 0 ? (totalCo2 / 0.12) * 4.5 : 0,  // 4.5 sec/km
          totalXp: Number(d.totalXp ?? 0),
          riderTier: String(d.riderTier ?? 'kickstand') as import('@defensivepedal/core').RiderTierName,
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

        // Get question IDs answered in the last 30 days from user_quiz_history
        let excludeIds: string[] = [];
        if (supabaseAdmin) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentAnswers } = await supabaseAdmin
            .from('user_quiz_history')
            .select('question_id')
            .eq('user_id', user.id)
            .gte('answered_at', thirtyDaysAgo);

          excludeIds = (recentAnswers ?? []).map((r: Record<string, unknown>) => r.question_id as string);
        }

        // Filter static question pool, excluding recently answered
        const available = excludeIds.length > 0
          ? QUIZ_QUESTIONS.filter((q) => !excludeIds.includes(q.id))
          : QUIZ_QUESTIONS;

        if (available.length === 0) {
          throw new HttpError('No quiz questions available.', {
            statusCode: 404,
            code: 'BAD_REQUEST',
          });
        }

        // Pick a random question
        const q = available[Math.floor(Math.random() * available.length)];

        return {
          id: q.id,
          questionText: q.questionText,
          options: q.options as string[],
          category: q.category,
          difficulty: q.difficulty,
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

        // Look up from static question pool
        const question = findQuizQuestion(questionId);

        if (!question) {
          throw new HttpError('Question not found.', {
            statusCode: 404,
            code: 'BAD_REQUEST',
          });
        }

        const isCorrect = selectedIndex === question.correctIndex;

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

        // XP award (fire-and-forget)
        if (supabaseAdmin) {
          void (async () => {
            try {
              await supabaseAdmin.rpc('award_xp', {
                p_user_id: user.id,
                p_action: 'quiz_complete',
                p_base_xp: XP_VALUES.quiz_complete,
                p_multiplier: 1.0,
                p_source_id: questionId,
              });
              if (isCorrect) {
                await supabaseAdmin.rpc('award_xp', {
                  p_user_id: user.id,
                  p_action: 'quiz_perfect',
                  p_base_xp: XP_VALUES.quiz_perfect,
                  p_multiplier: 1.0,
                  p_source_id: questionId,
                });
              }
            } catch { /* non-fatal */ }
          })();
        }

        return {
          questionId,
          selectedIndex,
          isCorrect,
          explanation: question.explanation,
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

    // ── Saved Routes ──

    app.get<{ Reply: { routes: SavedRoute[] } }>(
      '/saved-routes',
      {},
      async (request) => {
        const user = await requireWriteUser(request, dependencies);
        if (!supabaseAdmin) throw new HttpError('Database unavailable.', { statusCode: 503, code: 'INTERNAL_ERROR' });

        const { data, error } = await supabaseAdmin
          .from('saved_routes')
          .select('*')
          .eq('user_id', user.id)
          .order('last_used_at', { ascending: false })
          .limit(50);

        if (error) {
          request.log.error({ event: 'saved_routes_list_error', error: error.message }, 'failed to list saved routes');
          throw new HttpError('Failed to load saved routes.', { statusCode: 500, code: 'INTERNAL_ERROR' });
        }

        const routes: SavedRoute[] = (data ?? []).map((row) => ({
          id: row.id as string,
          name: row.name as string,
          origin: row.origin as SavedRoute['origin'],
          destination: row.destination as SavedRoute['destination'],
          waypoints: (row.waypoints as SavedRoute['waypoints']) ?? [],
          mode: (row.mode as SavedRoute['mode']) ?? 'safe',
          avoidUnpaved: (row.avoid_unpaved as boolean) ?? false,
          avoidHills: (row.avoid_hills as boolean) ?? false,
          createdAt: row.created_at as string,
          lastUsedAt: row.last_used_at as string,
        }));

        return { routes };
      },
    );

    app.post<{ Body: SavedRouteCreateBody; Reply: SavedRoute }>(
      '/saved-routes',
      { schema: { body: savedRouteCreateRequestSchema } },
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        if (!supabaseAdmin) throw new HttpError('Database unavailable.', { statusCode: 503, code: 'INTERNAL_ERROR' });

        const payload = normalizeSavedRouteCreateRequest(request.body);

        const { data, error } = await supabaseAdmin
          .from('saved_routes')
          .insert({
            user_id: user.id,
            name: payload.name,
            origin: payload.origin,
            destination: payload.destination,
            waypoints: payload.waypoints,
            mode: payload.mode,
            avoid_unpaved: payload.avoidUnpaved,
          })
          .select()
          .single();

        if (error) {
          request.log.error({ event: 'saved_route_create_error', error: error.message }, 'failed to create saved route');
          throw new HttpError('Failed to save route.', { statusCode: 500, code: 'INTERNAL_ERROR' });
        }

        reply.status(201);
        return {
          id: data.id as string,
          name: data.name as string,
          origin: data.origin as SavedRoute['origin'],
          destination: data.destination as SavedRoute['destination'],
          waypoints: (data.waypoints as SavedRoute['waypoints']) ?? [],
          mode: (data.mode as SavedRoute['mode']) ?? 'safe',
          avoidUnpaved: (data.avoid_unpaved as boolean) ?? false,
          avoidHills: (data.avoid_hills as boolean) ?? false,
          createdAt: data.created_at as string,
          lastUsedAt: data.last_used_at as string,
        };
      },
    );

    app.delete<{ Params: { id: string } }>(
      '/saved-routes/:id',
      async (request) => {
        const user = await requireWriteUser(request, dependencies);
        if (!supabaseAdmin) throw new HttpError('Database unavailable.', { statusCode: 503, code: 'INTERNAL_ERROR' });

        const { error } = await supabaseAdmin
          .from('saved_routes')
          .delete()
          .eq('id', request.params.id)
          .eq('user_id', user.id);

        if (error) {
          request.log.error({ event: 'saved_route_delete_error', error: error.message }, 'failed to delete saved route');
          throw new HttpError('Failed to delete saved route.', { statusCode: 500, code: 'INTERNAL_ERROR' });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    app.patch<{ Params: { id: string } }>(
      '/saved-routes/:id/use',
      async (request) => {
        const user = await requireWriteUser(request, dependencies);
        if (!supabaseAdmin) throw new HttpError('Database unavailable.', { statusCode: 503, code: 'INTERNAL_ERROR' });

        const { error } = await supabaseAdmin
          .from('saved_routes')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', request.params.id)
          .eq('user_id', user.id);

        if (error) {
          request.log.error({ event: 'saved_route_use_error', error: error.message }, 'failed to update saved route');
          throw new HttpError('Failed to update saved route.', { statusCode: 500, code: 'INTERNAL_ERROR' });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // GET /v1/tiers — tier definitions + user XP state
    app.get<{ Reply: TiersResponse | ErrorResponse }>(
      '/tiers',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['tiers', 'totalXp', 'riderTier', 'recentXp'],
              properties: {
                tiers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      tierLevel:       { type: 'integer' },
                      name:            { type: 'string' },
                      displayName:     { type: 'string' },
                      xpRequired:      { type: 'integer' },
                      tagline:         { type: 'string' },
                      color:           { type: 'string' },
                      pillTextColor:   { type: 'string' },
                      perkDescription: { type: 'string' },
                    },
                  },
                },
                totalXp: { type: 'integer' },
                riderTier: { type: 'string' },
                recentXp: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      id:        { type: 'string' },
                      action:    { type: 'string' },
                      baseXp:    { type: 'integer' },
                      multiplier: { type: 'number' },
                      finalXp:   { type: 'integer' },
                      sourceId:  { type: ['string', 'null'] },
                      createdAt: { type: 'string' },
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
        const user = await requireAuthenticatedUser(request, dependencies.authenticateUser);

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const [{ data: tiers }, { data: profile }, { data: recentXp }] = await Promise.all([
          supabaseAdmin.from('rider_tier_definitions').select('*').order('tier_level'),
          supabaseAdmin.from('profiles').select('total_xp, rider_tier').eq('id', user.id).single(),
          supabaseAdmin.from('xp_events')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const mapTier = (t: Record<string, unknown>): import('@defensivepedal/core').RiderTierDefinition => ({
          tierLevel:       Number(t.tier_level),
          name:            String(t.name) as import('@defensivepedal/core').RiderTierName,
          displayName:     String(t.display_name),
          xpRequired:      Number(t.xp_required),
          tagline:         String(t.tagline),
          color:           String(t.color),
          pillTextColor:   String(t.pill_text_color),
          perkDescription: String(t.perk_description),
        });

        const mapXpEvent = (e: Record<string, unknown>) => ({
          id:         String(e.id),
          action:     String(e.action),
          baseXp:     Number(e.base_xp),
          multiplier: Number(e.multiplier),
          finalXp:    Number(e.final_xp),
          sourceId:   e.source_id != null ? String(e.source_id) : null,
          createdAt:  String(e.created_at),
        });

        return {
          tiers: (tiers ?? []).map(mapTier),
          totalXp: (profile?.total_xp as number) ?? 0,
          riderTier: ((profile?.rider_tier as string) ?? 'kickstand') as import('@defensivepedal/core').RiderTierName,
          recentXp: (recentXp ?? []).map(mapXpEvent),
        };
      },
    );

    // GET /v1/badges — badge catalog + user progress
    app.get(
      '/badges',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['definitions', 'earned', 'progress'],
              properties: {
                definitions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['badgeKey', 'category', 'displayTab', 'name', 'flavorText', 'criteriaText', 'tier', 'isHidden', 'isSeasonal', 'sortOrder', 'iconKey'],
                    properties: {
                      badgeKey:     { type: 'string' },
                      category:     { type: 'string' },
                      displayTab:   { type: 'string' },
                      name:         { type: 'string' },
                      flavorText:   { type: 'string' },
                      criteriaText: { type: 'string' },
                      criteriaUnit: { type: ['string', 'null'] },
                      tier:         { type: 'integer' },
                      tierFamily:   { type: ['string', 'null'] },
                      isHidden:     { type: 'boolean' },
                      isSeasonal:   { type: 'boolean' },
                      sortOrder:    { type: 'integer' },
                      iconKey:      { type: 'string' },
                    },
                  },
                },
                earned: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['badgeKey', 'earnedAt', 'metadata'],
                    properties: {
                      badgeKey: { type: 'string' },
                      earnedAt: { type: 'string' },
                      metadata: { type: 'object' },
                    },
                  },
                },
                progress: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['badgeKey', 'current', 'target', 'progress'],
                    properties: {
                      badgeKey: { type: 'string' },
                      current:  { type: 'number' },
                      target:   { type: 'number' },
                      progress: { type: 'number' },
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
        const user = await requireAuthenticatedUser(request, dependencies.authenticateUser);
        await applyRateLimit(request, reply, dependencies, 'routePreview', { userId: user.id });

        if (!supabaseAdmin) {
          throw new HttpError('Database unavailable.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        // Run badge evaluation first so newly earned badges appear immediately
        try {
          await supabaseAdmin.rpc('check_and_award_badges', { p_user_id: user.id });
        } catch { /* non-fatal */ }

        // Fetch all badge definitions, user's earned badges, and aggregate stats in parallel
        const [defsResult, earnedResult, profileResult, rideAggResult] = await Promise.all([
          supabaseAdmin
            .from('badge_definitions')
            .select('badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key')
            .order('sort_order'),
          supabaseAdmin
            .from('user_badges')
            .select('badge_key, earned_at, metadata')
            .eq('user_id', user.id)
            .order('earned_at', { ascending: false }),
          supabaseAdmin
            .from('profiles')
            .select('total_co2_saved_kg, total_money_saved_eur, total_hazards_reported, total_riders_protected, total_microlives, total_community_seconds')
            .eq('id', user.id)
            .single(),
          supabaseAdmin
            .from('ride_impacts')
            .select('distance_meters, duration_minutes, elevation_gain_m')
            .eq('user_id', user.id),
        ]);

        if (defsResult.error) {
          throw new HttpError('Failed to load badge definitions.', { statusCode: 502, code: 'UPSTREAM_ERROR' });
        }

        const defs = (defsResult.data ?? []) as Array<Record<string, unknown>>;
        const earnedRows = (earnedResult.data ?? []) as Array<Record<string, unknown>>;
        const profile = (profileResult.data ?? {}) as Record<string, unknown>;
        const rides = (rideAggResult.data ?? []) as Array<Record<string, unknown>>;
        const earnedKeys = new Set(earnedRows.map((r) => r.badge_key as string));

        // Compute aggregates for progress
        const totalDistanceM = rides.reduce((s, r) => s + Number(r.distance_meters ?? 0), 0);
        const totalDurationMin = rides.reduce((s, r) => s + Number(r.duration_minutes ?? 0), 0);
        const totalElevationM = rides.reduce((s, r) => s + Number(r.elevation_gain_m ?? 0), 0);
        const maxSingleDistanceM = rides.reduce((m, r) => Math.max(m, Number(r.distance_meters ?? 0)), 0);
        const maxSingleElevM = rides.reduce((m, r) => Math.max(m, Number(r.elevation_gain_m ?? 0)), 0);
        const totalCo2 = Number(profile.total_co2_saved_kg ?? 0);
        const totalMoney = Number(profile.total_money_saved_eur ?? 0);
        const totalHazards = Number(profile.total_hazards_reported ?? 0);
        const totalRiders = Number(profile.total_riders_protected ?? 0);
        const rideCount = rides.length;

        // Map badge key → { current, target } for unearthed tiered badges
        const progressMap: Record<string, { current: number; target: number }> = {
          distance_50km:    { current: totalDistanceM / 1000,     target: 50 },
          distance_150km:   { current: totalDistanceM / 1000,     target: 150 },
          distance_500km:   { current: totalDistanceM / 1000,     target: 500 },
          distance_1500km:  { current: totalDistanceM / 1000,     target: 1500 },
          distance_5000km:  { current: totalDistanceM / 1000,     target: 5000 },
          single_10km:      { current: maxSingleDistanceM / 1000, target: 10 },
          single_25km:      { current: maxSingleDistanceM / 1000, target: 25 },
          single_50km:      { current: maxSingleDistanceM / 1000, target: 50 },
          single_100km:     { current: maxSingleDistanceM / 1000, target: 100 },
          single_200km:     { current: maxSingleDistanceM / 1000, target: 200 },
          time_5h:          { current: totalDurationMin / 60,     target: 5 },
          time_15h:         { current: totalDurationMin / 60,     target: 15 },
          time_50h:         { current: totalDurationMin / 60,     target: 50 },
          time_150h:        { current: totalDurationMin / 60,     target: 150 },
          time_500h:        { current: totalDurationMin / 60,     target: 500 },
          rides_10:         { current: rideCount,                  target: 10 },
          rides_30:         { current: rideCount,                  target: 30 },
          rides_100:        { current: rideCount,                  target: 100 },
          rides_300:        { current: rideCount,                  target: 300 },
          rides_1000:       { current: rideCount,                  target: 1000 },
          co2_5kg:          { current: totalCo2,                   target: 5 },
          co2_15kg:         { current: totalCo2,                   target: 15 },
          co2_50kg:         { current: totalCo2,                   target: 50 },
          co2_150kg:        { current: totalCo2,                   target: 150 },
          co2_500kg:        { current: totalCo2,                   target: 500 },
          money_10:         { current: totalMoney,                  target: 10 },
          money_50:         { current: totalMoney,                  target: 50 },
          money_200:        { current: totalMoney,                  target: 200 },
          money_500:        { current: totalMoney,                  target: 500 },
          money_2000:       { current: totalMoney,                  target: 2000 },
          hazard_5:         { current: totalHazards,                target: 5 },
          hazard_15:        { current: totalHazards,                target: 15 },
          hazard_50:        { current: totalHazards,                target: 50 },
          hazard_100:       { current: totalHazards,                target: 100 },
          hazard_250:       { current: totalHazards,                target: 250 },
          total_climb_1km:  { current: totalElevationM / 1000,     target: 1 },
          total_climb_5km:  { current: totalElevationM / 1000,     target: 5 },
          total_climb_10km: { current: totalElevationM / 1000,     target: 10 },
          total_climb_25km: { current: totalElevationM / 1000,     target: 25 },
          climb_100m:       { current: maxSingleElevM,             target: 100 },
          climb_300m:       { current: maxSingleElevM,             target: 300 },
          climb_500m:       { current: maxSingleElevM,             target: 500 },
          climb_1000m:      { current: maxSingleElevM,             target: 1000 },
          protected_5:      { current: totalRiders,                target: 5 },
          protected_25:     { current: totalRiders,                target: 25 },
          protected_100:    { current: totalRiders,                target: 100 },
        };

        const definitions = defs.map((d) => ({
          badgeKey:     d.badge_key as string,
          category:     d.category as string,
          displayTab:   d.display_tab as string,
          name:         d.name as string,
          flavorText:   d.flavor_text as string,
          criteriaText: d.criteria_text as string,
          criteriaUnit: (d.criteria_unit as string | null) ?? null,
          tier:         Number(d.tier ?? 0),
          tierFamily:   (d.tier_family as string | null) ?? null,
          isHidden:     Boolean(d.is_hidden),
          isSeasonal:   Boolean(d.is_seasonal),
          sortOrder:    Number(d.sort_order ?? 0),
          iconKey:      d.icon_key as string,
        }));

        const earned = earnedRows.map((r) => ({
          badgeKey: r.badge_key as string,
          earnedAt: r.earned_at as string,
          metadata: (r.metadata as Record<string, unknown>) ?? {},
        }));

        // Build progress list for unearthed badges that have computable progress
        const progress = Object.entries(progressMap)
          .filter(([key]) => !earnedKeys.has(key))
          .map(([key, { current, target }]) => ({
            badgeKey: key,
            current:  Math.min(current, target),
            target,
            progress: Math.min(1, current / target),
          }))
          .filter(({ progress: p }) => p > 0);

        return { definitions, earned, progress };
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
