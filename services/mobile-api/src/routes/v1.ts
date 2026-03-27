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
  WriteAckResponse,
  ReverseGeocodeResponse,
  RoutePreviewResponse,
} from '@defensivepedal/core';
import { getPreviewOrigin } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { config } from '../config';
import { getAuthenticatedUserFromRequest, requireAuthenticatedUser } from '../lib/auth';
import { buildCacheKey } from '../lib/cache';
import type { MobileApiDependencies } from '../lib/dependencies';
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

type NormalizedRouteRequest = RoutePreviewRequest | RerouteRequest;
type RateLimitPolicyKey = keyof MobileApiDependencies['rateLimitPolicies'];

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
          return await dependencies.finishTripRecord(normalizeTripEndRequest(request.body), user.id);
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
      async (request, reply) => {
        const user = await requireWriteUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', {
          userId: user.id,
        });

        try {
          const body = request.body as {
            tripId: string;
            clientTripId: string;
            routingMode: string;
            plannedRoutePolyline6?: string;
            plannedRouteDistanceMeters?: number;
            gpsBreadcrumbs: Array<{ lat: number; lon: number; ts: number; acc: number | null; spd: number | null; hdg: number | null }>;
            endReason: string;
            startedAt: string;
            endedAt: string;
          };

          return await dependencies.saveTripTrack(
            {
              tripId: body.tripId,
              clientTripId: body.clientTripId,
              routingMode: body.routingMode as 'safe' | 'fast',
              plannedRoutePolyline6: body.plannedRoutePolyline6,
              plannedRouteDistanceMeters: body.plannedRouteDistanceMeters,
              gpsBreadcrumbs: body.gpsBreadcrumbs,
              endReason: body.endReason as 'completed' | 'stopped' | 'app_killed',
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
          return await dependencies.submitHazardReport(
            normalizeHazardReportRequest(request.body),
            user?.id ?? null,
          );
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
        const { data, error } = await dependencies.supabaseAdmin
          .from('hazards')
          .select('id, lat, lon, hazard_type, created_at, confirm_count, deny_count, expires_at')
          .gte('lat', lat - degDelta)
          .lte('lat', lat + degDelta)
          .gte('lon', lon - degDelta)
          .lte('lon', lon + degDelta)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        const hazards = (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id,
          lat: row.lat,
          lon: row.lon,
          hazardType: row.hazard_type,
          createdAt: row.created_at,
          confirmCount: row.confirm_count ?? 0,
          denyCount: row.deny_count ?? 0,
        }));

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
    }>('/hazards/:hazardId/validate', async (request, reply) => {
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

      if (!['confirm', 'deny', 'pass'].includes(validationResponse)) {
        return reply.status(400).send({
          error: 'Invalid response.',
          code: 'VALIDATION_ERROR',
          details: ['response must be confirm, deny, or pass.'],
        });
      }

      try {
        const { error } = await dependencies.supabaseAdmin
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
  };

  return routes;
};
