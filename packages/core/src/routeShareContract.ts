/**
 * Route-share contract schemas.
 *
 * Discriminated union on `source` — only `'planned'` is implemented in
 * slice 1. Slice 5 extends with `'saved'` and `'past_ride'` variants; the
 * discriminator is in place from day one so callers already switch on it.
 *
 * The contract is defined in zod; TS types are inferred via `z.infer`.
 */

import { z } from 'zod';
import { SHARE_CODE_REGEX } from './shareCodeGenerator';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const shareCodeSchema = z
  .string()
  .regex(SHARE_CODE_REGEX, 'Share code must be 8 characters of base62');

const coordinateSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
});

const riskSegmentSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  riskCategory: z.enum(['very_safe', 'safe', 'moderate', 'dangerous', 'extreme']),
});

export type RouteShareRiskSegment = z.infer<typeof riskSegmentSchema>;
export type RouteShareRiskCategory = RouteShareRiskSegment['riskCategory'];

const plannedRoutePayloadSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
  geometryPolyline6: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  routingMode: z.enum(['safe', 'fast', 'flat']),
  /** Per-segment risk category for safety-colored rendering. Optional — may be empty for unscored routes. */
  riskSegments: z.array(riskSegmentSchema).default([]),
  /** Aggregate 0-100 safety score. Null when the route wasn't safety-scored. */
  safetyScore: z.number().min(0).max(100).nullable().default(null),
});

// ---------------------------------------------------------------------------
// RouteShareCreate — request body when creating a new share
// ---------------------------------------------------------------------------
//
// Discriminated union on `source`. In slice 1, only `'planned'` is active;
// `'saved'` and `'past_ride'` are stubbed with `z.never()` so any attempt to
// create them in slice 1 is a parse error. Slice 5 replaces the stubs.

export const routeShareCreatePlannedSchema = z.object({
  source: z.literal('planned'),
  route: plannedRoutePayloadSchema,
});

const routeShareCreateSavedStubSchema = z.object({
  source: z.literal('saved'),
  savedRouteId: z.never(),
});

const routeShareCreatePastRideStubSchema = z.object({
  source: z.literal('past_ride'),
  tripId: z.never(),
});

export const routeShareCreateSchema = z.discriminatedUnion('source', [
  routeShareCreatePlannedSchema,
  routeShareCreateSavedStubSchema,
  routeShareCreatePastRideStubSchema,
]);

export type RouteShareCreate = z.infer<typeof routeShareCreateSchema>;
export type RouteShareCreatePlanned = z.infer<
  typeof routeShareCreatePlannedSchema
>;

// ---------------------------------------------------------------------------
// RouteShareRecord — DB row shape returned to the owner
// ---------------------------------------------------------------------------

export const routeShareRecordSchema = z.object({
  id: z.string().uuid(),
  code: shareCodeSchema,
  ownerUserId: z.string().uuid(),
  source: z.enum(['planned', 'saved', 'past_ride']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  viewCount: z.number().int().nonnegative(),
  hideEndpoints: z.boolean(),
});

export type RouteShareRecord = z.infer<typeof routeShareRecordSchema>;

// ---------------------------------------------------------------------------
// RouteSharePublicView — payload served to anonymous /r/:code consumers
// ---------------------------------------------------------------------------

export const routeSharePublicViewSchema = z.object({
  code: shareCodeSchema,
  source: z.enum(['planned', 'saved', 'past_ride']),
  sharerDisplayName: z.string().nullable(),
  /** URL to sharer's avatar image. Null when unset or profile is private. */
  sharerAvatarUrl: z.string().url().nullable().default(null),
  route: plannedRoutePayloadSchema,
  /** True when origin/destination endpoints were trimmed for privacy. */
  endpointsHidden: z.boolean(),
  /** Full route length in meters before any trimming. */
  fullLengthMeters: z.number().nonnegative(),
  /** Accumulated public views. Drives slice 8 first-view push notification. */
  viewCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});

export type RouteSharePublicView = z.infer<typeof routeSharePublicViewSchema>;
