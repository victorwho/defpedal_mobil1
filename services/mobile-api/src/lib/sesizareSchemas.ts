/**
 * JSON Schemas for POST /v1/sesizari.
 *
 * Fastify silently strips undeclared response fields (CLAUDE.md gotcha #9 /
 * error-log #22) — every field the handler returns MUST be declared here.
 */
import { SESIZARE_ELIGIBLE_HAZARD_TYPES } from '@defensivepedal/core';

import { errorResponseSchema } from './http';

export { errorResponseSchema };

export const sesizareRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hazardType', 'coordinate'],
  properties: {
    // Optional: a hazard reported minutes ago may still be sitting in the
    // client's offline queue with no server id. See the table header comment
    // in 202608270006_create_sesizari.sql.
    hazardId: { type: 'string', format: 'uuid' },
    hazardType: { type: 'string', enum: [...SESIZARE_ELIGIBLE_HAZARD_TYPES] },
    coordinate: {
      type: 'object',
      additionalProperties: false,
      required: ['lat', 'lon'],
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
      },
    },
    address: { type: 'string', maxLength: 300 },
  },
} as const;

export const sesizareResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'createdAt', 'hazardSesizareCount', 'awardedBadges'],
  properties: {
    id: { type: 'string' },
    createdAt: { type: 'string' },
    hazardSesizareCount: { type: 'integer' },
    // Badge rows from award_sesizare_badges(); shape mirrors the existing
    // badge RPC, so it is passed through rather than re-declared field by
    // field. `additionalProperties: true` is LOAD-BEARING — a bare
    // `{ type: 'object' }` serializes to `{}` and the client silently gets
    // badges with no keys (gotcha #9, caught by sesizari-routes.test.ts).
    awardedBadges: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  },
} as const;

export type SesizareBody = {
  hazardId?: string;
  hazardType: string;
  coordinate: { lat: number; lon: number };
  address?: string;
};
