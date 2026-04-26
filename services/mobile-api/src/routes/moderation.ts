import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { requireFullUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { checkContentAgainstFilter } from '../lib/moderationFilter';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import { ensureSupabase } from './feed-helpers';

/**
 * UGC moderation routes — compliance plan item 7.
 *
 * Endpoints:
 *   - POST   /v1/reports                    Report a comment / hazard / share / profile.
 *   - POST   /v1/users/:id/block            Block a user.
 *   - DELETE /v1/users/:id/block            Unblock a user.
 *   - GET    /v1/users/blocked              List blocked users (with profile metadata).
 *
 * All require requireFullUser (anonymous sessions cannot moderate or block).
 * Reports + blocks have dedicated rate-limit buckets so a malicious user
 * can't flood the moderation queue.
 */

const TARGET_TYPES = ['comment', 'hazard', 'trip_share', 'profile'] as const;
const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'illegal',
  'other',
] as const;

type ReportRequestBody = {
  targetType: (typeof TARGET_TYPES)[number];
  targetId: string;
  reason: (typeof REPORT_REASONS)[number];
  details?: string;
};

type UserIdParams = { id: string };

type BlockedUserSummary = {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  blockedAt: string;
};

const acceptedAtSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['acceptedAt'],
  properties: { acceptedAt: { type: 'string', format: 'date-time' } },
} as const;

export const buildModerationRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // ── POST /reports ────────────────────────────────────────────────────
    app.post<{ Body: ReportRequestBody; Reply: { acceptedAt: string } | ErrorResponse }>(
      '/reports',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['targetType', 'targetId', 'reason'],
            properties: {
              targetType: { type: 'string', enum: [...TARGET_TYPES] },
              targetId: { type: 'string', format: 'uuid' },
              reason: { type: 'string', enum: [...REPORT_REASONS] },
              details: { type: 'string', maxLength: 500 },
            },
          },
          response: {
            200: acceptedAtSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies.authenticateUser);

        const rl = await dependencies.rateLimiter.consume({
          bucket: 'report',
          key: buildRateLimitIdentity({ userId: user.id }),
          limit: dependencies.rateLimitPolicies.report.limit,
          windowMs: dependencies.rateLimitPolicies.report.windowMs,
        });
        reply.header('x-ratelimit-limit', rl.limit);
        reply.header('x-ratelimit-remaining', rl.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rl.resetAt / 1000));
        if (!rl.allowed) {
          throw new HttpError('Rate limit exceeded for reports.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rl.retryAfterMs / 1000))} seconds.`],
          });
        }

        const db = ensureSupabase();
        const { error } = await db.from('content_reports').insert([
          {
            reporter_user_id: user.id,
            target_type: request.body.targetType,
            target_id: request.body.targetId,
            reason: request.body.reason,
            details: request.body.details ?? null,
          },
        ]);

        if (error) {
          // Unique-violation = user has already reported this target.
          if (error.code === '23505') {
            throw new HttpError('You have already reported this content.', {
              statusCode: 409,
              code: 'CONFLICT',
            });
          }
          request.log.error({ err: error }, 'content_report insert failed');
          throw new HttpError('Failed to record report.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        request.log.info(
          {
            event: 'moderation_report_received',
            reporter_user_id: user.id,
            target_type: request.body.targetType,
            target_id: request.body.targetId,
            reason: request.body.reason,
          },
          'content report received',
        );

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // ── POST /users/:id/block ─────────────────────────────────────────────
    app.post<{ Params: UserIdParams; Reply: { acceptedAt: string } | ErrorResponse }>(
      '/users/:id/block',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          response: {
            200: acceptedAtSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireFullUser(request, dependencies.authenticateUser);

        if (request.params.id === user.id) {
          throw new HttpError('You cannot block yourself.', {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
          });
        }

        const rl = await dependencies.rateLimiter.consume({
          bucket: 'block',
          key: buildRateLimitIdentity({ userId: user.id }),
          limit: dependencies.rateLimitPolicies.block.limit,
          windowMs: dependencies.rateLimitPolicies.block.windowMs,
        });
        reply.header('x-ratelimit-limit', rl.limit);
        reply.header('x-ratelimit-remaining', rl.remaining);
        reply.header('x-ratelimit-reset', Math.ceil(rl.resetAt / 1000));
        if (!rl.allowed) {
          throw new HttpError('Rate limit exceeded for blocks.', {
            statusCode: 429,
            code: 'RATE_LIMITED',
            details: [`Retry after ${Math.max(1, Math.ceil(rl.retryAfterMs / 1000))} seconds.`],
          });
        }

        const db = ensureSupabase();
        const { error } = await db
          .from('user_blocks')
          .upsert(
            { blocker_user_id: user.id, blocked_user_id: request.params.id },
            { onConflict: 'blocker_user_id,blocked_user_id' },
          );

        if (error) {
          // FK violation = blocked_user_id doesn't exist
          if (error.code === '23503') {
            throw new HttpError('User not found.', { statusCode: 404, code: 'NOT_FOUND' });
          }
          request.log.error({ err: error }, 'user_blocks insert failed');
          throw new HttpError('Failed to block user.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // ── DELETE /users/:id/block ───────────────────────────────────────────
    app.delete<{ Params: UserIdParams; Reply: { acceptedAt: string } | ErrorResponse }>(
      '/users/:id/block',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          response: {
            200: acceptedAtSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireFullUser(request, dependencies.authenticateUser);
        const db = ensureSupabase();

        const { error } = await db
          .from('user_blocks')
          .delete()
          .eq('blocker_user_id', user.id)
          .eq('blocked_user_id', request.params.id);

        if (error) {
          throw new HttpError('Failed to unblock user.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        return { acceptedAt: new Date().toISOString() };
      },
    );

    // ── POST /moderation/auto-filter-sweep ────────────────────────────────
    // Cloud Scheduler hits this with Authorization: Bearer ${CRON_SECRET}.
    // Re-scans recently-posted, still-visible feed_comments against the
    // wordlist. Catches comments that pre-dated a wordlist update.
    //
    // Scope: last 24h of comments where is_hidden=false. Matches → set
    // is_hidden=true and insert a content_reports row tagged auto_filter=true.
    app.post<{ Reply: { scanned: number; flagged: number; runAt: string } | ErrorResponse }>(
      '/moderation/auto-filter-sweep',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['scanned', 'flagged', 'runAt'],
              properties: {
                scanned: { type: 'integer' },
                flagged: { type: 'integer' },
                runAt: { type: 'string', format: 'date-time' },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
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
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await db
          .from('feed_comments')
          .select('id, user_id, body')
          .eq('is_hidden', false)
          .gte('created_at', since);

        if (error) {
          throw new HttpError('Failed to load comments.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const candidates = rows ?? [];
        let flagged = 0;
        for (const row of candidates) {
          const result = checkContentAgainstFilter(row.body as string);
          if (!result.flagged) continue;
          flagged += 1;

          // Hide the comment + insert a content_reports row. Use a self-report
          // (reporter_user_id = comment author's id) so the unique constraint
          // doesn't conflict with a real user's report on the same target.
          await db.from('feed_comments').update({ is_hidden: true }).eq('id', row.id as string);
          await db.from('content_reports').insert([
            {
              reporter_user_id: row.user_id as string,
              target_type: 'comment',
              target_id: row.id as string,
              reason: result.category === 'slur' ? 'hate' : result.category === 'threat' ? 'violence' : 'other',
              details: result.pattern ? `auto-filter sweep: ${result.pattern}` : null,
              auto_filter: true,
            },
          ]);
        }

        request.log.info(
          {
            event: 'moderation_auto_filter_sweep',
            scanned: candidates.length,
            flagged,
          },
          'auto-filter sweep completed',
        );

        return {
          scanned: candidates.length,
          flagged,
          runAt: new Date().toISOString(),
        };
      },
    );

    // ── GET /users/blocked ────────────────────────────────────────────────
    app.get<{ Reply: { blocked: BlockedUserSummary[] } | ErrorResponse }>(
      '/users/blocked',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['blocked'],
              properties: {
                blocked: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['userId', 'displayName', 'username', 'avatarUrl', 'blockedAt'],
                    properties: {
                      userId: { type: 'string', format: 'uuid' },
                      displayName: { type: 'string' },
                      username: { type: ['string', 'null'] },
                      avatarUrl: { type: ['string', 'null'] },
                      blockedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            401: errorResponseSchema,
            403: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireFullUser(request, dependencies.authenticateUser);
        const db = ensureSupabase();

        const { data: blockRows, error } = await db
          .from('user_blocks')
          .select('blocked_user_id, created_at')
          .eq('blocker_user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new HttpError('Failed to load blocked users.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const ids = (blockRows ?? []).map((row) => row.blocked_user_id as string);
        const profileMap = new Map<
          string,
          { display_name: string; username: string | null; avatar_url: string | null }
        >();

        if (ids.length > 0) {
          const { data: profileRows } = await db
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', ids);

          for (const p of profileRows ?? []) {
            profileMap.set(p.id as string, {
              display_name: p.display_name as string,
              username: (p.username as string) ?? null,
              avatar_url: (p.avatar_url as string) ?? null,
            });
          }
        }

        const blocked: BlockedUserSummary[] = (blockRows ?? []).map((row) => {
          const blockedId = row.blocked_user_id as string;
          const profile = profileMap.get(blockedId);
          return {
            userId: blockedId,
            displayName: profile?.username ? `@${profile.username}` : (profile?.display_name ?? 'Rider'),
            username: profile?.username ?? null,
            avatarUrl: profile?.avatar_url ?? null,
            blockedAt: row.created_at as string,
          };
        });

        return { blocked };
      },
    );

  };

  return routes;
};
