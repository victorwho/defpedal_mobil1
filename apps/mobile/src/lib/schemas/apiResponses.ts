import { z } from 'zod';

/**
 * Top-level envelope schemas for the four highest-leverage mobile API
 * endpoints (Phase 3c). Each schema validates ONLY the outer shape — the
 * `items` arrays carry `z.unknown()` so we don't bind ourselves to every
 * inner variant in `@defensivepedal/core`. That keeps the schemas cheap to
 * maintain as the inner types evolve, while still catching "items is
 * missing / renamed / wrong type" — the class of bug that would crash list
 * rendering or `for (const item of items)` destructures.
 *
 * `.passthrough()` lets the server add new fields without breaking
 * validation, which matters because schema drift is one-way: clients lag
 * the server, not the other way around.
 */

/** /v1/feed — legacy community feed (see core: `FeedResponse`) */
export const FeedResponseSchema = z
  .object({
    items: z.array(z.unknown()),
    cursor: z.string().nullable(),
  })
  .passthrough();

/** /v1/v2/feed — unified social activity feed (see core: `ActivityFeedResponse`) */
export const ActivityFeedResponseSchema = z
  .object({
    items: z.array(z.unknown()),
    cursor: z.string().nullable(),
  })
  .passthrough();

/** /v1/leaderboard — neighborhood safety leaderboard (see core: `LeaderboardResponse`) */
export const LeaderboardResponseSchema = z
  .object({
    entries: z.array(z.unknown()),
    userRank: z.unknown().nullable(),
    periodStart: z.string(),
    periodEnd: z.string(),
  })
  .passthrough();

/** /v1/tiers — rider tier ladder + current XP (see core: `TiersResponse`) */
export const TiersResponseSchema = z
  .object({
    tiers: z.array(z.unknown()),
    totalXp: z.number(),
    riderTier: z.string(),
    recentXp: z.array(z.unknown()),
  })
  .passthrough();
