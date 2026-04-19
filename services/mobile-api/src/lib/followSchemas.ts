import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export const userIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const followActionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'actionAt'],
  properties: {
    status: { type: 'string', enum: ['accepted', 'pending'] },
    actionAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const unfollowResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['unfollowedAt'],
  properties: {
    unfollowedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const approveDeclineResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['actionAt'],
  properties: {
    actionAt: { type: 'string', format: 'date-time' },
  },
} as const;

const followRequestItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'user', 'requestedAt'],
  properties: {
    id: { type: 'string' },
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'displayName', 'avatarUrl'],
      properties: {
        id: { type: 'string' },
        displayName: { type: 'string' },
        avatarUrl: { type: ['string', 'null'] },
        riderTier: { type: 'string' },
      },
    },
    requestedAt: { type: 'string', format: 'date-time' },
    // Slice 4: optional attribution subtitle. Fastify strips unlisted
    // response fields — must be declared here or the 'Signed up via your
    // shared route' string emitted by /profile/follow-requests won't
    // reach the client.
    context: { type: 'string' },
  },
} as const;

export const followRequestsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requests'],
  properties: {
    requests: { type: 'array', items: followRequestItemSchema },
  },
} as const;

const suggestedUserSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName', 'avatarUrl', 'activityCount', 'mutualFollows'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    riderTier: { type: 'string' },
    activityCount: { type: 'integer' },
    mutualFollows: { type: 'integer' },
  },
} as const;

export const suggestedUsersResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['users'],
  properties: {
    users: { type: 'array', items: suggestedUserSchema },
  },
} as const;

export const suggestedUsersQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    limit: { type: 'integer', minimum: 1, maximum: 20 },
  },
} as const;

// ---------------------------------------------------------------------------
// Body types for Fastify generics
// ---------------------------------------------------------------------------

export type UserIdParams = { id: string };
export type SuggestedUsersQuerystring = {
  lat: number;
  lon: number;
  limit?: number;
};
