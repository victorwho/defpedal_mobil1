import type {
  CityHeartbeat,
  CommunityLifetimeTotals,
  CommunityPulseCounts,
  CommunityScope,
  CommunityStats,
  DailyActivity,
  ErrorResponse,
  FeedItem,
  FeedResponse,
  HazardType,
  WeeklyActivity,
} from '@defensivepedal/core';
import {
  calculateCo2SavedKg,
  COMMUNITY_MIN_FEED_ITEMS,
  COMMUNITY_REGION_RADIUS_KM,
  kmToMeters,
  pickCommunityChartMode,
  pickCommunityPulseRung,
} from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import type { MobileApiDependencies } from '../lib/dependencies';
import {
  communityStatsQuerystringSchema,
  communityStatsResponseSchema,
  errorResponseSchema,
  feedQuerystringSchema,
  feedResponseSchema,
  heartbeatQuerystringSchema,
  heartbeatResponseSchema,
  type CommunityStatsQuerystring,
  type FeedQuerystring,
  type HeartbeatQuerystring,
} from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { ensureSupabase, mapFeedRow, requireUser, type ChampionLookup } from './feed-helpers';
import { buildFeedCommentRoutes } from './feed-comments';
import { buildFeedProfileRoutes } from './feed-profile';
import { buildFeedReactionRoutes } from './feed-reactions';
import { buildFeedShareRoutes } from './feed-share';

const DEFAULT_FEED_LIMIT = 20;
const DEFAULT_RADIUS_KM = 15;

/**
 * Radius that covers the whole planet (half Earth's circumference) — the
 * 'community' rung of the legacy feed ladder without touching the RPC
 * signature. ST_DWithin with this bound matches every row.
 */
const GLOBAL_RADIUS_METERS = 20_037_508;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const buildFeedRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {

    // GET /feed — nearby feed
    app.get<{ Querystring: FeedQuerystring; Reply: FeedResponse | ErrorResponse }>(
      '/feed',
      {
        schema: {
          querystring: feedQuerystringSchema,
          response: {
            200: feedResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const user = await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, cursor, limit: rawLimit, radiusKm: rawRadius, scope: requestedScope } = request.query;
        const limit = rawLimit ?? DEFAULT_FEED_LIMIT;
        const nearbyRadiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;

        const scopeRadiusMeters: Record<CommunityScope, number> = {
          nearby: nearbyRadiusMeters,
          region: kmToMeters(COMMUNITY_REGION_RADIUS_KM),
          community: GLOBAL_RADIUS_METERS,
        };

        const fetchPage = async (scope: CommunityScope): Promise<Record<string, unknown>[]> => {
          const { data, error } = await db.rpc('get_nearby_feed', {
            user_lat: lat,
            user_lon: lon,
            radius_meters: scopeRadiusMeters[scope],
            feed_limit: limit,
            cursor_shared_at: cursor ?? null,
            requesting_user_id: user.id,
          });
          if (error) {
            request.log.error({ event: 'feed_query_error', error: error.message }, 'feed query failed');
            throw new HttpError('Feed query failed.', {
              statusCode: 502,
              code: 'UPSTREAM_ERROR',
              details: [error.message],
            });
          }
          return (data ?? []) as Record<string, unknown>[];
        };

        // Radius ladder (Change 2): nearby (15 km) → region (100 km) →
        // community (no spatial bound). We widen only when the current rung
        // yields fewer than COMMUNITY_MIN_FEED_ITEMS real items. Cursored
        // pages echo the first page's `scope` back via the querystring so
        // one pagination run stays within a single consistent scope.
        let scopeUsed: CommunityScope;
        let rows: Record<string, unknown>[];
        if (requestedScope) {
          scopeUsed = requestedScope;
          rows = await fetchPage(requestedScope);
        } else {
          scopeUsed = 'nearby';
          rows = await fetchPage('nearby');
          if (rows.length < COMMUNITY_MIN_FEED_ITEMS) {
            scopeUsed = 'region';
            rows = await fetchPage('region');
          }
          if (scopeUsed === 'region' && rows.length < COMMUNITY_MIN_FEED_ITEMS) {
            scopeUsed = 'community';
            rows = await fetchPage('community');
          }
        }

        // Build champion lookup: user_id -> metric for latest weekly champions
        let championLookup: ChampionLookup = new Map();
        try {
          const userIds = [...new Set(rows.map((r) => r.user_id as string))];
          if (userIds.length > 0) {
            // Get the latest weekly snapshot period_end
            const { data: latestSnap } = await db
              .from('leaderboard_snapshots')
              .select('period_end')
              .eq('period_type', 'weekly')
              .eq('rank', 1)
              .order('period_end', { ascending: false })
              .limit(1);

            if (latestSnap && latestSnap.length > 0) {
              const latestEnd = (latestSnap[0] as Record<string, unknown>).period_end as string;
              const { data: champions } = await db
                .from('leaderboard_snapshots')
                .select('user_id, metric')
                .eq('period_type', 'weekly')
                .eq('rank', 1)
                .eq('period_end', latestEnd)
                .in('user_id', userIds);

              if (champions && champions.length > 0) {
                const lookup = new Map<string, string>();
                for (const c of champions as Array<{ user_id: string; metric: string }>) {
                  lookup.set(c.user_id, c.metric);
                }
                championLookup = lookup;
              }
            }
          }
        } catch {
          // Champion lookup is optional — don't fail the feed
        }

        const items: FeedItem[] = rows.map((row) => mapFeedRow(row, user.id, championLookup));
        const nextCursor = items.length === limit ? (items[items.length - 1]?.sharedAt ?? null) : null;

        return { items, cursor: nextCursor, scopeUsed };
      },
    );

    // GET /community/stats — aggregate stats for nearby community
    app.get<{ Querystring: CommunityStatsQuerystring; Reply: CommunityStats | ErrorResponse }>(
      '/community/stats',
      {
        schema: {
          querystring: communityStatsQuerystringSchema,
          response: {
            200: communityStatsResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, radiusKm: rawRadius } = request.query;
        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;

        const { data, error } = await db.rpc('get_community_stats', {
          user_lat: lat,
          user_lon: lon,
          radius_meters: radiusMeters,
        });

        if (error) {
          request.log.error({ event: 'community_stats_error', error: error.message }, 'community stats query failed');
          throw new HttpError('Community stats query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        const row = Array.isArray(data) ? data[0] : data;
        const totalDistanceMeters = Number(row?.total_distance_meters ?? 0);

        return {
          localityName: null,
          totalTrips: Number(row?.total_trips ?? 0),
          totalDistanceMeters,
          totalDurationSeconds: Number(row?.total_duration_seconds ?? 0),
          totalCo2SavedKg: calculateCo2SavedKg(totalDistanceMeters),
          uniqueRiders: Number(row?.unique_riders ?? 0),
        };
      },
    );

    // GET /community/heartbeat — city pulse dashboard
    app.get<{ Querystring: HeartbeatQuerystring; Reply: CityHeartbeat | ErrorResponse }>(
      '/community/heartbeat',
      {
        schema: {
          querystring: heartbeatQuerystringSchema,
          response: {
            200: heartbeatResponseSchema,
            401: errorResponseSchema,
            502: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        await requireUser(request, dependencies);
        const db = ensureSupabase();

        const { lat, lon, radiusKm: rawRadius, days: rawDays } = request.query;
        const radiusMeters = (rawRadius ?? DEFAULT_RADIUS_KM) * 1000;
        const days = rawDays ?? 7;
        const regionRadiusMeters = kmToMeters(COMMUNITY_REGION_RADIUS_KM);

        // ── Community-visibility ladder (Changes 1+2) ──────────────────────
        // One cheap counts round-trip decides the (window, scope) rung; the
        // exact ladder order lives in core's pickCommunityPulseRung (window
        // widens first, then radius). A counts failure degrades to the
        // legacy (today, nearby) view rather than failing the screen.
        let pulseCounts: CommunityPulseCounts | null = null;
        try {
          const { data: countsData, error: countsError } = await db.rpc('get_community_pulse_counts', {
            user_lat: lat,
            user_lon: lon,
            nearby_radius_meters: radiusMeters,
            region_radius_meters: regionRadiusMeters,
          });
          if (!countsError && countsData) {
            pulseCounts = (typeof countsData === 'string'
              ? JSON.parse(countsData)
              : countsData) as CommunityPulseCounts;
          } else if (countsError) {
            request.log.warn({ event: 'pulse_counts_error', error: countsError.message }, 'pulse counts query failed');
          }
        } catch {
          pulseCounts = null;
        }

        const rung = pulseCounts
          ? pickCommunityPulseRung(pulseCounts)
          : { window: 'today' as const, scope: 'nearby' as const };
        const pulseRadiusMeters =
          rung.scope === 'nearby' ? radiusMeters
            : rung.scope === 'region' ? regionRadiusMeters
              : null;
        const weekRidesAtScope = pulseCounts?.week?.[rung.scope] ?? 0;
        const chartMode = pulseCounts ? pickCommunityChartMode(weekRidesAtScope) : 'daily';

        const { data, error } = await db.rpc('get_city_heartbeat', {
          user_lat: lat,
          user_lon: lon,
          radius_meters: radiusMeters,
          p_days: days,
          p_pulse_window: rung.window,
          p_pulse_radius_meters: pulseRadiusMeters,
        });

        if (error) {
          request.log.error({ event: 'heartbeat_error', error: error.message }, 'heartbeat query failed');
          throw new HttpError('Heartbeat query failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [error.message],
          });
        }

        let result: Record<string, unknown>;
        try {
          result = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>;
        } catch {
          throw new HttpError('Heartbeat data parsing failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: ['Invalid RPC response format.'],
          });
        }
        const today = result.today as Record<string, unknown>;
        const totals = result.totals as Record<string, unknown>;
        const pulse = result.pulse as Record<string, unknown> | undefined;
        const communityTotals = result.communityTotals as Record<string, unknown> | undefined;

        const mapDailyRows = (rows: Record<string, unknown>[] | undefined): DailyActivity[] =>
          (rows ?? []).map((d) => ({
            day: String(d.day),
            rides: Number(d.rides ?? 0),
            distanceMeters: Number(d.distanceMeters ?? 0),
            co2SavedKg: Number(d.co2SavedKg ?? 0),
            communitySeconds: Number(d.communitySeconds ?? 0),
          }));

        const mapWeeklyRows = (rows: Record<string, unknown>[] | undefined): WeeklyActivity[] =>
          (rows ?? []).map((w) => ({
            weekStart: String(w.weekStart),
            rides: Number(w.rides ?? 0),
            distanceMeters: Number(w.distanceMeters ?? 0),
            co2SavedKg: Number(w.co2SavedKg ?? 0),
            communitySeconds: Number(w.communitySeconds ?? 0),
          }));

        const mapLifetimeTotals = (row: Record<string, unknown> | undefined): CommunityLifetimeTotals => ({
          rides: Number(row?.rides ?? 0),
          distanceMeters: Number(row?.distanceMeters ?? 0),
          durationSeconds: Number(row?.durationSeconds ?? 0),
          co2SavedKg: Number(row?.co2SavedKg ?? 0),
          communitySeconds: Number(row?.communitySeconds ?? 0),
          uniqueRiders: Number(row?.uniqueRiders ?? 0),
        });

        const response: CityHeartbeat = {
          localityName: null,
          today: {
            rides: Number(today?.rides ?? 0),
            distanceMeters: Number(today?.distanceMeters ?? 0),
            co2SavedKg: Number(today?.co2SavedKg ?? 0),
            communitySeconds: Number(today?.communitySeconds ?? 0),
            activeRiders: Number(today?.activeRiders ?? 0),
          },
          daily: mapDailyRows(result.daily as Record<string, unknown>[]),
          totals: {
            rides: Number(totals?.rides ?? 0),
            distanceMeters: Number(totals?.distanceMeters ?? 0),
            durationSeconds: Number(totals?.durationSeconds ?? 0),
            co2SavedKg: Number(totals?.co2SavedKg ?? 0),
            communitySeconds: Number(totals?.communitySeconds ?? 0),
            uniqueRiders: Number(totals?.uniqueRiders ?? 0),
          },
          // ── Ladder additions (rendered with honest window/scope labels) ──
          pulse: {
            rides: Number(pulse?.rides ?? today?.rides ?? 0),
            distanceMeters: Number(pulse?.distanceMeters ?? today?.distanceMeters ?? 0),
            co2SavedKg: Number(pulse?.co2SavedKg ?? today?.co2SavedKg ?? 0),
            communitySeconds: Number(pulse?.communitySeconds ?? today?.communitySeconds ?? 0),
            activeRiders: Number(pulse?.activeRiders ?? today?.activeRiders ?? 0),
          },
          windowUsed: rung.window,
          scopeUsed: rung.scope,
          chartMode,
          chartDaily: mapDailyRows(result.chartDaily as Record<string, unknown>[]),
          chartWeekly: mapWeeklyRows(result.chartWeekly as Record<string, unknown>[]),
          communityTotals: mapLifetimeTotals(communityTotals),
          hazardHotspots: ((result.hazardHotspots as Record<string, unknown>[]) ?? []).map((h) => ({
            hazardType: (String(h.hazardType ?? 'other')) as HazardType,
            count: Number(h.count ?? 0),
            lat: Number(h.lat ?? 0),
            lon: Number(h.lon ?? 0),
          })),
          topContributors: ((result.topContributors as Record<string, unknown>[]) ?? []).map((c) => ({
            displayName: String(c.displayName ?? 'Rider'),
            avatarUrl: (c.avatarUrl as string) ?? null,
            rideCount: Number(c.rideCount ?? 0),
            distanceKm: Number(c.distanceKm ?? 0),
          })),
        };

        return response;
      },
    );

    // Register sub-plugins for remaining feed endpoints
    void app.register(buildFeedShareRoutes(dependencies));
    void app.register(buildFeedReactionRoutes(dependencies));
    void app.register(buildFeedCommentRoutes(dependencies));
    void app.register(buildFeedProfileRoutes(dependencies));

  };

  return routes;
};
