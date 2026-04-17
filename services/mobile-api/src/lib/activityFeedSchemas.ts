import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// Activity feed user schema (shared across all card types)
// ---------------------------------------------------------------------------

const activityFeedUserSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName', 'avatarUrl'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    riderTier: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Activity feed item schema (discriminated union via `type`)
// ---------------------------------------------------------------------------

export const activityFeedItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'user', 'type', 'payload', 'createdAt',
    'likeCount', 'loveCount', 'commentCount',
    'likedByMe', 'lovedByMe',
  ],
  properties: {
    id: { type: 'string' },
    user: activityFeedUserSchema,
    type: { type: 'string', enum: ['ride', 'hazard_batch', 'hazard_standalone', 'tier_up', 'badge_unlock'] },
    payload: { type: 'object', additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
    likeCount: { type: 'integer' },
    loveCount: { type: 'integer' },
    commentCount: { type: 'integer' },
    likedByMe: { type: 'boolean' },
    lovedByMe: { type: 'boolean' },
    score: { type: 'number' },
  },
} as const;

export const activityFeedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'cursor'],
  properties: {
    items: { type: 'array', items: activityFeedItemSchema },
    cursor: { type: ['string', 'null'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Activity feed querystring
// ---------------------------------------------------------------------------

export const activityFeedQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    cursorScore: { type: 'number' },
    cursorId: { type: 'string', format: 'uuid' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
} as const;

// ---------------------------------------------------------------------------
// Reaction schemas
// ---------------------------------------------------------------------------

export const reactRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', enum: ['like', 'love'] },
  },
} as const;

export const activityIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export const reactionTypeParamsSchema = {
  type: 'object',
  required: ['id', 'type'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: ['like', 'love'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Body types for Fastify generics
// ---------------------------------------------------------------------------

export type ActivityFeedQuerystring = {
  lat: number;
  lon: number;
  cursorScore?: number;
  cursorId?: string;
  limit?: number;
};

export type ReactBody = {
  type: 'like' | 'love';
};

export type ActivityIdParams = {
  id: string;
};

export type ReactionTypeParams = {
  id: string;
  type: 'like' | 'love';
};
