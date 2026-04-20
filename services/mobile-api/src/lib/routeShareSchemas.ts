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

// Slice 5a: accepts both 'planned' (slice 1) and 'saved' variants. Saved
// requires a `savedRouteId` uuid — the server validates ownership in
// `routeShareService.createShare` before persisting. 'past_ride' stays
// rejected (z.never in the core zod stub) until slice 5b.
//
// Slice 6: optional `hideEndpoints` boolean. Omitted → DB default
// (true) applies; false → full polyline visible to the public viewer.
export const routeShareCreateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'route'],
  properties: {
    source: { type: 'string', enum: ['planned', 'saved'] },
    route: plannedRoutePayloadRequestSchema,
    savedRouteId: { type: 'string', format: 'uuid' },
    hideEndpoints: { type: 'boolean' },
  },
  // Conditional: when source='saved', savedRouteId is required. Planned
  // requests must not carry it (defense against typos that would silently
  // set an unrelated source_ref_id).
  allOf: [
    {
      if: { properties: { source: { const: 'saved' } } },
      then: { required: ['savedRouteId'] },
    },
    {
      if: { properties: { source: { const: 'planned' } } },
      then: { not: { required: ['savedRouteId'] } },
    },
  ],
} as const;

export type RouteShareCreateRequest = (
  | {
      source: 'planned';
      route: PlannedRouteRequestPayload;
    }
  | {
      source: 'saved';
      savedRouteId: string;
      route: PlannedRouteRequestPayload;
    }
) & {
  // Slice 6: optional per-share privacy override. Absence means the
  // route_shares.hide_endpoints column default (true) wins.
  hideEndpoints?: boolean;
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

// ---------------------------------------------------------------------------
// POST /v1/route-shares/:code/claim — params + response
//
// Request body is empty (the code comes from the path param; the invitee id
// comes from the auth context). Response mirrors the `claim_route_share` RPC
// return shape from migration 2026041802_route_share_claims.sql and the
// `routeShareClaimResponseSchema` Zod in packages/core.
//
// Reuses `routeSharePublicParamsSchema` for the :code path param so the
// 8-char base62 validation is centralised.
// ---------------------------------------------------------------------------

export { routeSharePublicParamsSchema as routeShareClaimParamsSchema };
export type RouteShareClaimParams = RouteSharePublicParams;

// Slice 3: invitee-facing reward summary. The RPC also returns inviter-side
// reward info (XP delta + new badges + user id + Mia milestone flag) that the
// API uses to dispatch a push notification to the sharer, but those fields are
// stripped before the response is sent to the invitee. Fastify's schema
// validation enforces that stripping — any inviter* field leaking into the
// reply is rejected as an `additionalProperties` violation.
const claimRewardsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteeXpAwarded', 'inviteeNewBadges', 'followPending'],
  properties: {
    inviteeXpAwarded: { type: ['integer', 'null'] },
    inviteeNewBadges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['badgeKey', 'name', 'flavorText', 'iconKey', 'tier'],
        properties: {
          badgeKey: { type: 'string' },
          name: { type: 'string' },
          flavorText: { type: 'string' },
          iconKey: { type: 'string' },
          tier: { type: 'integer' },
        },
      },
    },
    // Slice 4: true when the sharer's profile is private — the follow
    // relationship was created as 'pending' rather than 'accepted'. XP and
    // badges are still awarded (route access isn't gated on follow
    // approval); this flag only drives the invitee-side toast copy.
    followPending: { type: 'boolean', default: false },
  },
} as const;

export const routeShareClaimResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'code',
    'routePayload',
    'sharerDisplayName',
    'sharerAvatarUrl',
    'alreadyClaimed',
    'rewards',
  ],
  properties: {
    code: { type: 'string', minLength: 8, maxLength: 8 },
    routePayload: plannedRoutePayloadResponseSchema,
    sharerDisplayName: { type: ['string', 'null'] },
    sharerAvatarUrl: { type: ['string', 'null'] },
    alreadyClaimed: { type: 'boolean' },
    rewards: claimRewardsResponseSchema,
  },
} as const;

export type ClaimRewardBadge = {
  badgeKey: string;
  name: string;
  flavorText: string;
  iconKey: string;
  tier: number;
};

export type ClaimInviteeRewards = {
  inviteeXpAwarded: number | null;
  inviteeNewBadges: ClaimRewardBadge[];
  followPending: boolean;
};

export type RouteShareClaimResponse = {
  code: string;
  routePayload: PlannedRouteResponsePayload;
  sharerDisplayName: string | null;
  sharerAvatarUrl: string | null;
  alreadyClaimed: boolean;
  rewards: ClaimInviteeRewards;
};

// ---------------------------------------------------------------------------
// Slice 8 — Ambassador observability + control
// ---------------------------------------------------------------------------

// GET /v1/route-shares/mine
export const mySharesResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['shares', 'ambassadorStats'],
  properties: {
    shares: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'shortCode',
          'sourceType',
          'createdAt',
          'expiresAt',
          'viewCount',
          'signupCount',
          'revokedAt',
        ],
        properties: {
          id: { type: 'string' },
          shortCode: { type: 'string', minLength: 8, maxLength: 8 },
          sourceType: { type: 'string', enum: ['planned', 'saved', 'past_ride'] },
          createdAt: { type: 'string' },
          expiresAt: { type: ['string', 'null'] },
          viewCount: { type: 'integer', minimum: 0 },
          signupCount: { type: 'integer', minimum: 0 },
          revokedAt: { type: ['string', 'null'] },
        },
      },
    },
    ambassadorStats: {
      type: 'object',
      additionalProperties: false,
      required: ['sharesSent', 'opens', 'signups', 'xpEarned'],
      properties: {
        sharesSent: { type: 'integer', minimum: 0 },
        opens: { type: 'integer', minimum: 0 },
        signups: { type: 'integer', minimum: 0 },
        xpEarned: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;

export type MyShareRowApi = {
  id: string;
  shortCode: string;
  sourceType: 'planned' | 'saved' | 'past_ride';
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  signupCount: number;
  revokedAt: string | null;
};

export type AmbassadorStatsApi = {
  sharesSent: number;
  opens: number;
  signups: number;
  xpEarned: number;
};

export type MySharesResponse = {
  shares: MyShareRowApi[];
  ambassadorStats: AmbassadorStatsApi;
};

// DELETE /v1/route-shares/:id
export const routeShareDeleteParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export type RouteShareDeleteParams = { id: string };

// POST /v1/route-shares/:code/view
// Reuses the existing 8-char base62 param schema shape.
export const routeShareViewBeaconResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['bumped', 'firstView'],
  properties: {
    bumped: { type: 'boolean' },
    firstView: { type: 'boolean' },
  },
} as const;

export type RouteShareViewBeaconResponse = {
  bumped: boolean;
  firstView: boolean;
};
