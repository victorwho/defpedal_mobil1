import { SAFETY_TAG_OPTIONS } from '@defensivepedal/core';
import type {
  FeedCommentRequest,
  ProfileUpdateRequest,
  ShareTripRequest,
} from '@defensivepedal/core';

const safetyTagValues = SAFETY_TAG_OPTIONS.map((o) => o.value) as string[];

export const errorResponseSchema = {
  type: 'object' as const,
  properties: {
    error: { type: 'string' as const },
    code: { type: 'string' as const },
    details: { type: 'array' as const, items: { type: 'string' as const } },
  },
};

const coordinateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const feedQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    radiusKm: { type: 'number', minimum: 1, maximum: 100 },
    cursor: { type: 'string', maxLength: 50 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
} as const;

export const shareTripRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'startLocationText',
    'destinationText',
    'distanceMeters',
    'durationSeconds',
    'geometryPolyline6',
    'startCoordinate',
  ],
  properties: {
    tripId: { type: 'string', minLength: 1 },
    title: { type: 'string', maxLength: 200 },
    startLocationText: { type: 'string', minLength: 1, maxLength: 500 },
    destinationText: { type: 'string', minLength: 1, maxLength: 500 },
    distanceMeters: { type: 'number', minimum: 0 },
    durationSeconds: { type: 'number', minimum: 0 },
    elevationGainMeters: { type: ['number', 'null'] },
    averageSpeedMps: { type: ['number', 'null'] },
    safetyRating: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    geometryPolyline6: { type: 'string', minLength: 1 },
    safetyTags: {
      type: 'array',
      items: { type: 'string', enum: safetyTagValues },
    },
    note: { type: 'string', maxLength: 2000 },
    startCoordinate: coordinateSchema,
  },
} as const;

export const feedCommentRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    body: { type: 'string', minLength: 1, maxLength: 2000 },
  },
} as const;

export const profileUpdateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 100 },
    username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
    autoShareRides: { type: 'boolean' },
    trimRouteEndpoints: { type: 'boolean' },
    cyclingGoal: { type: ['string', 'null'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const feedProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName', 'avatarUrl', 'guardianTier'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    guardianTier: { type: ['string', 'null'] },
  },
} as const;

export const feedItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'user', 'title', 'startLocationText', 'destinationText',
    'distanceMeters', 'durationSeconds', 'elevationGainMeters',
    'averageSpeedMps', 'safetyRating', 'safetyTags', 'geometryPolyline6',
    'note', 'sharedAt', 'likeCount', 'loveCount', 'co2SavedKg', 'commentCount', 'likedByMe', 'lovedByMe',
  ],
  properties: {
    id: { type: 'string' },
    user: feedProfileSchema,
    title: { type: 'string' },
    startLocationText: { type: 'string' },
    destinationText: { type: 'string' },
    distanceMeters: { type: 'number' },
    durationSeconds: { type: 'number' },
    elevationGainMeters: { type: ['number', 'null'] },
    averageSpeedMps: { type: ['number', 'null'] },
    safetyRating: { type: ['integer', 'null'] },
    safetyTags: { type: 'array', items: { type: 'string' } },
    geometryPolyline6: { type: 'string' },
    note: { type: ['string', 'null'] },
    sharedAt: { type: 'string', format: 'date-time' },
    likeCount: { type: 'integer' },
    loveCount: { type: 'integer' },
    co2SavedKg: { type: ['number', 'null'] },
    commentCount: { type: 'integer' },
    likedByMe: { type: 'boolean' },
    lovedByMe: { type: 'boolean' },
  },
} as const;

export const feedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'cursor'],
  properties: {
    items: { type: 'array', items: feedItemSchema },
    cursor: { type: ['string', 'null'] },
  },
} as const;

const feedCommentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'user', 'body', 'createdAt'],
  properties: {
    id: { type: 'string' },
    user: feedProfileSchema,
    body: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const feedCommentsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['comments'],
  properties: {
    comments: { type: 'array', items: feedCommentSchema },
  },
} as const;

export const profileResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName', 'avatarUrl', 'autoShareRides', 'trimRouteEndpoints', 'cyclingGoal', 'guardianTier', 'username'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string' },
    username: { type: ['string', 'null'] },
    avatarUrl: { type: ['string', 'null'] },
    autoShareRides: { type: 'boolean' },
    trimRouteEndpoints: { type: 'boolean' },
    cyclingGoal: { type: ['string', 'null'] },
    guardianTier: { type: ['string', 'null'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Community stats schemas
// ---------------------------------------------------------------------------

export const communityStatsQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    radiusKm: { type: 'number', minimum: 1, maximum: 100 },
  },
} as const;

export const communityStatsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'localityName', 'totalTrips', 'totalDistanceMeters',
    'totalDurationSeconds', 'totalCo2SavedKg', 'uniqueRiders',
  ],
  properties: {
    localityName: { type: ['string', 'null'] },
    totalTrips: { type: 'integer' },
    totalDistanceMeters: { type: 'number' },
    totalDurationSeconds: { type: 'number' },
    totalCo2SavedKg: { type: 'number' },
    uniqueRiders: { type: 'integer' },
  },
} as const;

// ---------------------------------------------------------------------------
// Body types for Fastify generics
// ---------------------------------------------------------------------------

export type FeedQuerystring = {
  lat: number;
  lon: number;
  radiusKm?: number;
  cursor?: string;
  limit?: number;
};

export type ShareTripBody = ShareTripRequest;
export type FeedCommentBody = FeedCommentRequest;
export type ProfileUpdateBody = ProfileUpdateRequest;
export type TripShareIdParams = { id: string };
export type CommunityStatsQuerystring = {
  lat: number;
  lon: number;
  radiusKm?: number;
};

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

export const normalizeShareTripRequest = (body: ShareTripBody): ShareTripRequest => ({
  tripId: body.tripId,
  title: body.title?.trim() || `Commute to ${body.destinationText.trim()}`,
  startLocationText: body.startLocationText.trim(),
  destinationText: body.destinationText.trim(),
  distanceMeters: body.distanceMeters,
  durationSeconds: body.durationSeconds,
  elevationGainMeters: body.elevationGainMeters ?? null,
  averageSpeedMps: body.averageSpeedMps ?? null,
  safetyRating: body.safetyRating ?? null,
  geometryPolyline6: body.geometryPolyline6,
  safetyTags: body.safetyTags ?? [],
  note: body.note?.trim() || undefined,
  startCoordinate: body.startCoordinate,
});
