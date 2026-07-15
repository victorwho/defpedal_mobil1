import cors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';

import { config } from './config';
import { createMobileApiDependencies, type MobileApiDependencies } from './lib/dependencies';
import { formatValidationDetails, HttpError, toErrorResponse } from './lib/http';
import { captureServerException } from './lib/sentry';
import { buildRequestTelemetry } from './lib/telemetry';
import { buildAccountRoutes } from './routes/account';
import { buildActivityFeedRoutes } from './routes/activity-feed';
import { buildFeedRoutes } from './routes/feed';
import { buildFollowRoutes } from './routes/follow';
import { buildLeaderboardRoutes } from './routes/leaderboard';
import { buildFirstRideNotificationRoutes } from './routes/firstRideNotifications';
import { buildModerationRoutes } from './routes/moderation';
import { buildNudgeRoutes } from './routes/nudges';
import { buildRetentionRoutes } from './routes/retention';
import { buildRouteShareRoutes, isRouteSharesEnabled } from './routes/route-shares';
import { buildV1Routes } from './routes/v1';

// Path-only URL for error context — querystrings can carry rider GPS
// (audit 2026-07-05 SEC-5); never forward them to Sentry.
const pathOnly = (url: string): string => url.split('?')[0] ?? url;

export const buildApp = (options: {
  dependencies?: Partial<MobileApiDependencies>;
} = {}) => {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Safety net (audit 2026-07-05 SEC-7): no current call site logs full
      // header objects, but if one ever does, bearer tokens and cookies must
      // not reach Cloud Run logs.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          '*.headers.authorization',
        ],
        censor: '[REDACTED]',
      },
    },
  });
  const dependencies = createMobileApiDependencies(options.dependencies);

  // Allow GET requests with Content-Type: application/json but no body.
  // The mobile client sends this header on all requests via XMLHttpRequest defaults.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : '';
    if (!text.trim()) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Slice 8: accept POSTs with no/unknown content type (e.g. beacon
  // requests from scrapers or curl without `-H "Content-Type: ..."`).
  // Without this, Fastify rejects them with 415 before the route handler
  // can see them — which breaks the public view beacon. Empty/unknown
  // bodies resolve to `undefined` so routes that don't declare a body
  // schema behave as if no body was sent.
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, _body, done) => {
    done(null, undefined);
  });

  void app.register(cors, {
    origin:
      config.corsOrigin === '*'
        ? true
        : config.corsOrigin.split(',').map((entry) => entry.trim()),
  });

  app.addHook('onReady', async () => {
    await dependencies.initialize();
    app.log.info(
      {
        event: 'mobile_api_dependencies_ready',
        sharedStoreBackend: dependencies.sharedStoreBackend,
      },
      'mobile api dependencies ready',
    );
  });

  app.addHook('onClose', async () => {
    await dependencies.dispose();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const telemetry = buildRequestTelemetry(
      request.raw.url ?? request.url,
      reply.statusCode,
      reply.elapsedTime ?? 0,
    );

    if (telemetry) {
      request.log.info(telemetry, 'request telemetry');
    }

    done();
  });

  // Shallow liveness probe — stays cheap and dependency-free on purpose. A
  // deep check here would cause Cloud Run restart storms during an upstream
  // (Supabase) outage, which doesn't help.
  app.get('/health', async () => ({
    ok: true,
    service: 'mobile-api',
    sharedStoreBackend: dependencies.sharedStoreBackend,
    generatedAt: new Date().toISOString(),
  }));

  // Readiness probe (review 2026-06-12): a cheap Supabase round-trip so an
  // uptime monitor can distinguish "process up" from "process up but every
  // request fails" (Supabase down / revoked service-role key). 503 on failure.
  app.get('/health/deep', async (_request, reply) => {
    const { supabaseAdmin } = await import('./lib/supabaseAdmin');
    if (!supabaseAdmin) {
      return reply.status(503).send({
        ok: false,
        service: 'mobile-api',
        checks: { supabase: 'unconfigured' },
        generatedAt: new Date().toISOString(),
      });
    }
    try {
      // Lightweight, RLS-exempt (service role) count — no rows transferred.
      const { error } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1);
      if (error) throw error;
      return {
        ok: true,
        service: 'mobile-api',
        checks: { supabase: 'ok' },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ event: 'health_deep_supabase_error', err: error }, 'deep health check failed');
      return reply.status(503).send({
        ok: false,
        service: 'mobile-api',
        checks: { supabase: 'error' },
        generatedAt: new Date().toISOString(),
      });
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (Array.isArray((error as { validation?: unknown[] }).validation)) {
      return reply.status(400).send(
        toErrorResponse(
          'Request validation failed.',
          'VALIDATION_ERROR',
          formatValidationDetails(error),
        ),
      );
    }

    if (error instanceof HttpError) {
      // Review 2026-06-12 P2 (information disclosure): ~60 handler sites put
      // raw upstream/PostgREST error strings into HttpError.details — table,
      // column, and constraint names included. Client-useful details are all
      // 4xx (validation hints, rate-limit retry-afters, share-state
      // discriminators); 5xx details are internals. Centralized policy: log
      // 5xx details server-side, never send them to the client. Handlers can
      // keep attaching details for the log without re-leaking.
      const isServerError = error.statusCode >= 500;
      if (isServerError) {
        if (error.details && error.details.length > 0) {
          request.log.error(
            { event: 'http_error_details', statusCode: error.statusCode, code: error.code, details: error.details },
            error.message,
          );
        }
        // Surface server-side failures in Sentry (4xx client errors are not
        // captured — they're expected). No-op when Sentry is disabled.
        captureServerException(error, {
          statusCode: error.statusCode,
          code: error.code,
          method: request.method,
          url: pathOnly(request.raw.url ?? request.url),
        });
      }
      return reply
        .status(error.statusCode)
        .send(
          toErrorResponse(
            error.message,
            error.code,
            isServerError ? undefined : error.details,
          ),
        );
    }

    // Native Fastify errors (FST_ERR_CTP_BODY_TOO_LARGE → 413, unsupported
    // media type → 415, bad content parsing → 400) carry a meaningful 4xx
    // statusCode. Force-mapping them to 500 made permanent client-payload
    // conditions look retryable — the offline queue burned all 5 retries on
    // an over-bodyLimit /trips/track upload before dead-lettering it (GPS
    // audit 2026-07-15 P0-3). Preserve the status; 5xx and status-less
    // errors stay on the generic path below so they still reach Sentry.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      // The contract's code union is closed; the native Fastify code (e.g.
      // FST_ERR_CTP_BODY_TOO_LARGE) travels in details — 4xx details are
      // client-visible per the policy above.
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error.message, 'BAD_REQUEST', error.code ? [error.code] : undefined));
    }

    app.log.error(error);
    captureServerException(error, {
      method: request.method,
      url: pathOnly(request.raw.url ?? request.url),
    });
    return reply
      .status(500)
      .send(toErrorResponse('Unexpected server error.', 'INTERNAL_ERROR'));
  });

  void app.register(buildV1Routes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildAccountRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildFeedRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildActivityFeedRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildFollowRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildLeaderboardRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildFirstRideNotificationRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildModerationRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildNudgeRoutes(dependencies), {
    prefix: '/v1',
  });

  void app.register(buildRetentionRoutes(dependencies), {
    prefix: '/v1',
  });

  // Route-share routes are feature-flagged via ENABLE_ROUTE_SHARES (default on).
  // Checked at registration time so disabling the flag cleanly removes the
  // route surface — hits return Fastify's default 404.
  if (isRouteSharesEnabled()) {
    void app.register(buildRouteShareRoutes(dependencies), {
      prefix: '/v1',
    });
  }

  return app;
};
