import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { ensureSupabase } from './feed-helpers';

/**
 * Retention crons — compliance plan item 13.
 *
 * Three Cloud-Scheduler-driven endpoints. Each requires `Authorization:
 * Bearer ${CRON_SECRET}`. Same auth pattern as the existing hazards-expire
 * cron (services/mobile-api/src/routes/v1.ts).
 *
 *   - POST /v1/retention/truncate-gps      Daily 3am Bucharest. Drops
 *                                          gps_trail JSONB on trip_tracks
 *                                          rows older than 90d (unless the
 *                                          author opted into keep_full_gps_history).
 *                                          Idempotent + batched (200/tick).
 *
 *   - POST /v1/retention/flag-inactive     Weekly Mon 5am Bucharest. Marks
 *                                          users >=23 months inactive so
 *                                          the warning-email pipeline can
 *                                          pick them up. Returns the list
 *                                          of (user_id, email) flagged.
 *                                          Currently logs them for the
 *                                          mailer TODO; no email sent yet.
 *
 *   - POST /v1/retention/purge-inactive    Weekly Mon 6am Bucharest. Calls
 *                                          supabaseAdmin.auth.admin.deleteUser
 *                                          for users flagged >=30 days ago
 *                                          AND still inactive. Cascade FKs
 *                                          (item 1 migration) handle the rest.
 *
 * Cloud Scheduler config: see docs/ops/retention-runbook.md.
 */

const verifyCronAuth = (request: FastifyRequest): void => {
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
};

const acceptedAtSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['runAt'],
  properties: {
    runAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const buildRetentionRoutes = (
  _dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // ── POST /retention/truncate-gps ──────────────────────────────────────
    app.post<{ Reply: { runAt: string; truncatedCount: number; batchComplete: boolean } | ErrorResponse }>(
      '/retention/truncate-gps',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['runAt', 'truncatedCount', 'batchComplete'],
              properties: {
                runAt: { type: 'string', format: 'date-time' },
                truncatedCount: { type: 'integer' },
                batchComplete: { type: 'boolean' },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        verifyCronAuth(request);
        const db = ensureSupabase();

        const { data, error } = await db.rpc('truncate_old_gps_trails');

        if (error) {
          request.log.error({ err: error }, 'truncate_old_gps_trails rpc failed');
          throw new HttpError('Truncate failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        // RPC returns a single-row table { truncated_count, batch_complete }.
        const row = Array.isArray(data) ? data[0] : data;
        const truncatedCount = Number(row?.truncated_count ?? 0);
        const batchComplete = Boolean(row?.batch_complete ?? true);

        request.log.info(
          { event: 'retention_truncate_gps', truncatedCount, batchComplete },
          'gps-trail truncation cron completed',
        );

        return {
          runAt: new Date().toISOString(),
          truncatedCount,
          batchComplete,
        };
      },
    );

    // ── POST /retention/flag-inactive ─────────────────────────────────────
    app.post<{
      Reply:
        | { runAt: string; flaggedCount: number; flaggedUserIds: string[] }
        | ErrorResponse;
    }>(
      '/retention/flag-inactive',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['runAt', 'flaggedCount', 'flaggedUserIds'],
              properties: {
                runAt: { type: 'string', format: 'date-time' },
                flaggedCount: { type: 'integer' },
                // Only ids are surfaced in the response body; emails are
                // logged for the mailer pipeline but never sent over the
                // network in cron output.
                flaggedUserIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        verifyCronAuth(request);
        const db = ensureSupabase();

        const { data, error } = await db.rpc('flag_inactive_users');

        if (error) {
          request.log.error({ err: error }, 'flag_inactive_users rpc failed');
          throw new HttpError('Flag failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const rows = (data ?? []) as Array<{ user_id: string; email: string }>;
        const flaggedUserIds = rows.map((r) => r.user_id);

        // Log each flagged email for the mailer pipeline. NOT sending email
        // in this PR — the email mailer (SendGrid / Mailgun / Supabase Edge
        // Function) is a separate config decision tracked in the runbook.
        // Until that lands, Victor can grep these lines from the API logs
        // and send emails manually.
        for (const row of rows) {
          request.log.info(
            { event: 'retention_inactive_warning_pending', userId: row.user_id, email: row.email },
            'user flagged for inactive-warning email (mailer TODO)',
          );
        }

        return {
          runAt: new Date().toISOString(),
          flaggedCount: rows.length,
          flaggedUserIds,
        };
      },
    );

    // ── POST /retention/purge-inactive ────────────────────────────────────
    app.post<{
      Reply:
        | { runAt: string; purgedCount: number; failedCount: number; purgedUserIds: string[] }
        | ErrorResponse;
    }>(
      '/retention/purge-inactive',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['runAt', 'purgedCount', 'failedCount', 'purgedUserIds'],
              properties: {
                runAt: { type: 'string', format: 'date-time' },
                purgedCount: { type: 'integer' },
                failedCount: { type: 'integer' },
                purgedUserIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        verifyCronAuth(request);
        const db = ensureSupabase();

        const { data, error } = await db.rpc('select_purgeable_inactive_users');

        if (error) {
          request.log.error({ err: error }, 'select_purgeable_inactive_users rpc failed');
          throw new HttpError('Purge selection failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const candidates =
          (data ?? []) as Array<{
            user_id: string;
            email: string;
            warned_at: string;
            latest_activity: string;
          }>;

        const purgedUserIds: string[] = [];
        let failedCount = 0;

        // Iterate sequentially. Supabase auth.admin.deleteUser is rate-limited;
        // batching in parallel hits 429s. The function returns LIMIT 100, so
        // worst case a tick processes 100 deletions over ~30s. Cron tick is
        // weekly so backlog has plenty of time to drain.
        for (const candidate of candidates) {
          const { error: deleteError } = await db.auth.admin.deleteUser(candidate.user_id);
          if (deleteError) {
            failedCount += 1;
            request.log.error(
              {
                event: 'retention_purge_failed',
                userId: candidate.user_id,
                err: deleteError,
              },
              'inactive user purge failed (will retry next tick)',
            );
            continue;
          }
          purgedUserIds.push(candidate.user_id);
          request.log.info(
            {
              event: 'retention_purge_succeeded',
              userId: candidate.user_id,
              warnedAt: candidate.warned_at,
              latestActivity: candidate.latest_activity,
            },
            'inactive user purged',
          );
        }

        return {
          runAt: new Date().toISOString(),
          purgedCount: purgedUserIds.length,
          failedCount,
          purgedUserIds,
        };
      },
    );

  };

  return routes;
};
