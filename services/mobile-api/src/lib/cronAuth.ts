/**
 * Shared cron/admin bearer-secret verification.
 *
 * Review 2026-06-12 P2: the Bearer CRON_SECRET check was re-implemented ~6x
 * across route files (v1, retention, moderation, leaderboard,
 * firstRideNotifications, nudges), every copy using plain string `!==` —
 * which short-circuits on the first differing byte and is not timing-safe.
 * This module is now the single implementation; comparisons go through
 * crypto.timingSafeEqual with a length guard (same pattern as
 * lib/auth.ts tokensMatch).
 *
 * Fails closed: a missing/empty secret is a 500 (server misconfiguration),
 * never an open endpoint.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import { HttpError } from './http';

/** Constant-time string equality (length-guarded timingSafeEqual). */
export const timingSafeStringEqual = (provided: string, expected: string): boolean =>
  secretsMatch(provided, expected);

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

/**
 * Verify an Authorization header against `Bearer ${secret}` in constant time.
 * Throws HttpError 500 when the secret is unconfigured, 401 on mismatch.
 */
export const verifyBearerSecret = (
  authorizationHeader: string | undefined,
  secret: string | undefined,
  unauthorizedMessage = 'Unauthorized cron call.',
): void => {
  if (!secret) {
    throw new HttpError('Cron secret not configured.', {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  }
  const provided = authorizationHeader ?? '';
  if (!secretsMatch(provided, `Bearer ${secret}`)) {
    throw new HttpError(unauthorizedMessage, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }
};

/** Standard CRON_SECRET gate for Cloud Scheduler endpoints. */
export const verifyCronAuth = (request: FastifyRequest): void => {
  verifyBearerSecret(request.headers.authorization, process.env.CRON_SECRET);
};
