import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { requireAuthenticatedUser, requireFullUser } from '../lib/auth';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  errorResponseSchema,
  activateMiaBodySchema,
  activateMiaResponseSchema,
  miaJourneyResponseSchema,
  optOutMiaResponseSchema,
  testimonialBodySchema,
  testimonialResponseSchema,
  telemetryBatchBodySchema,
  telemetryBatchResponseSchema,
  detectionEvaluateResponseSchema,
  notificationEvaluateResponseSchema,
  type ActivateMiaBody,
  type ActivateMiaResponse,
  type MiaJourneyResponse,
  type OptOutMiaResponse,
  type TestimonialBody,
  type TestimonialResponse,
  type TelemetryBatchBody,
  type TelemetryBatchResponse,
  type DetectionEvaluateResponse,
  type NotificationEvaluateResponse,
} from '../lib/miaSchemas';
import { evaluateMiaNotifications } from '../lib/miaNotifications';

// Rides needed per level to advance (level -> rides needed for next level)
const RIDES_NEEDED_BY_LEVEL: Record<number, number> = {
  1: 3,
  2: 5,
  3: 8,
  4: 12,
  5: 0, // max level
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RateLimitPolicyKey = keyof MobileApiDependencies['rateLimitPolicies'];

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

const applyRateLimit = async (
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: MobileApiDependencies,
  policyKey: RateLimitPolicyKey,
  options: { userId?: string } = {},
) => {
  const decision = await dependencies.rateLimiter.consume({
    bucket: policyKey,
    key: buildRateLimitIdentity({
      ip: request.ip,
      userId: options.userId,
    }),
    limit: dependencies.rateLimitPolicies[policyKey].limit,
    windowMs: dependencies.rateLimitPolicies[policyKey].windowMs,
  });

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
};

/** Require an authenticated user (OAuth or anonymous). */
const requireAuth = (
  request: Parameters<typeof requireAuthenticatedUser>[0],
  dependencies: MobileApiDependencies,
) => requireAuthenticatedUser(request, dependencies.authenticateUser);

/** Require a full OAuth user — rejects anonymous Supabase sessions. */
const requireFullAuth = (
  request: Parameters<typeof requireFullUser>[0],
  dependencies: MobileApiDependencies,
) => requireFullUser(request, dependencies.authenticateUser);

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
// Plugin
// ---------------------------------------------------------------------------

export const buildMiaRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // GET /mia/journey — fetch current Mia persona journey state
    app.get<{ Reply: MiaJourneyResponse | ErrorResponse }>(
      '/mia/journey',
      {
        schema: {
          response: {
            200: miaJourneyResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireAuth(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'routePreview', { userId: user.id });

        const db = ensureSupabase();

        const { data, error } = await db
          .from('profiles')
          .select(
            'persona, mia_journey_level, mia_journey_status, mia_journey_started_at, ' +
            'mia_journey_completed_at, mia_detection_source, mia_total_rides, ' +
            'mia_rides_with_destination, mia_rides_over_5km, mia_moderate_segments_completed, ' +
            'mia_testimonial',
          )
          .eq('id', user.id)
          .single();

        if (error) {
          request.log.error(
            { event: 'mia_journey_query_error', error: error.message },
            'mia journey query failed',
          );
          throw new HttpError('Failed to fetch Mia journey state.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const row = data as unknown as Record<string, unknown> | null;

        // If no profile row exists, return default state
        const persona = (row?.persona as string) ?? 'alex';
        const level = Number(row?.mia_journey_level ?? 1);
        const status = (row?.mia_journey_status as string) ?? null;
        const ridesNeeded = RIDES_NEEDED_BY_LEVEL[level] ?? 0;

        return {
          persona: persona as 'alex' | 'mia',
          level,
          status: status as MiaJourneyResponse['status'],
          totalRides: Number(row?.mia_total_rides ?? 0),
          ridesWithDestination: Number(row?.mia_rides_with_destination ?? 0),
          ridesOver5km: Number(row?.mia_rides_over_5km ?? 0),
          moderateSegmentsCompleted: Number(row?.mia_moderate_segments_completed ?? 0),
          ridesNeeded,
          detectionSource: (row?.mia_detection_source as MiaJourneyResponse['detectionSource']) ?? null,
          startedAt: row?.mia_journey_started_at ? String(row.mia_journey_started_at) : null,
          completedAt: row?.mia_journey_completed_at ? String(row.mia_journey_completed_at) : null,
          testimonial: row?.mia_testimonial ? String(row.mia_testimonial) : null,
        };
      },
    );

    // POST /mia/activate — activate the Mia persona journey (OAuth only — anonymous rejected)
    app.post<{ Body: ActivateMiaBody; Reply: ActivateMiaResponse | ErrorResponse }>(
      '/mia/activate',
      {
        schema: {
          body: activateMiaBodySchema,
          response: {
            200: activateMiaResponseSchema,
            401: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullAuth(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        const db = ensureSupabase();
        const { source } = request.body;
        const now = new Date().toISOString();

        // Check current state to prevent re-activation
        const { data: current, error: readError } = await db
          .from('profiles')
          .select('persona, mia_journey_status')
          .eq('id', user.id)
          .single();

        if (readError) {
          throw new HttpError('Failed to read profile.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [readError.message],
          });
        }

        const currentRow = current as unknown as Record<string, unknown> | null;
        if (currentRow?.persona === 'mia' && currentRow?.mia_journey_status === 'active') {
          throw new HttpError('Mia journey is already active.', {
            statusCode: 409,
            code: 'CONFLICT',
          });
        }

        // Update profile
        const { error: updateError } = await db
          .from('profiles')
          .update({
            persona: 'mia',
            mia_journey_status: 'active',
            mia_detection_source: source,
            mia_journey_started_at: now,
            mia_journey_level: 1,
          })
          .eq('id', user.id);

        if (updateError) {
          request.log.error(
            { event: 'mia_activate_error', error: updateError.message },
            'mia activation failed',
          );
          throw new HttpError('Failed to activate Mia journey.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [updateError.message],
          });
        }

        // Log event
        const { error: eventError } = await db
          .from('mia_journey_events')
          .insert({
            user_id: user.id,
            event_type: 'activated',
            from_level: null,
            to_level: 1,
            metadata: { source },
          });

        if (eventError) {
          request.log.warn(
            { event: 'mia_event_log_error', error: eventError.message },
            'failed to log mia activation event',
          );
        }

        return { activatedAt: now };
      },
    );

    // POST /mia/opt-out — opt out of the Mia persona journey (OAuth only — anonymous rejected)
    app.post<{ Reply: OptOutMiaResponse | ErrorResponse }>(
      '/mia/opt-out',
      {
        schema: {
          response: {
            200: optOutMiaResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullAuth(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        const db = ensureSupabase();
        const now = new Date().toISOString();

        // Read current level for event logging
        const { data: current } = await db
          .from('profiles')
          .select('mia_journey_level, mia_journey_status')
          .eq('id', user.id)
          .single();

        const currentRow = current as unknown as Record<string, unknown> | null;
        const currentLevel = Number(currentRow?.mia_journey_level ?? 1);
        const currentStatus = (currentRow?.mia_journey_status as string) ?? null;

        // Update profile to alex + opted_out
        const { error: updateError } = await db
          .from('profiles')
          .update({
            persona: 'alex',
            mia_journey_status: 'opted_out',
          })
          .eq('id', user.id);

        if (updateError) {
          request.log.error(
            { event: 'mia_opt_out_error', error: updateError.message },
            'mia opt-out failed',
          );
          throw new HttpError('Failed to opt out of Mia journey.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [updateError.message],
          });
        }

        // Log event with metadata
        const { error: eventError } = await db
          .from('mia_journey_events')
          .insert({
            user_id: user.id,
            event_type: 'opted_out',
            from_level: currentLevel,
            to_level: null,
            metadata: {
              previousStatus: currentStatus,
              optedOutAt: now,
            },
          });

        if (eventError) {
          request.log.warn(
            { event: 'mia_event_log_error', error: eventError.message },
            'failed to log mia opt-out event',
          );
        }

        return { optedOutAt: now };
      },
    );

    // POST /mia/testimonial — submit a completion testimonial (OAuth only — anonymous rejected)
    app.post<{ Body: TestimonialBody; Reply: TestimonialResponse | ErrorResponse }>(
      '/mia/testimonial',
      {
        schema: {
          body: testimonialBodySchema,
          response: {
            200: testimonialResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullAuth(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        const db = ensureSupabase();
        const { text } = request.body;

        // Verify journey is completed
        const { data: current, error: readError } = await db
          .from('profiles')
          .select('mia_journey_status')
          .eq('id', user.id)
          .single();

        if (readError) {
          throw new HttpError('Failed to read profile.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [readError.message],
          });
        }

        const currentRow = current as unknown as Record<string, unknown> | null;
        if (currentRow?.mia_journey_status !== 'completed') {
          throw new HttpError('Testimonial requires a completed Mia journey.', {
            statusCode: 400,
            code: 'BAD_REQUEST',
            details: ['Complete the Mia journey before submitting a testimonial.'],
          });
        }

        const now = new Date().toISOString();

        // Update testimonial
        const { error: updateError } = await db
          .from('profiles')
          .update({ mia_testimonial: text.trim() })
          .eq('id', user.id);

        if (updateError) {
          request.log.error(
            { event: 'mia_testimonial_error', error: updateError.message },
            'mia testimonial save failed',
          );
          throw new HttpError('Failed to save testimonial.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [updateError.message],
          });
        }

        // Log event
        const { error: eventError } = await db
          .from('mia_journey_events')
          .insert({
            user_id: user.id,
            event_type: 'testimonial_submitted',
            metadata: { textLength: text.trim().length },
          });

        if (eventError) {
          request.log.warn(
            { event: 'mia_event_log_error', error: eventError.message },
            'failed to log mia testimonial event',
          );
        }

        return { acceptedAt: now };
      },
    );

    // POST /mia/telemetry/events — batch ingest telemetry events
    app.post<{ Body: TelemetryBatchBody; Reply: TelemetryBatchResponse | ErrorResponse }>(
      '/mia/telemetry/events',
      {
        schema: {
          body: telemetryBatchBodySchema,
          response: {
            200: telemetryBatchResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // Allows anonymous users — telemetry from all users
        const user = await requireAuth(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'write', { userId: user.id });

        const db = ensureSupabase();
        const { events } = request.body;

        const rows = events.map((evt) => ({
          user_id: user.id,
          event_type: evt.event_type,
          properties: evt.properties ?? {},
          session_id: evt.session_id ?? null,
          created_at: evt.timestamp,
        }));

        const { error } = await db
          .from('user_telemetry_events')
          .insert(rows);

        if (error) {
          request.log.error(
            { event: 'telemetry_batch_insert_error', error: error.message },
            'telemetry batch insert failed',
          );
          throw new HttpError('Failed to insert telemetry events.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { accepted: rows.length };
      },
    );

    // POST /mia/detection/evaluate — cron endpoint for daily detection scoring
    app.post<{ Reply: DetectionEvaluateResponse | ErrorResponse }>(
      '/mia/detection/evaluate',
      {
        schema: {
          response: {
            200: detectionEvaluateResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        // Authenticate via CRON_SECRET header (same pattern as leaderboard settle)
        const cronSecret = process.env.CRON_SECRET ?? '';
        if (!cronSecret) {
          throw new HttpError('Cron secret not configured.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
          });
        }

        const auth = request.headers.authorization;
        if (auth !== `Bearer ${cronSecret}`) {
          throw new HttpError('Unauthorized cron call.', {
            statusCode: 401,
            code: 'UNAUTHORIZED',
          });
        }

        const db = ensureSupabase();

        // Find eligible users:
        // - persona = 'alex' (not yet Mia)
        // - mia_prompt_shown = false (not already prompted)
        // - signed up between 3 and 14 days ago
        // - zero rides
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

        const { data: eligibleUsers, error: queryError } = await db
          .from('profiles')
          .select('id')
          .eq('persona', 'alex')
          .eq('mia_prompt_shown', false)
          .eq('mia_total_rides', 0)
          .lte('created_at', threeDaysAgo)
          .gte('created_at', fourteenDaysAgo)
          .limit(500);

        if (queryError) {
          request.log.error(
            { event: 'mia_detection_query_error', error: queryError.message },
            'detection eligible user query failed',
          );
          throw new HttpError('Detection query failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            details: [queryError.message],
          });
        }

        const users = (eligibleUsers ?? []) as Array<{ id: string }>;
        let evaluated = 0;
        let prompted = 0;

        for (const row of users) {
          const { data: result, error: rpcError } = await db.rpc('evaluate_mia_detection', {
            p_user_id: row.id,
          });

          if (rpcError) {
            request.log.warn(
              { event: 'mia_detection_rpc_error', userId: row.id, error: rpcError.message },
              'detection scoring failed for user',
            );
            continue;
          }

          evaluated++;
          const rpcResult = result as { score: number; prompt_triggered: boolean } | null;
          if (rpcResult?.prompt_triggered) {
            prompted++;
          }
        }

        request.log.info(
          { event: 'mia_detection_complete', evaluated, prompted },
          'mia detection evaluation complete',
        );

        return { evaluated, prompted };
      },
    );

    // POST /mia/notifications/evaluate — cron endpoint for daily Mia nudges
    app.post<{ Reply: NotificationEvaluateResponse | ErrorResponse }>(
      '/mia/notifications/evaluate',
      {
        schema: {
          response: {
            200: notificationEvaluateResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        // Authenticate via CRON_SECRET header
        const cronSecret = process.env.CRON_SECRET ?? '';
        if (!cronSecret) {
          throw new HttpError('Cron secret not configured.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
          });
        }

        const auth = request.headers.authorization;
        if (auth !== `Bearer ${cronSecret}`) {
          throw new HttpError('Unauthorized cron call.', {
            statusCode: 401,
            code: 'UNAUTHORIZED',
          });
        }

        const db = ensureSupabase();

        // Find active Mia users with notifications enabled
        const { data: miaUsers, error: queryError } = await db
          .from('profiles')
          .select('id, persona, mia_journey_level, mia_journey_status, mia_total_rides, mia_rides_with_destination, mia_started_at, notify_mia, created_at, last_ride_at')
          .eq('persona', 'mia')
          .eq('mia_journey_status', 'active')
          .eq('notify_mia', true)
          .limit(500);

        if (queryError) {
          request.log.error(
            { event: 'mia_notification_query_error', error: queryError.message },
            'notification eligible user query failed',
          );
          throw new HttpError('Notification query failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            details: [queryError.message],
          });
        }

        const users = (miaUsers ?? []) as Array<{
          id: string;
          persona: string;
          mia_journey_level: number;
          mia_journey_status: string | null;
          mia_total_rides: number;
          mia_rides_with_destination: number;
          mia_started_at: string | null;
          notify_mia: boolean;
          created_at: string;
          last_ride_at: string | null;
        }>;

        let evaluated = 0;
        let notified = 0;

        for (const user of users) {
          try {
            const results = await evaluateMiaNotifications(db, user);
            evaluated++;
            if (results.some((r) => r.sent)) {
              notified++;
            }
          } catch (err) {
            request.log.warn(
              { event: 'mia_notification_error', userId: user.id, error: (err as Error).message },
              'notification evaluation failed for user',
            );
          }
        }

        request.log.info(
          { event: 'mia_notifications_complete', evaluated, notified },
          'mia notification evaluation complete',
        );

        return { evaluated, notified };
      },
    );

  };

  return routes;
};
