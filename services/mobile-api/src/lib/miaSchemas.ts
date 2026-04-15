import { errorResponseSchema } from './http';

export { errorResponseSchema };

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const activateMiaBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source'],
  properties: {
    source: {
      type: 'string',
      enum: ['self_selected', 'behavioral', 'contextual'],
    },
  },
} as const;

export const testimonialBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: {
      type: 'string',
      minLength: 1,
      maxLength: 280,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const miaJourneyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'persona',
    'level',
    'status',
    'totalRides',
    'ridesWithDestination',
    'ridesOver5km',
    'moderateSegmentsCompleted',
    'ridesNeeded',
    'detectionSource',
    'startedAt',
    'completedAt',
    'testimonial',
  ],
  properties: {
    persona: { type: 'string', enum: ['alex', 'mia'] },
    level: { type: 'integer', minimum: 1, maximum: 5 },
    status: { type: ['string', 'null'], enum: ['active', 'completed', 'opted_out', null] },
    totalRides: { type: 'integer' },
    ridesWithDestination: { type: 'integer' },
    ridesOver5km: { type: 'integer' },
    moderateSegmentsCompleted: { type: 'integer' },
    ridesNeeded: { type: 'integer' },
    detectionSource: { type: ['string', 'null'], enum: ['self_selected', 'behavioral', 'contextual', null] },
    startedAt: { type: ['string', 'null'] },
    completedAt: { type: ['string', 'null'] },
    testimonial: { type: ['string', 'null'] },
  },
} as const;

export const activateMiaResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['activatedAt'],
  properties: {
    activatedAt: { type: 'string' },
  },
} as const;

export const optOutMiaResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['optedOutAt'],
  properties: {
    optedOutAt: { type: 'string' },
  },
} as const;

export const testimonialResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['acceptedAt'],
  properties: {
    acceptedAt: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Telemetry schemas
// ---------------------------------------------------------------------------

export const telemetryEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['event_type', 'timestamp'],
  properties: {
    event_type: {
      type: 'string',
      enum: ['app_open', 'route_generated_not_started', 'map_browse_session'],
    },
    properties: {
      type: 'object',
      additionalProperties: true,
      default: {},
    },
    session_id: { type: 'string' },
    timestamp: { type: 'string' },
  },
} as const;

export const telemetryBatchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: telemetryEventSchema,
      minItems: 1,
      maxItems: 50,
    },
  },
} as const;

export const telemetryBatchResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accepted'],
  properties: {
    accepted: { type: 'integer' },
  },
} as const;

// ---------------------------------------------------------------------------
// Detection evaluation schemas
// ---------------------------------------------------------------------------

export const detectionEvaluateResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['evaluated', 'prompted'],
  properties: {
    evaluated: { type: 'integer' },
    prompted: { type: 'integer' },
  },
} as const;

// ---------------------------------------------------------------------------
// TypeScript types for Fastify generics
// ---------------------------------------------------------------------------

export type ActivateMiaBody = {
  source: 'self_selected' | 'behavioral' | 'contextual';
};

export type TestimonialBody = {
  text: string;
};

export type MiaJourneyResponse = {
  persona: 'alex' | 'mia';
  level: number;
  status: 'active' | 'completed' | 'opted_out' | null;
  totalRides: number;
  ridesWithDestination: number;
  ridesOver5km: number;
  moderateSegmentsCompleted: number;
  ridesNeeded: number;
  detectionSource: 'self_selected' | 'behavioral' | 'contextual' | null;
  startedAt: string | null;
  completedAt: string | null;
  testimonial: string | null;
};

export type ActivateMiaResponse = {
  activatedAt: string;
};

export type OptOutMiaResponse = {
  optedOutAt: string;
};

export type TestimonialResponse = {
  acceptedAt: string;
};

export type TelemetryEventInput = {
  event_type: 'app_open' | 'route_generated_not_started' | 'map_browse_session';
  properties?: Record<string, unknown>;
  session_id?: string;
  timestamp: string;
};

export type TelemetryBatchBody = {
  events: TelemetryEventInput[];
};

export type TelemetryBatchResponse = {
  accepted: number;
};

export type DetectionEvaluateResponse = {
  evaluated: number;
  prompted: number;
};

// ---------------------------------------------------------------------------
// Notification cron
// ---------------------------------------------------------------------------

export const notificationEvaluateResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['evaluated', 'notified'],
  properties: {
    evaluated: { type: 'integer' },
    notified: { type: 'integer' },
  },
} as const;

export type NotificationEvaluateResponse = {
  evaluated: number;
  notified: number;
};
