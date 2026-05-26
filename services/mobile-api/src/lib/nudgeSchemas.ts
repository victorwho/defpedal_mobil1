/**
 * Fastify JSON schemas for the /v1/nudges/* endpoints.
 *
 * Per error-log #9 + #22: every response field must be declared here
 * exactly, otherwise Fastify silently strips it from the response body.
 */

import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ───────────────────────── POST /v1/nudges/evaluate (cron) ─────────────────────────

/** Empty request body — auth via Bearer CRON_SECRET. */
export const nudgesEvaluateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const nudgesEvaluateResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['evaluated', 'sent', 'suppressed'],
  properties: {
    evaluated: { type: 'integer', minimum: 0 },
    sent: { type: 'integer', minimum: 0 },
    suppressed: { type: 'integer', minimum: 0 },
  },
} as const;

// ───────────────────────── POST /v1/nudges/event (internal) ─────────────────────────

/**
 * P0 event payload. Called internally from the mobile API on ride/hazard
 * save + on milestone crossing. Authorisation = Bearer service-role token
 * (CRON_SECRET is reused — same trust boundary).
 */
export const nudgesEventRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['userId', 'trigger'],
  properties: {
    userId: { type: 'string', format: 'uuid' },
    trigger: {
      type: 'string',
      enum: [
        'post_ride_celebration',
        'post_hazard_thanks',
        'milestone_celebration',
        'streak_lost_apology',
      ],
    },
    context: {
      type: 'object',
      additionalProperties: false,
      properties: {
        riderName: { type: 'string', maxLength: 200 },
        streakCount: { type: 'integer', minimum: 0 },
        milestoneDay: { type: 'integer', minimum: 0 },
        city: { type: 'string', maxLength: 200 },
        badgeLabel: { type: 'string', maxLength: 200 },
        lapsedDays: { type: 'integer', minimum: 0 },
      },
    },
    locale: { type: 'string', enum: ['en', 'ro'] },
  },
} as const;

export const nudgesEventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome'],
  properties: {
    nudgeLogId: { type: ['string', 'null'], format: 'uuid' },
    outcome: { type: 'string', minLength: 1 },
    ticketId: { type: ['string', 'null'] },
  },
} as const;

// ───────────────────────── POST /v1/nudges/telemetry (mobile) ─────────────────────────

/**
 * Mobile reports tap + (best-effort) action completion. The server's 2-h
 * attribution sweep also runs server-side, but the mobile callback gives
 * us the fastest path for tap timestamps and faster funnel observability.
 */
export const nudgesTelemetryRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nudgeLogId', 'event'],
  properties: {
    nudgeLogId: { type: 'string', format: 'uuid' },
    event: { type: 'string', enum: ['tapped', 'action_completed'] },
    occurredAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const nudgesTelemetryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
  },
} as const;

// ───────────────────────── POST /v1/nudges/attribute (cron) ─────────────────────────

/** Empty request body — auth via Bearer CRON_SECRET. */
export const nudgesAttributeRequestSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const nudgesAttributeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scanned', 'attributed'],
  properties: {
    scanned: { type: 'integer', minimum: 0 },
    attributed: { type: 'integer', minimum: 0 },
  },
} as const;

// ───────────────────────── POST /v1/nudges/recompute-pattern (cron) ─────────────────────────

export const nudgesRecomputePatternRequestSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const nudgesRecomputePatternResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['updated'],
  properties: {
    updated: { type: 'integer', minimum: 0 },
  },
} as const;
