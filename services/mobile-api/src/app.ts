import cors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';

import { config } from './config';
import { createMobileApiDependencies, type MobileApiDependencies } from './lib/dependencies';
import { formatValidationDetails, HttpError, toErrorResponse } from './lib/http';
import { buildRequestTelemetry } from './lib/telemetry';
import { buildActivityFeedRoutes } from './routes/activity-feed';
import { buildFeedRoutes } from './routes/feed';
import { buildFollowRoutes } from './routes/follow';
import { buildLeaderboardRoutes } from './routes/leaderboard';
import { buildMiaRoutes } from './routes/mia';
import { buildV1Routes } from './routes/v1';

export const buildApp = (options: {
  dependencies?: Partial<MobileApiDependencies>;
} = {}) => {
  const app = Fastify({
    logger: {
      level: config.logLevel,
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

  app.get('/health', async () => ({
    ok: true,
    service: 'mobile-api',
    sharedStoreBackend: dependencies.sharedStoreBackend,
    generatedAt: new Date().toISOString(),
  }));

  app.setErrorHandler((error: FastifyError, _request, reply) => {
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
      return reply
        .status(error.statusCode)
        .send(toErrorResponse(error.message, error.code, error.details));
    }

    app.log.error(error);
    return reply
      .status(500)
      .send(toErrorResponse('Unexpected server error.', 'INTERNAL_ERROR'));
  });

  void app.register(buildV1Routes(dependencies), {
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

  void app.register(buildMiaRoutes(dependencies), {
    prefix: '/v1',
  });

  return app;
};
