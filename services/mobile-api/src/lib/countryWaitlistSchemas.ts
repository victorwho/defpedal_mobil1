import { errorResponseSchema } from './http';

export { errorResponseSchema };

/**
 * POST /v1/country-waitlist — region-gate email signup ("notify me when
 * Defensive Pedal reaches my country").
 *
 * Email is validated with a pattern (not `format: 'email'`) because the
 * Fastify/ajv setup here does not register ajv-formats — an unknown format
 * would be silently ignored and the check would never run. Normalization
 * (trim + lowercase) happens in the route handler before the DB write.
 */
export const countryWaitlistRequestSchema = {
  type: 'object',
  required: ['email', 'countryCode', 'source'],
  additionalProperties: false,
  properties: {
    email: {
      type: 'string',
      minLength: 3,
      maxLength: 254,
      pattern: '^\\s*[^@\\s]+@[^@\\s]+\\.[^@\\s]+\\s*$',
    },
    countryCode: { type: 'string', pattern: '^[A-Za-z]{2}$' },
    detectedCountryCode: { type: 'string', pattern: '^[A-Za-z]{2}$', nullable: true },
    locale: { type: 'string', maxLength: 10, nullable: true },
    source: { type: 'string', enum: ['onboarding'] },
  },
} as const;

// Per Gotcha #9 / error-log #22: every returned field must be declared in
// `properties` + `required`, otherwise Fastify silently drops it.
export const countryWaitlistResponseSchema = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: {
    // Duplicate signups are deduped server-side and still report 'joined' so
    // the client UX is idempotent.
    status: { type: 'string', enum: ['joined'] },
  },
} as const;
