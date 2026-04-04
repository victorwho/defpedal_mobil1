import {
  HAZARD_TYPE_OPTIONS,
} from '@defensivepedal/core';
import type {
  AutocompleteRequest,
  ErrorResponse,
  HazardReportRequest,
  NavigationFeedbackRequest,
  ReverseGeocodeRequest,
  SavedRouteCreateRequest,
  TripEndRequest,
  TripStartRequest,
  RerouteRequest,
  RoutePreviewRequest,
  WriteAckResponse,
} from '@defensivepedal/core';
import type { FastifyError } from 'fastify';

type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type CoverageQuerystring = {
  lat: number;
  lon: number;
  countryHint?: string;
};

export type AutocompleteBody = WithOptional<
  AutocompleteRequest,
  'proximity' | 'locale' | 'countryHint' | 'limit'
>;

export type ReverseGeocodeBody = ReverseGeocodeRequest;
export type HazardReportBody = HazardReportRequest;
export type TripStartBody = TripStartRequest;
export type TripEndBody = TripEndRequest;
export type NavigationFeedbackBody = NavigationFeedbackRequest;

export type SavedRouteCreateBody = SavedRouteCreateRequest;

export type RoutePreviewBody = WithOptional<
  RoutePreviewRequest,
  'startOverride' | 'avoidUnpaved' | 'locale' | 'countryHint' | 'debug'
>;

export type RerouteBody = WithOptional<
  RerouteRequest,
  'startOverride' | 'avoidUnpaved' | 'locale' | 'countryHint' | 'debug' | 'activeRouteId'
>;

const coordinatePairSchema = {
  type: 'array',
  minItems: 2,
  maxItems: 2,
  items: {
    type: 'number',
  },
} as const;

const coordinateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: {
      type: 'number',
      minimum: -90,
      maximum: 90,
    },
    lon: {
      type: 'number',
      minimum: -180,
      maximum: 180,
    },
  },
} as const;

const localeSchema = {
  type: 'string',
  minLength: 2,
  maxLength: 10,
} as const;

const dateTimeSchema = {
  type: 'string',
  format: 'date-time',
} as const;

const countryHintSchema = {
  type: 'string',
  minLength: 2,
  maxLength: 3,
} as const;

const lineStringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'coordinates'],
  properties: {
    type: {
      const: 'LineString',
    },
    coordinates: {
      type: 'array',
      minItems: 2,
      items: coordinatePairSchema,
    },
  },
} as const;

const multiLineStringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'coordinates'],
  properties: {
    type: {
      const: 'MultiLineString',
    },
    coordinates: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'array',
        minItems: 2,
        items: coordinatePairSchema,
      },
    },
  },
} as const;

const maneuverSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['bearing_after', 'bearing_before', 'location', 'type'],
  properties: {
    bearing_after: {
      type: 'number',
    },
    bearing_before: {
      type: 'number',
    },
    location: coordinatePairSchema,
    modifier: {
      type: 'string',
    },
    type: {
      type: 'string',
      minLength: 1,
    },
    exit: {
      type: 'number',
    },
  },
} as const;

const coverageRegionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['countryCode', 'status', 'safeRouting', 'fastRouting'],
  properties: {
    countryCode: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
    },
    status: {
      type: 'string',
      enum: ['supported', 'partial', 'unsupported'],
    },
    safeRouting: {
      type: 'boolean',
    },
    fastRouting: {
      type: 'boolean',
    },
    message: {
      type: 'string',
    },
  },
} as const;

const riskSegmentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'riskScore', 'color', 'geometry'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
    },
    riskScore: {
      type: 'number',
    },
    color: {
      type: 'string',
      minLength: 1,
    },
    geometry: {
      oneOf: [lineStringSchema, multiLineStringSchema],
    },
  },
} as const;

const navigationStepSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'instruction',
    'streetName',
    'distanceMeters',
    'durationSeconds',
    'maneuver',
    'mode',
  ],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
    },
    instruction: {
      type: 'string',
      minLength: 1,
    },
    streetName: {
      type: 'string',
    },
    distanceMeters: {
      type: 'number',
      minimum: 0,
    },
    durationSeconds: {
      type: 'number',
      minimum: 0,
    },
    maneuver: maneuverSchema,
    geometry: lineStringSchema,
    mode: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

const routeOptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'source',
    'routingEngineVersion',
    'routingProfileVersion',
    'mapDataVersion',
    'riskModelVersion',
    'geometryPolyline6',
    'distanceMeters',
    'durationSeconds',
    'adjustedDurationSeconds',
    'totalClimbMeters',
    'steps',
    'riskSegments',
    'warnings',
  ],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
    },
    source: {
      type: 'string',
      enum: ['custom_osrm', 'mapbox'],
    },
    routingEngineVersion: {
      type: 'string',
      minLength: 1,
    },
    routingProfileVersion: {
      type: 'string',
      minLength: 1,
    },
    mapDataVersion: {
      type: 'string',
      minLength: 1,
    },
    riskModelVersion: {
      type: 'string',
      minLength: 1,
    },
    geometryPolyline6: {
      type: 'string',
      minLength: 1,
    },
    distanceMeters: {
      type: 'number',
      minimum: 0,
    },
    durationSeconds: {
      type: 'number',
      minimum: 0,
    },
    adjustedDurationSeconds: {
      type: 'number',
      minimum: 0,
    },
    totalClimbMeters: {
      type: ['number', 'null'],
    },
    steps: {
      type: 'array',
      items: navigationStepSchema,
    },
    riskSegments: {
      type: 'array',
      items: riskSegmentSchema,
    },
    warnings: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;

const routeDebugInfoSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'routeId',
    'source',
    'routingProfileVersion',
    'selectedAlternativeIndex',
    'totalRiskScore',
  ],
  properties: {
    routeId: {
      type: 'string',
      minLength: 1,
    },
    source: {
      type: 'string',
      enum: ['custom_osrm', 'mapbox'],
    },
    routingProfileVersion: {
      type: 'string',
      minLength: 1,
    },
    selectedAlternativeIndex: {
      type: 'number',
      minimum: 0,
    },
    totalRiskScore: {
      type: 'number',
    },
    fallbackReason: {
      type: 'string',
    },
  },
} as const;

export const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'code'],
  properties: {
    error: {
      type: 'string',
      minLength: 1,
    },
    code: {
      type: 'string',
      enum: [
        'VALIDATION_ERROR',
        'BAD_REQUEST',
        'RATE_LIMITED',
        'UNAUTHORIZED',
        'UPSTREAM_ERROR',
        'INTERNAL_ERROR',
      ],
    },
    details: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
} as const;

export const coverageQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lon'],
  properties: {
    lat: {
      type: 'number',
      minimum: -90,
      maximum: 90,
    },
    lon: {
      type: 'number',
      minimum: -180,
      maximum: 180,
    },
    countryHint: countryHintSchema,
  },
} as const;

export const coverageResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['regions', 'generatedAt'],
  properties: {
    regions: {
      type: 'array',
      items: coverageRegionSchema,
    },
    matched: coverageRegionSchema,
    generatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const autocompleteRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: 200,
    },
    proximity: coordinateSchema,
    locale: localeSchema,
    countryHint: countryHintSchema,
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
    },
  },
} as const;

const autocompleteSuggestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'primaryText', 'coordinates'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
    },
    label: {
      type: 'string',
      minLength: 1,
    },
    primaryText: {
      type: 'string',
      minLength: 1,
    },
    coordinates: coordinateSchema,
    distanceMeters: {
      type: 'number',
      minimum: 0,
    },
  },
} as const;

export const autocompleteResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions', 'generatedAt'],
  properties: {
    suggestions: {
      type: 'array',
      items: autocompleteSuggestionSchema,
    },
    generatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const reverseGeocodeRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['coordinate'],
  properties: {
    coordinate: coordinateSchema,
    locale: localeSchema,
    countryHint: countryHintSchema,
  },
} as const;

export const reverseGeocodeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['coordinate', 'label'],
  properties: {
    coordinate: coordinateSchema,
    label: {
      type: ['string', 'null'],
    },
  },
} as const;

export const hazardReportRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['coordinate', 'reportedAt'],
  properties: {
    coordinate: coordinateSchema,
    reportedAt: dateTimeSchema,
    source: {
      type: 'string',
      enum: ['manual', 'automatic'],
    },
    hazardType: {
      type: 'string',
      enum: HAZARD_TYPE_OPTIONS.map((option) => option.value),
    },
  },
} as const;

export const hazardReportResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reportId', 'acceptedAt'],
  properties: {
    reportId: {
      type: 'string',
      minLength: 1,
    },
    acceptedAt: dateTimeSchema,
  },
} as const;

export const tripStartRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'clientTripId',
    'sessionId',
    'startLocationText',
    'startCoordinate',
    'destinationText',
    'destinationCoordinate',
    'distanceMeters',
    'startedAt',
  ],
  properties: {
    clientTripId: {
      type: 'string',
      minLength: 1,
    },
    sessionId: {
      type: 'string',
      minLength: 1,
    },
    startLocationText: {
      type: 'string',
      minLength: 1,
    },
    startCoordinate: coordinateSchema,
    destinationText: {
      type: 'string',
      minLength: 1,
    },
    destinationCoordinate: coordinateSchema,
    distanceMeters: {
      type: 'number',
      minimum: 0,
    },
    startedAt: dateTimeSchema,
  },
} as const;

export const tripStartResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clientTripId', 'tripId', 'acceptedAt'],
  properties: {
    clientTripId: {
      type: 'string',
      minLength: 1,
    },
    tripId: {
      type: 'string',
      minLength: 1,
    },
    acceptedAt: dateTimeSchema,
  },
} as const;

export const tripEndRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clientTripId', 'tripId', 'endedAt', 'reason'],
  properties: {
    clientTripId: {
      type: 'string',
      minLength: 1,
    },
    tripId: {
      type: 'string',
      minLength: 1,
    },
    endedAt: dateTimeSchema,
    reason: {
      type: 'string',
      enum: ['completed', 'stopped'],
    },
  },
} as const;

export const tripEndResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['clientTripId', 'tripId', 'acceptedAt'],
  properties: {
    clientTripId: {
      type: 'string',
      minLength: 1,
    },
    tripId: {
      type: 'string',
      minLength: 1,
    },
    acceptedAt: dateTimeSchema,
  },
} as const;

export const navigationFeedbackRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sessionId',
    'startLocationText',
    'destinationText',
    'distanceMeters',
    'durationSeconds',
    'rating',
    'feedbackText',
    'submittedAt',
  ],
  properties: {
    tripId: {
      type: 'string',
      minLength: 1,
    },
    clientTripId: {
      type: 'string',
      minLength: 1,
    },
    sessionId: {
      type: 'string',
      minLength: 1,
    },
    startLocationText: {
      type: 'string',
      minLength: 1,
    },
    destinationText: {
      type: 'string',
      minLength: 1,
    },
    distanceMeters: {
      type: 'number',
      minimum: 0,
    },
    durationSeconds: {
      type: 'number',
      minimum: 0,
    },
    rating: {
      type: 'integer',
      minimum: 1,
      maximum: 5,
    },
    feedbackText: {
      type: 'string',
      maxLength: 4000,
    },
    submittedAt: dateTimeSchema,
  },
} as const;

export const writeAckResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['acceptedAt'],
  properties: {
    acceptedAt: dateTimeSchema,
  },
} as const;

export const routePreviewRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['origin', 'destination', 'mode'],
  properties: {
    origin: coordinateSchema,
    destination: coordinateSchema,
    startOverride: coordinateSchema,
    mode: {
      type: 'string',
      enum: ['safe', 'fast'],
    },
    avoidUnpaved: {
      type: 'boolean',
    },
    locale: localeSchema,
    countryHint: countryHintSchema,
    debug: {
      type: 'boolean',
    },
  },
} as const;

export const rerouteRequestSchema = {
  ...routePreviewRequestSchema,
  properties: {
    ...routePreviewRequestSchema.properties,
    activeRouteId: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const routePreviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['routes', 'selectedMode', 'coverage', 'generatedAt'],
  properties: {
    routes: {
      type: 'array',
      items: routeOptionSchema,
    },
    selectedMode: {
      type: 'string',
      enum: ['safe', 'fast'],
    },
    coverage: coverageRegionSchema,
    generatedAt: {
      type: 'string',
      format: 'date-time',
    },
    debug: {
      type: 'array',
      items: routeDebugInfoSchema,
    },
  },
} as const;

// ── Saved Routes Schemas ──

export const savedRouteCreateRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'origin', 'destination', 'mode', 'avoidUnpaved'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    origin: coordinateSchema,
    destination: coordinateSchema,
    waypoints: {
      type: 'array',
      maxItems: 3,
      items: coordinateSchema,
    },
    mode: { type: 'string', enum: ['safe', 'fast'] },
    avoidUnpaved: { type: 'boolean' },
  },
} as const;

export const savedRouteResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    origin: coordinateSchema,
    destination: coordinateSchema,
    waypoints: { type: 'array', items: coordinateSchema },
    mode: { type: 'string' },
    avoidUnpaved: { type: 'boolean' },
    createdAt: { type: 'string' },
    lastUsedAt: { type: 'string' },
  },
} as const;

export const savedRouteListResponseSchema = {
  type: 'object',
  properties: {
    routes: {
      type: 'array',
      items: savedRouteResponseSchema,
    },
  },
} as const;

export const normalizeSavedRouteCreateRequest = (
  body: SavedRouteCreateBody,
): SavedRouteCreateRequest => ({
  name: body.name.trim(),
  origin: body.origin,
  destination: body.destination,
  waypoints: body.waypoints ?? [],
  mode: body.mode,
  avoidUnpaved: body.avoidUnpaved,
});

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ErrorResponse['code'];
  readonly details?: string[];

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: ErrorResponse['code'];
      details?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.details = options.details;
  }
}

export const toErrorResponse = (
  message: string,
  code: ErrorResponse['code'],
  details?: string[],
): ErrorResponse => ({
  error: message,
  code,
  ...(details && details.length > 0 ? { details } : {}),
});

export const normalizeAutocompleteRequest = (
  body: AutocompleteBody,
): AutocompleteRequest => {
  const query = body.query.trim();

  if (query.length < 2) {
    throw new HttpError('Autocomplete query must be at least 2 non-space characters.', {
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  }

  return {
    query,
    proximity: body.proximity,
    locale: body.locale ?? 'en',
    countryHint: body.countryHint,
    limit: body.limit ?? 5,
  };
};

export const normalizeReverseGeocodeRequest = (
  body: ReverseGeocodeBody,
): ReverseGeocodeRequest => ({
  coordinate: body.coordinate,
  locale: body.locale ?? 'en',
  countryHint: body.countryHint,
});

export const normalizeHazardReportRequest = (
  body: HazardReportBody,
): HazardReportRequest => ({
  coordinate: body.coordinate,
  reportedAt: body.reportedAt,
  source: body.source ?? 'manual',
  hazardType: body.hazardType,
});

export const normalizeTripStartRequest = (body: TripStartBody): TripStartRequest => ({
  clientTripId: body.clientTripId,
  sessionId: body.sessionId,
  startLocationText: body.startLocationText.trim(),
  startCoordinate: body.startCoordinate,
  destinationText: body.destinationText.trim(),
  destinationCoordinate: body.destinationCoordinate,
  distanceMeters: body.distanceMeters,
  startedAt: body.startedAt,
});

export const normalizeTripEndRequest = (body: TripEndBody): TripEndRequest => ({
  clientTripId: body.clientTripId,
  tripId: body.tripId,
  endedAt: body.endedAt,
  reason: body.reason,
});

export const normalizeNavigationFeedbackRequest = (
  body: NavigationFeedbackBody,
): NavigationFeedbackRequest => ({
  tripId: body.tripId,
  clientTripId: body.clientTripId,
  sessionId: body.sessionId,
  startLocationText: body.startLocationText.trim(),
  destinationText: body.destinationText.trim(),
  distanceMeters: body.distanceMeters,
  durationSeconds: body.durationSeconds,
  rating: body.rating,
  feedbackText: body.feedbackText.trim(),
  submittedAt: body.submittedAt,
});

export const normalizeRoutePreviewRequest = (
  body: RoutePreviewBody,
): RoutePreviewRequest => ({
  origin: body.origin,
  destination: body.destination,
  startOverride: body.startOverride,
  mode: body.mode,
  avoidUnpaved: body.avoidUnpaved ?? false,
  locale: body.locale ?? 'en',
  countryHint: body.countryHint,
  debug: body.debug ?? false,
});

export const normalizeRerouteRequest = (body: RerouteBody): RerouteRequest => ({
  ...normalizeRoutePreviewRequest(body),
  startOverride: undefined,
  activeRouteId: body.activeRouteId,
});

export const formatValidationDetails = (error: FastifyError): string[] => {
  const validationError = error as FastifyError & {
    validation?: Array<{
      instancePath?: string;
      message?: string;
      params?: Record<string, unknown>;
    }>;
    validationContext?: string;
  };
  const validation = validationError.validation;
  const context = validationError.validationContext ?? 'request';

  if (!Array.isArray(validation)) {
    return [];
  }

  return validation.map((issue) => {
    const instancePath = issue.instancePath ? issue.instancePath.replace(/^\//, '') : '';
    const missingProperty =
      typeof issue.params?.missingProperty === 'string' ? issue.params.missingProperty : '';
    const subject = [context, instancePath, missingProperty]
      .filter(Boolean)
      .join('.')
      .replace(/^request\./, '');

    return `${subject}: ${issue.message ?? 'is invalid'}`;
  });
};
