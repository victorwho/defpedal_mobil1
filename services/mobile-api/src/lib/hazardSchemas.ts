import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// POST /v1/hazards/:id/vote
// ---------------------------------------------------------------------------

export const hazardVoteRequestBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['direction'],
  properties: {
    direction: { type: 'string', enum: ['up', 'down'] },
    clientSubmittedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const hazardVoteResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hazardId', 'score', 'confirmCount', 'denyCount', 'userVote', 'expiresAt', 'lastConfirmedAt'],
  properties: {
    hazardId: { type: 'string', format: 'uuid' },
    score: { type: 'integer' },
    confirmCount: { type: 'integer' },
    denyCount: { type: 'integer' },
    userVote: { type: 'string', enum: ['up', 'down'] },
    expiresAt: { type: 'string', format: 'date-time' },
    lastConfirmedAt: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

// ---------------------------------------------------------------------------
// POST /v1/hazards/expire  (cron)
// ---------------------------------------------------------------------------

export const hazardExpireResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['deletedCount', 'purgedCount', 'runAt'],
  properties: {
    deletedCount: { type: 'integer' },  // expires_at < now - 7d
    purgedCount: { type: 'integer' },   // score <= -3 for >= 24h
    runAt: { type: 'string', format: 'date-time' },
  },
} as const;

// ---------------------------------------------------------------------------
// Shared hazard item shape — used by /v1/hazards/nearby and any future
// endpoint that surfaces hazards. Fastify silently strips undeclared fields
// (error-log #22), so every field the handler returns MUST be declared here.
// ---------------------------------------------------------------------------

export const nearbyHazardItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'hazardType',
    'lat',
    'lon',
    'confirmCount',
    'denyCount',
    'score',
    'expiresAt',
    'lastConfirmedAt',
    'createdAt',
    'description',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    hazardType: { type: 'string' },
    lat: { type: 'number' },
    lon: { type: 'number' },
    confirmCount: { type: 'integer' },
    denyCount: { type: 'integer' },
    score: { type: 'integer' },
    userVote: { type: ['string', 'null'], enum: ['up', 'down', null] },
    expiresAt: { type: 'string', format: 'date-time' },
    lastConfirmedAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string' },
    description: { type: ['string', 'null'], maxLength: 280 },
  },
} as const;

export const nearbyHazardsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hazards'],
  properties: {
    hazards: {
      type: 'array',
      items: nearbyHazardItemSchema,
    },
  },
} as const;

export type HazardVoteBody = {
  direction: 'up' | 'down';
  clientSubmittedAt?: string;
};
