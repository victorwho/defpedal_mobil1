import { errorResponseSchema } from './http';

export { errorResponseSchema };

const coordinateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

const routeContextSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'distanceMeters'],
  properties: {
    mode: { type: 'string', enum: ['safe', 'fast', 'flat'] },
    distanceMeters: { type: 'number', minimum: 0 },
    routeId: { type: 'string', maxLength: 64 },
  },
} as const;

export const citySuggestionRequestSchema = {
  type: 'object',
  required: ['coordinate', 'body', 'submittedAt', 'source'],
  additionalProperties: false,
  properties: {
    coordinate: coordinateSchema,
    body: { type: 'string', minLength: 1, maxLength: 500 },
    submittedAt: { type: 'string', format: 'date-time' },
    source: { type: 'string', enum: ['route_preview'] },
    locality: { type: 'string', maxLength: 200, nullable: true },
    routeContext: { ...routeContextSchema, nullable: true },
  },
} as const;

// Per Gotcha #9 / error-log #22: every returned field must be declared in
// `properties` + `required`, otherwise Fastify silently drops it.
export const citySuggestionResponseSchema = {
  type: 'object',
  required: ['id', 'createdAt', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['open'] },
  },
} as const;

// Stub list endpoint — v1 always returns []. Wired so the mobile hook has a
// stable URL when a display surface ships later.
export const nearbyCitySuggestionsQuerySchema = {
  type: 'object',
  required: ['lat', 'lon'],
  additionalProperties: false,
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    radius: { type: 'number', minimum: 1, maximum: 50000 },
  },
} as const;

export const nearbyCitySuggestionsResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'coordinate', 'suggestionPreview', 'submittedAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      coordinate: coordinateSchema,
      suggestionPreview: { type: 'string', maxLength: 200 },
      submittedAt: { type: 'string', format: 'date-time' },
    },
  },
} as const;
