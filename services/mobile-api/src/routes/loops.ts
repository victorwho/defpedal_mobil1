/**
 * POST /v1/loops — generate recreational loops server-side.
 *
 * Replaces a fan-out the app used to do itself: up to sixty OSRM requests and
 * fifteen enrichment calls, all from the handset, of which every ring response
 * but the final five was downloaded and thrown away. Measured on a 15 km
 * Bucharest ring, one response is about 165 KB, so a single search moved
 * megabytes over mobile data to show five rows.
 *
 * ## Why the response streams
 *
 * The planner draws each loop onto the map as it lands, under a live counter.
 * A buffered response would replace that with a spinner over the same wait, so
 * this answers newline-delimited JSON: one frame per line, flushed as the
 * search produces it. It is still ONE request — the client opens it once and
 * reads until the stream ends.
 *
 * The stream always ends with exactly one terminal frame, `result` / `empty` /
 * `error`. That is load-bearing: a truncated stream and an empty result look
 * identical otherwise, and one of them is a failure we would never see. The
 * client treats a stream that ends without a terminal frame as an error.
 *
 * ## Why errors are reported inside the stream
 *
 * Headers go out with the first frame, long before the search can fail, so a
 * mid-search failure cannot become an HTTP status. Everything that can be
 * checked up front — auth, validation, rate limit, coverage — is checked
 * BEFORE the first byte and answers with a real status code. Anything after
 * that arrives as an `error` frame.
 */
import {
  isRouteSupported,
  LOOP_DISTANCE_STEPS_METERS,
  LOOP_HEADINGS,
  type ErrorResponse,
  type GeneratedLoop,
  type LoopHeading,
  type LoopSearchRequest,
  type LoopStreamFrame,
  type LoopSurface,
  type LoopTerrain,
} from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { requireAuthenticatedUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { createMeasurementPort } from '../lib/loops/measure';
import { fetchLoopRoute } from '../lib/loops/osrm';
import { searchLoops } from '../lib/loops/search';
import { buildRateLimitIdentity } from '../lib/rateLimit';

const TERRAINS: readonly LoopTerrain[] = ['flat', 'rolling', 'hilly'];
const SURFACES: readonly LoopSurface[] = ['paved', 'any', 'offroad'];

/**
 * Bounds on the requested length.
 *
 * Taken from the picker's own steps rather than invented here, so the endpoint
 * cannot accept a distance the generator was never calibrated for. The picker
 * is snapped because the tolerance is wider than the gap between neighbouring
 * steps, but the endpoint accepts any value in range: a future picker with
 * different steps should not need a server deploy.
 */
const MIN_TARGET_METERS = LOOP_DISTANCE_STEPS_METERS[0]!;
const MAX_TARGET_METERS =
  LOOP_DISTANCE_STEPS_METERS[LOOP_DISTANCE_STEPS_METERS.length - 1]!;

interface LoopSearchBody {
  start: { lat: number; lon: number };
  targetDistanceMeters: number;
  terrain: LoopTerrain;
  surface: LoopSurface;
  heading: LoopHeading;
  locale?: string;
}

const loopSearchBodySchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['start', 'targetDistanceMeters', 'terrain', 'surface', 'heading'],
  properties: {
    start: {
      type: 'object' as const,
      additionalProperties: false,
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number' as const, minimum: -90, maximum: 90 },
        lon: { type: 'number' as const, minimum: -180, maximum: 180 },
      },
    },
    targetDistanceMeters: {
      type: 'number' as const,
      minimum: MIN_TARGET_METERS,
      maximum: MAX_TARGET_METERS,
    },
    terrain: { type: 'string' as const, enum: [...TERRAINS] },
    surface: { type: 'string' as const, enum: [...SURFACES] },
    heading: { type: 'string' as const, enum: [...LOOP_HEADINGS] },
    locale: { type: 'string' as const, maxLength: 12 },
  },
};

/**
 * Rate limit, applied before a single byte is written.
 *
 * Its own bucket rather than `routePreview`: one call here is worth as many as
 * sixty OSRM requests, and sharing a bucket with the risk overlay is exactly
 * the coupling that moving this work server-side was meant to break.
 *
 * Returns the rate-limit headers as well as setting them. The success path
 * hijacks the reply and writes its own head, which does NOT carry anything set
 * through `reply.header()` — so the returned record is merged in there. Setting
 * them on `reply` too is what covers the 429 path, which Fastify still sends.
 */
const applyLoopRateLimit = async (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: MobileApiDependencies,
  userId: string,
): Promise<Record<string, string>> => {
  const policy = dependencies.rateLimitPolicies.loopSearch;
  const decision = await dependencies.rateLimiter.consume({
    bucket: 'loopSearch',
    key: buildRateLimitIdentity({ ip: request.ip, userId }),
    limit: policy.limit,
    windowMs: policy.windowMs,
  });

  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
    'x-ratelimit-reset': String(Math.ceil(decision.resetAt / 1000)),
  };
  if (decision.retryAfterMs > 0) {
    headers['retry-after'] = String(
      Math.max(1, Math.ceil(decision.retryAfterMs / 1000)),
    );
  }
  for (const [name, value] of Object.entries(headers)) {
    reply.header(name, value);
  }

  if (!decision.allowed) {
    request.log.warn(
      {
        event: 'mobile_api_rate_limited',
        policy: 'loopSearch',
        ip: request.ip,
        userId,
      },
      'request rate limited',
    );
    throw new HttpError('Rate limit exceeded for this endpoint.', {
      statusCode: 429,
      code: 'RATE_LIMITED',
      details: [
        `Retry after ${Math.max(1, Math.ceil(decision.retryAfterMs / 1000))} seconds.`,
      ],
    });
  }

  return headers;
};

/**
 * A writer that never lets a frame overtake another.
 *
 * `res.write` is asynchronous under back-pressure, and the search fires
 * candidate callbacks from several concurrent workers. Serialising through one
 * promise chain is what keeps a half-written line from being interleaved with
 * the next one, which would produce JSON that parses on neither side.
 */
const createFrameWriter = (reply: FastifyReply) => {
  let chain: Promise<void> = Promise.resolve();
  let closed = false;

  const writeRaw = (line: string): Promise<void> =>
    new Promise((resolve) => {
      if (closed || reply.raw.writableEnded) {
        resolve();
        return;
      }
      // Ignore the callback error: a rider who closed the app mid-search is
      // the normal way this ends, not a fault worth reporting.
      reply.raw.write(line, () => resolve());
    });

  return {
    write(frame: LoopStreamFrame): Promise<void> {
      chain = chain.then(() => writeRaw(`${JSON.stringify(frame)}\n`));
      return chain;
    },
    async end(): Promise<void> {
      await chain;
      closed = true;
      if (!reply.raw.writableEnded) reply.raw.end();
    },
  };
};

export const buildLoopRoutes =
  (dependencies: MobileApiDependencies): FastifyPluginAsync =>
  async (app) => {
    app.post<{ Body: LoopSearchBody; Reply: ErrorResponse }>(
      '/loops',
      {
        schema: {
          body: loopSearchBodySchema,
          // No 200 schema on purpose. The success path hijacks the reply and
          // streams NDJSON, so Fastify's serializer never sees it — declaring
          // one would describe a response that is not produced. The error
          // statuses below are ordinary JSON and do go through it.
          response: {
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            429: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Anonymous Supabase sessions are allowed, matching /risk-segments:
        // loop generation is a core product surface and anonymous-first
        // onboarding is the conversion funnel. An anonymous session is still a
        // real JWT, and the rate limit is keyed on its user id.
        const user = await requireAuthenticatedUser(
          request,
          dependencies.authenticateUser,
        );
        const rateLimitHeaders = await applyLoopRateLimit(
          request,
          reply,
          dependencies,
          user.id,
        );

        const body = request.body;
        const start = { lat: body.start.lat, lon: body.start.lon };

        // Loops are OSRM-only and there is no degraded mode: they need
        // `exclude=unpaved`, road classes on the intersections AND the safety
        // profile, and Mapbox Directions supplies none of the three. Outside
        // coverage the honest answer is a refusal, not a worse loop.
        if (!isRouteSupported(start, start).supported) {
          throw new HttpError('Loop generation is not available here.', {
            statusCode: 403,
            code: 'FEATURE_DISABLED',
            details: [
              'Loops need the safety routing graph, which covers the EU, EEA and Switzerland.',
            ],
          });
        }

        const searchRequest: LoopSearchRequest = {
          start,
          targetDistanceMeters: body.targetDistanceMeters,
          terrain: body.terrain,
          surface: body.surface,
          heading: body.heading,
          locale: body.locale ?? 'en',
        };

        // Everything checkable has been checked. From here the response is a
        // stream and a failure can only be an `error` frame.
        reply.hijack();
        reply.raw.writeHead(200, {
          ...rateLimitHeaders,
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
          // Cloud Run streams fine, but an intermediate proxy that buffers
          // would turn this back into the spinner it exists to avoid.
          'x-accel-buffering': 'no',
        });

        const writer = createFrameWriter(reply);

        // A rider who closes the app or taps Cancel drops the connection.
        // Without this the search runs to completion against OSRM for nobody.
        const controller = new AbortController();
        reply.raw.on('close', () => controller.abort());

        const ports = {
          fetchRing: fetchLoopRoute,
          measure: createMeasurementPort(dependencies).measure,
        };

        const startedAt = Date.now();
        try {
          const outcome = await searchLoops(ports, searchRequest, {
            signal: controller.signal,
            onCandidate: (loop: GeneratedLoop) => {
              void writer.write({ type: 'candidate', loop });
            },
            onProgress: (resolved: number, attempted: number) => {
              void writer.write({ type: 'progress', resolved, attempted });
            },
          });

          if (outcome.status === 'ok') {
            await writer.write({
              type: 'result',
              status: 'ok',
              loops: outcome.loops,
              relaxation: outcome.relaxation,
              checked: outcome.checked,
            });
          } else if (outcome.status === 'empty') {
            await writer.write({ type: 'empty' });
          }
          // `cancelled` writes no terminal frame: the rider is gone and the
          // socket is already closed. Anything written here goes nowhere.

          request.log.info(
            {
              event: 'loop_search_completed',
              userId: user.id,
              status: outcome.status,
              durationMs: Date.now() - startedAt,
              targetKm: Math.round(body.targetDistanceMeters / 1000),
              terrain: body.terrain,
              surface: body.surface,
              heading: body.heading,
              loops: outcome.status === 'ok' ? outcome.loops.length : 0,
              relaxation: outcome.status === 'ok' ? outcome.relaxation : null,
              checked: outcome.status === 'ok' ? outcome.checked : 0,
            },
            'loop search completed',
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error.';
          request.log.error(
            {
              event: 'loop_search_failed',
              userId: user.id,
              durationMs: Date.now() - startedAt,
              error: message,
            },
            'loop search failed',
          );
          await writer.write({ type: 'error', message });
        } finally {
          await writer.end();
        }
      },
    );
  };
