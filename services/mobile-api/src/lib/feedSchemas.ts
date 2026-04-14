import { SAFETY_TAG_OPTIONS } from '@defensivepedal/core';
import type {
  FeedCommentRequest,
  ProfileUpdateRequest,
  ShareTripRequest,
} from '@defensivepedal/core';
import { errorResponseSchema } from './http';

export { errorResponseSchema };

const safetyTagValues = SAFETY_TAG_OPTIONS.map((o) => o.value) as string[];

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
    cursor: { type: 'string', maxLength: 50, format: 'date-time' },
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
    geometryPolyline6: { type: 'string', minLength: 1, maxLength: 500000 },
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
    avatarUrl: { type: ['string', 'null'], format: 'uri' },
    autoShareRides: { type: 'boolean' },
    trimRouteEndpoints: { type: 'boolean' },
    cyclingGoal: { type: ['string', 'null'] },
    notifyWeather: { type: 'boolean' },
    notifyHazard: { type: 'boolean' },
    notifyCommunity: { type: 'boolean' },
    notifyStreak: { type: 'boolean' },
    notifyImpactSummary: { type: 'boolean' },
    quietHoursStart: { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    quietHoursEnd: { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$' },
    quietHoursTimezone: { type: ['string', 'null'] },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const feedProfileSchema = {
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

export const feedItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'user', 'title', 'startLocationText', 'destinationText',
    'distanceMeters', 'durationSeconds', 'elevationGainMeters',
    'averageSpeedMps', 'safetyRating', 'safetyTags', 'geometryPolyline6',
    'note', 'sharedAt', 'likeCount', 'loveCount', 'co2SavedKg', 'commentCount', 'likedByMe', 'lovedByMe',
    'isWeeklyChampion', 'championMetric',
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
    isWeeklyChampion: { type: 'boolean' },
    championMetric: { type: ['string', 'null'] },
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
  required: ['id', 'displayName', 'avatarUrl', 'autoShareRides', 'trimRouteEndpoints', 'cyclingGoal', 'username'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string' },
    username: { type: ['string', 'null'] },
    avatarUrl: { type: ['string', 'null'] },
    autoShareRides: { type: 'boolean' },
    trimRouteEndpoints: { type: 'boolean' },
    cyclingGoal: { type: ['string', 'null'] },
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
// City Heartbeat schemas
// ---------------------------------------------------------------------------

export const heartbeatQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    radiusKm: { type: 'number', minimum: 1, maximum: 100 },
    days: { type: 'integer', minimum: 1, maximum: 30 },
  },
} as const;

const dailyActivitySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['day', 'rides', 'distanceMeters', 'co2SavedKg', 'communitySeconds'],
  properties: {
    day: { type: 'string' },
    rides: { type: 'integer' },
    distanceMeters: { type: 'number' },
    co2SavedKg: { type: 'number' },
    communitySeconds: { type: 'number' },
  },
} as const;

const hazardHotspotSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hazardType', 'count', 'lat', 'lon'],
  properties: {
    hazardType: { type: 'string' },
    count: { type: 'integer' },
    lat: { type: 'number' },
    lon: { type: 'number' },
  },
} as const;

const topContributorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'avatarUrl', 'rideCount', 'distanceKm'],
  properties: {
    displayName: { type: 'string' },
    avatarUrl: { type: ['string', 'null'] },
    rideCount: { type: 'integer' },
    distanceKm: { type: 'number' },
  },
} as const;

export const heartbeatResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['localityName', 'today', 'daily', 'totals', 'hazardHotspots', 'topContributors'],
  properties: {
    localityName: { type: ['string', 'null'] },
    today: {
      type: 'object',
      additionalProperties: false,
      required: ['rides', 'distanceMeters', 'co2SavedKg', 'communitySeconds', 'activeRiders'],
      properties: {
        rides: { type: 'integer' },
        distanceMeters: { type: 'number' },
        co2SavedKg: { type: 'number' },
        communitySeconds: { type: 'number' },
        activeRiders: { type: 'integer' },
      },
    },
    daily: { type: 'array', items: dailyActivitySchema },
    totals: {
      type: 'object',
      additionalProperties: false,
      required: ['rides', 'distanceMeters', 'durationSeconds', 'co2SavedKg', 'communitySeconds', 'uniqueRiders'],
      properties: {
        rides: { type: 'integer' },
        distanceMeters: { type: 'number' },
        durationSeconds: { type: 'number' },
        co2SavedKg: { type: 'number' },
        communitySeconds: { type: 'number' },
        uniqueRiders: { type: 'integer' },
      },
    },
    hazardHotspots: { type: 'array', items: hazardHotspotSchema },
    topContributors: { type: 'array', items: topContributorSchema },
  },
} as const;

export type HeartbeatQuerystring = {
  lat: number;
  lon: number;
  radiusKm?: number;
  days?: number;
};

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
