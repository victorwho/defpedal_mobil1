/**
 * Route-share API routes.
 *
 *   POST /v1/route-shares              (auth required)
 *   GET  /v1/route-shares/public/:code (public)
 *
 * Feature-flagged at `app.ts` via ENABLE_ROUTE_SHARES — when disabled, the
 * routes are not registered and the plugin is a no-op, which means any hit
 * on the paths above yields Fastify's default 404 (no route exposed).
 */

import type { ErrorResponse } from '@defensivepedal/core';
import { buildShareDeepLinks } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import {
  createRouteShareService,
  type RouteShareService,
} from '../lib/routeShareService';
import {
  errorResponseSchema,
  routeShareCreateRequestSchema,
  routeShareCreateResponseSchema,
  routeSharePublicParamsSchema,
  routeSharePublicResponseSchema,
  type RouteShareCreateRequest,
  type RouteShareCreateResponse,
  type RouteSharePublicParams,
  type RouteSharePublicResponse,
} from '../lib/routeShareSchemas';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Plugin factory
// ---------------------------------------------------------------------------

export type BuildRouteShareRoutesOptions = {
  /** Optional pre-built service. Defaults to one backed by supabaseAdmin. */
  service?: RouteShareService;
};

export const buildRouteShareRoutes = (
  dependencies: MobileApiDependencies,
  options: BuildRouteShareRoutesOptions = {},
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    const buildService = (): RouteShareService => {
      if (options.service) return options.service;
      const supabase = ensureSupabase();
      // Cast: supabaseAdmin is the full Supabase client; the service only
      // uses the subset declared in `SupabaseLike`.
      return createRouteShareService({
        supabase: supabase as unknown as Parameters<
          typeof createRouteShareService
        >[0]['supabase'],
      });
    };

    // -----------------------------------------------------------------------
    // POST /v1/route-shares
    // -----------------------------------------------------------------------
    app.post<{
      Body: RouteShareCreateRequest;
      Reply: RouteShareCreateResponse | ErrorResponse;
    }>(
      '/route-shares',
      {
        schema: {
          body: routeShareCreateRequestSchema,
          response: {
            200: routeShareCreateResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );

        const service = buildService();

        let row;
        try {
          row = await service.createShare({
            userId: user.id,
            request: request.body,
          });
        } catch (err) {
          request.log.error(
            { event: 'route_share_create_error', err: (err as Error).message },
            'route share creation failed',
          );
          throw new HttpError('Failed to create route share.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [(err as Error).message],
          });
        }

        const links = buildShareDeepLinks(row.code);

        return {
          id: row.id,
          code: row.code,
          source: row.source,
          appUrl: links.appUrl,
          webUrl: links.webUrl,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
        };
      },
    );

    // -----------------------------------------------------------------------
    // GET /v1/route-shares/public/:code
    // -----------------------------------------------------------------------
    app.get<{
      Params: RouteSharePublicParams;
      Reply: RouteSharePublicResponse | ErrorResponse;
    }>(
      '/route-shares/public/:code',
      {
        schema: {
          params: routeSharePublicParamsSchema,
          response: {
            200: routeSharePublicResponseSchema,
            404: errorResponseSchema,
            410: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const service = buildService();

        const result = await service.getPublicShare(request.params.code);

        if (result.ok === true) {
          return result.value as unknown as RouteSharePublicResponse;
        }

        // result is the error branch: { ok: false; error: PublicShareError }
        const errorCode: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' = (
          result as { ok: false; error: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' }
        ).error;

        if (errorCode === 'NOT_FOUND') {
          throw new HttpError('Route share not found.', {
            statusCode: 404,
            code: 'NOT_FOUND',
          });
        }

        // EXPIRED and REVOKED both resolve to HTTP 410 Gone — the share
        // once existed but is no longer reachable.
        throw new HttpError(
          errorCode === 'EXPIRED'
            ? 'Route share has expired.'
            : 'Route share has been revoked.',
          {
            statusCode: 410,
            code: 'NOT_FOUND',
            details: [errorCode],
          },
        );
      },
    );
  };

  return routes;
};

// ---------------------------------------------------------------------------
// Feature flag — consulted once at route-registration time in app.ts.
// Default is ON per user decision.
// ---------------------------------------------------------------------------

export const isRouteSharesEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const raw = env.ENABLE_ROUTE_SHARES;
  if (raw == null) return true; // default on
  const normalized = raw.trim().toLowerCase();
  // Explicitly off only on the canonical falsy strings. Any other value
  // (including empty string and unknown tokens) keeps the route enabled so
  // a typo in Cloud Run env doesn't silently disable sharing.
  return !(normalized === 'false' || normalized === '0' || normalized === 'off');
};
