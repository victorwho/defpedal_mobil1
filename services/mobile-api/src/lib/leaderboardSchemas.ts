import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const leaderboardQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    radiusKm: { type: 'number', minimum: 1, maximum: 100 },
    metric: { type: 'string', enum: ['co2', 'hazards'] },
    period: { type: 'string', enum: ['week', 'month', 'all'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const leaderboardEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'rank', 'userId', 'displayName', 'avatarUrl', 'riderTier',
    'metricValue', 'rankDelta', 'isChampion', 'isRequestingUser',
  ],
  properties: {
    rank: { type: 'integer' },
    userId: { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    riderTier: { type: 'string' },
    metricValue: { type: 'number' },
    rankDelta: { type: ['integer', 'null'] },
    isChampion: { type: 'boolean' },
    isRequestingUser: { type: 'boolean' },
  },
} as const;

export const leaderboardResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['entries', 'userRank', 'periodStart', 'periodEnd'],
  properties: {
    entries: { type: 'array', items: leaderboardEntrySchema },
    userRank: {
      oneOf: [
        leaderboardEntrySchema,
        { type: 'null' },
      ],
    },
    periodStart: { type: 'string' },
    periodEnd: { type: 'string' },
  },
} as const;

export const settleResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'snapshotsCreated', 'xpAwarded'],
  properties: {
    ok: { type: 'boolean' },
    snapshotsCreated: { type: 'integer' },
    xpAwarded: { type: 'integer' },
  },
} as const;

// ---------------------------------------------------------------------------
// TypeScript types for Fastify generics
// ---------------------------------------------------------------------------

export type LeaderboardQuerystring = {
  lat: number;
  lon: number;
  radiusKm?: number;
  metric?: 'co2' | 'hazards';
  period?: 'week' | 'month' | 'all';
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  riderTier: string;
  metricValue: number;
  rankDelta: number | null;
  isChampion: boolean;
  isRequestingUser: boolean;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  userRank: LeaderboardEntry | null;
  periodStart: string;
  periodEnd: string;
};

export type SettleResponse = {
  ok: boolean;
  snapshotsCreated: number;
  xpAwarded: number;
};
