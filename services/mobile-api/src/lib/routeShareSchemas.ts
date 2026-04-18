/**
 * Fastify JSON Schema + TypeScript types for the route-share API.
 *
 * Every field on the wire is declared here. Fastify strips undeclared
 * response fields silently (error-log #9), so adding a field to a handler
 * return value MUST be mirrored here or it disappears.
 */

import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const coordinateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

const riskSegmentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['startIndex', 'endIndex', 'riskCategory'],
  properties: {
    startIndex: { type: 'integer', minimum: 0 },
    endIndex: { type: 'integer', minimum: 1 },
    riskCategory: {
      type: 'string',
      enum: ['very_safe', 'safe', 'moderate', 'dangerous', 'extreme'],
    },
  },
} as const;

// Request-side: `riskSegments` + `safetyScore` are optional on the wire —
// Fastify JSON Schema can't default-fill like zod, so the handler normalizes
// undefined → [] / null before storing. Mirrors core's `.default([])` /
// `.default(null)` semantics.
const plannedRoutePayloadRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'origin',
    'destination',
    'geometryPolyline6',
    'distanceMeters',
    'durationSeconds',
    'routingMode',
  ],
  properties: {
    origin: coordinateSchema,
    destination: coordinateSchema,
    geometryPolyline6: { type: 'string', minLength: 1 },
    distanceMeters: { type: 'number', minimum: 0 },
    durationSeconds: { type: 'number', minimum: 0 },
    routingMode: { type: 'string', enum: ['safe', 'fast', 'flat'] },
    riskSegments: { type: 'array', items: riskSegmentSchema },
    safetyScore: { type: ['number', 'null'], minimum: 0, maximum: 100 },
  },
} as const;

// Response-side: every field required so Fastify doesn't silently drop them
// from the wire (error-log #9). The service backfills defaults for legacy
// rows that predate the extended contract.
const plannedRoutePayloadResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'origin',
    'destination',
    'geometryPolyline6',
    'distanceMeters',
    'durationSeconds',
    'routingMode',
    'riskSegments',
    'safetyScore',
  ],
  properties: {
    origin: coordinateSchema,
    destination: coordinateSchema,
    geometryPolyline6: { type: 'string', minLength: 1 },
    distanceMeters: { type: 'number', minimum: 0 },
    durationSeconds: { type: 'number', minimum: 0 },
    routingMode: { type: 'string', enum: ['safe', 'fast', 'flat'] },
    riskSegments: { type: 'array', items: riskSegmentSchema },
    safetyScore: { type: ['number', 'null'], minimum: 0, maximum: 100 },
  },
} as const;

// ---------------------------------------------------------------------------
// TypeScript mirrors
// ---------------------------------------------------------------------------

export type RouteShareRiskCategory =
  | 'very_safe'
  | 'safe'
  | 'moderate'
  | 'dangerous'
  | 'extreme';

export type RouteShareRiskSegment = {
  startIndex: number;
  endIndex: number;
  riskCategory: RouteShareRiskCategory;
};

type PlannedRouteRequestPayload = {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  geometryPolyline6: string;
  distanceMeters: number;
  durationSeconds: number;
  routingMode: 'safe' | 'fast' | 'flat';
  riskSegments?: RouteShareRiskSegment[];
  safetyScore?: number | null;
};

type PlannedRouteResponsePayload = Required<
  Omit<PlannedRouteRequestPayload, 'riskSegments' | 'safetyScore'>
> & {
  riskSegments: RouteShareRiskSegment[];
  safetyScore: number | null;
};

// ---------------------------------------------------------------------------
// POST /v1/route-shares — request body
// ---------------------------------------------------------------------------

export const routeShareCreateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'route'],
  properties: {
    source: { type: 'string', enum: ['planned'] },
    route: plannedRoutePayloadRequestSchema,
  },
} as const;

export type RouteShareCreateRequest = {
  source: 'planned';
  route: PlannedRouteRequestPayload;
};

// ---------------------------------------------------------------------------
// POST /v1/route-shares — response
// ---------------------------------------------------------------------------

export const routeShareCreateResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'code', 'source', 'appUrl', 'webUrl', 'createdAt', 'expiresAt'],
  properties: {
    id: { type: 'string', minLength: 1 },
    code: { type: 'string', minLength: 8, maxLength: 8 },
    source: { type: 'string', enum: ['planned', 'saved', 'past_ride'] },
    appUrl: { type: 'string', minLength: 1 },
    webUrl: { type: 'string', minLength: 1 },
    createdAt: { type: 'string' },
    expiresAt: { type: 'string' },
  },
} as const;

export type RouteShareCreateResponse = {
  id: string;
  code: string;
  source: 'planned' | 'saved' | 'past_ride';
  appUrl: string;
  webUrl: string;
  createdAt: string;
  expiresAt: string;
};

// ---------------------------------------------------------------------------
// GET /v1/route-shares/public/:code — params + response
//
// Mirrors RouteSharePublicView from packages/core/routeShareContract. Any
// field added there MUST be added here too (error-log #9).
// ---------------------------------------------------------------------------

export const routeSharePublicParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: {
      type: 'string',
      // 8-char base62. Validated in the handler via isValidShareCode, but
      // we also gate pathologically long paths at the schema layer.
      minLength: 8,
      maxLength: 8,
      pattern: '^[0-9A-Za-z]{8}$',
    },
  },
} as const;

export type RouteSharePublicParams = {
  code: string;
};

export const routeSharePublicResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'code',
    'source',
    'sharerDisplayName',
    'sharerAvatarUrl',
    'route',
    'endpointsHidden',
    'fullLengthMeters',
    'viewCount',
    'createdAt',
    'expiresAt',
  ],
  properties: {
    code: { type: 'string', minLength: 8, maxLength: 8 },
    source: { type: 'string', enum: ['planned', 'saved', 'past_ride'] },
    sharerDisplayName: { type: ['string', 'null'] },
    sharerAvatarUrl: { type: ['string', 'null'] },
    route: plannedRoutePayloadResponseSchema,
    endpointsHidden: { type: 'boolean' },
    fullLengthMeters: { type: 'number', minimum: 0 },
    viewCount: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string' },
    expiresAt: { type: ['string', 'null'] },
  },
} as const;

export type RouteSharePublicResponse = {
  code: string;
  source: 'planned' | 'saved' | 'past_ride';
  sharerDisplayName: string | null;
  sharerAvatarUrl: string | null;
  route: PlannedRouteResponsePayload;
  endpointsHidden: boolean;
  fullLengthMeters: number;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
};
