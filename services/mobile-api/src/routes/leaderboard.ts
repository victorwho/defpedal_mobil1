import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { requireFullUser } from '../lib/auth';
import { buildRateLimitIdentity } from '../lib/rateLimit';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  errorResponseSchema,
  leaderboardQuerystringSchema,
  leaderboardResponseSchema,
  settleResponseSchema,
  type LeaderboardEntry,
  type LeaderboardQuerystring,
  type LeaderboardResponse,
  type SettleResponse,
} from '../lib/leaderboardSchemas';

const DEFAULT_RADIUS_KM = 15;

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

/** Require a full OAuth user (rejects anonymous Supabase sessions). */
const requireOAuthUser = (
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

/** Map a raw RPC row to a LeaderboardEntry. */
const mapLeaderboardRow = (row: Record<string, unknown>): LeaderboardEntry => ({
  rank: Number(row.rank ?? 0),
  userId: row.user_id as string,
  displayName: (row.display_name as string) ?? 'Rider',
  avatarUrl: (row.avatar_url as string) ?? null,
  riderTier: (row.rider_tier as string) ?? 'kickstand',
  metricValue: Number(row.metric_value ?? 0),
  rankDelta: row.rank_delta != null ? Number(row.rank_delta) : null,
  isChampion: Boolean(row.is_champion),
  isRequestingUser: Boolean(row.is_requesting_user),
});

/**
 * Compute period start/end strings for the given period type.
 * Uses the same 4AM UTC cutoff as the streak engine.
 */
const computePeriodBounds = (period: string): { periodStart: string; periodEnd: string } => {
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const utcDay = now.getUTCDay(); // 0=Sun

  if (period === 'week') {
    // Monday = day 1 in ISO weeks; getUTCDay() has 0=Sun
    const daysSinceMonday = (utcDay + 6) % 7;
    const mondayDate = new Date(Date.UTC(utcYear, utcMonth, utcDate - daysSinceMonday, 4, 0, 0));
    const sundayDate = new Date(Date.UTC(utcYear, utcMonth, utcDate - daysSinceMonday + 6, 23, 59, 59));
    return {
      periodStart: mondayDate.toISOString(),
      periodEnd: sundayDate.toISOString(),
    };
  }

  if (period === 'month') {
    const firstDay = new Date(Date.UTC(utcYear, utcMonth, 1, 4, 0, 0));
    const lastDay = new Date(Date.UTC(utcYear, utcMonth + 1, 0, 23, 59, 59));
    return {
      periodStart: firstDay.toISOString(),
      periodEnd: lastDay.toISOString(),
    };
  }

  // 'all'
  return {
    periodStart: '2020-01-01T00:00:00.000Z',
    periodEnd: now.toISOString(),
  };
};

// XP awards by rank position for settle
const WEEKLY_XP: Record<string, number> = {
  '1': 50,
  '2': 30,
  '3': 30,
  '4-10': 15,
  '11-50': 5,
};

const MONTHLY_XP: Record<string, number> = {
  '1': 150,
  '2': 100,
  '3': 100,
  '4-10': 50,
  '11-50': 20,
};

const getXpForRank = (rank: number, isMonthly: boolean): number => {
  const table = isMonthly ? MONTHLY_XP : WEEKLY_XP;
  if (rank === 1) return table['1'];
  if (rank === 2) return table['2'];
  if (rank === 3) return table['3'];
  if (rank >= 4 && rank <= 10) return table['4-10'];
  if (rank >= 11 && rank <= 50) return table['11-50'];
  return 0;
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const buildLeaderboardRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // GET /leaderboard — neighborhood safety leaderboard
    app.get<{ Querystring: LeaderboardQuerystring; Reply: LeaderboardResponse | ErrorResponse }>(
      '/leaderboard',
      {
        schema: {
          querystring: leaderboardQuerystringSchema,
          response: {
            200: leaderboardResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const user = await requireOAuthUser(request, dependencies);
        await applyRateLimit(request, reply, dependencies, 'routePreview', { userId: user.id });

        const db = ensureSupabase();

        const {
          lat,
          lon,
          radiusKm: rawRadius,
          metric: rawMetric,
          period: rawPeriod,
        } = request.query;

        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;
        const metric = rawMetric ?? 'co2';
        const period = rawPeriod ?? 'week';

        const { data, error } = await db.rpc('get_neighborhood_leaderboard', {
          p_user_lat: lat,
          p_user_lon: lon,
          p_radius_meters: radiusMeters,
          p_metric: metric,
          p_period: period,
          p_requesting_user_id: user.id,
        });

        if (error) {
          request.log.error(
            { event: 'leaderboard_query_error', error: error.message },
            'leaderboard query failed',
          );
          throw new HttpError('Leaderboard query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        const entries = rows.map(mapLeaderboardRow);

        // Separate the requesting user's entry if it's outside top 50
        const userEntry = entries.find((e) => e.isRequestingUser) ?? null;
        const topEntries = entries.filter((e) => !e.isRequestingUser || e.rank <= 50);

        const bounds = computePeriodBounds(period);

        return {
          entries: topEntries,
          userRank: userEntry,
          periodStart: bounds.periodStart,
          periodEnd: bounds.periodEnd,
        };
      },
    );

    // POST /leaderboard/settle — cron endpoint to snapshot and award XP
    app.post<{ Reply: SettleResponse | ErrorResponse }>(
      '/leaderboard/settle',
      {
        schema: {
          response: {
            200: settleResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        // Authenticate via CRON_SECRET header (same pattern as cron endpoints in v1.ts)
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

        // Determine period boundaries for the just-completed period
        const now = new Date();
        const utcDay = now.getUTCDay();
        const utcYear = now.getUTCFullYear();
        const utcMonth = now.getUTCMonth();
        const utcDate = now.getUTCDate();

        // Weekly settlement: covers Monday 4AM to Sunday 23:59 of the previous week
        const daysSinceMonday = (utcDay + 6) % 7;
        const prevWeekEnd = new Date(Date.UTC(utcYear, utcMonth, utcDate - daysSinceMonday - 1));
        const prevWeekStart = new Date(Date.UTC(
          prevWeekEnd.getUTCFullYear(),
          prevWeekEnd.getUTCMonth(),
          prevWeekEnd.getUTCDate() - 6,
        ));

        // Monthly settlement: covers the previous calendar month
        const prevMonthEnd = new Date(Date.UTC(utcYear, utcMonth, 0)); // last day of prev month
        const prevMonthStart = new Date(Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1));

        const toDateStr = (d: Date) =>
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

        let totalSnapshots = 0;
        let totalXp = 0;

        const metrics: Array<'co2' | 'hazards'> = ['co2', 'hazards'];
        const periods: Array<{ type: 'weekly' | 'monthly'; start: Date; end: Date }> = [
          { type: 'weekly', start: prevWeekStart, end: prevWeekEnd },
          { type: 'monthly', start: prevMonthStart, end: prevMonthEnd },
        ];

        for (const prd of periods) {
          for (const metric of metrics) {
            const periodStartStr = toDateStr(prd.start);
            const periodEndStr = toDateStr(prd.end);

            // Idempotency: check if snapshot already exists for this period
            const { count: existingCount } = await db
              .from('leaderboard_snapshots')
              .select('id', { count: 'exact', head: true })
              .eq('period_type', prd.type)
              .eq('metric', metric)
              .eq('period_end', periodEndStr);

            if ((existingCount ?? 0) > 0) {
              request.log.info(
                { event: 'leaderboard_settle_skip', periodType: prd.type, metric, periodEnd: periodEndStr },
                'snapshot already exists — skipping',
              );
              continue;
            }

            // Query leaderboard for this period using RPC
            // We use a central point (0,0) with huge radius to get global results
            // since settle doesn't filter by location
            const periodMap: Record<string, string> = { weekly: 'week', monthly: 'month' };
            const { data: lbData, error: lbError } = await db.rpc('get_neighborhood_leaderboard', {
              p_user_lat: 0,
              p_user_lon: 0,
              p_radius_meters: 50_000_000, // global
              p_metric: metric,
              p_period: periodMap[prd.type] ?? 'week',
              p_requesting_user_id: null,
            });

            if (lbError) {
              request.log.error(
                { event: 'leaderboard_settle_query_error', metric, periodType: prd.type, error: lbError.message },
                'settle leaderboard query failed',
              );
              continue;
            }

            const rows = (lbData ?? []) as Record<string, unknown>[];
            if (rows.length === 0) continue;

            const isMonthly = prd.type === 'monthly';

            // Insert snapshots and award XP
            for (const row of rows) {
              const rank = Number(row.rank ?? 0);
              const userId = row.user_id as string;
              const value = Number(row.metric_value ?? 0);
              const xp = getXpForRank(rank, isMonthly);

              // Insert snapshot
              const { error: insertError } = await db
                .from('leaderboard_snapshots')
                .insert({
                  period_type: prd.type,
                  period_start: periodStartStr,
                  period_end: periodEndStr,
                  metric,
                  user_id: userId,
                  rank,
                  value,
                  xp_awarded: xp,
                });

              if (insertError) {
                request.log.warn(
                  { event: 'leaderboard_snapshot_insert_error', userId, error: insertError.message },
                  'failed to insert snapshot',
                );
                continue;
              }

              totalSnapshots++;

              // Award XP via existing RPC (service_role bypasses the auth.uid() check)
              if (xp > 0) {
                const action = `leaderboard_${prd.type}_${metric}`;
                const { error: xpError } = await db.rpc('award_xp', {
                  p_user_id: userId,
                  p_action: action,
                  p_base_xp: xp,
                  p_multiplier: 1.0,
                  p_source_id: `${prd.type}-${metric}-${periodEndStr}`,
                });

                if (xpError) {
                  request.log.warn(
                    { event: 'leaderboard_xp_award_error', userId, error: xpError.message },
                    'failed to award leaderboard XP',
                  );
                } else {
                  totalXp += xp;
                }
              }

              // Award champion badges for rank #1
              if (rank === 1) {
                const badgeKey = `${metric}_${prd.type}_champion`;
                const { error: badgeError } = await db
                  .from('user_badges')
                  .insert({
                    user_id: userId,
                    badge_key: badgeKey,
                    earned_at: new Date().toISOString(),
                  });

                // ON CONFLICT is handled at DB level; ignore duplicate errors
                if (badgeError && !badgeError.message.includes('duplicate')) {
                  request.log.warn(
                    { event: 'leaderboard_badge_error', userId, badgeKey, error: badgeError.message },
                    'failed to award champion badge',
                  );
                }

                // Check repeat champion badges (5 weekly CO2 wins, 10 weekly hazard wins)
                const { error: repeatError } = await db.rpc('check_champion_repeat_badges', {
                  p_user_id: userId,
                });

                if (repeatError) {
                  request.log.warn(
                    { event: 'leaderboard_repeat_badge_error', userId, error: repeatError.message },
                    'failed to check repeat champion badges',
                  );
                }
              }
            }
          }
        }

        request.log.info(
          { event: 'leaderboard_settle_complete', totalSnapshots, totalXp },
          'leaderboard settlement complete',
        );

        return { ok: true, snapshotsCreated: totalSnapshots, xpAwarded: totalXp };
      },
    );

  };

  return routes;
};
