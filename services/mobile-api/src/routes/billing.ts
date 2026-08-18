import type { ErrorResponse } from '@defensivepedal/core';
import { PLUS_ENTITLEMENT_ID } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { timingSafeStringEqual } from '../lib/cronAuth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { applyRevenueCatWebhook } from '../lib/subscriptionWriter';
import { ensureSupabase } from './feed-helpers';

/**
 * POST /v1/billing/webhook — RevenueCat only.
 *
 * The single writer for `subscriptions`. No client can reach this: the shared
 * secret is configured in the RevenueCat dashboard as the Authorization header
 * value, and RLS keeps the table service-role-only anyway.
 *
 * FAILS CLOSED. An unset `REVENUECAT_WEBHOOK_SECRET` is a 500, never an open
 * endpoint — an unauthenticated writer here would let anyone grant themselves
 * Plus.
 *
 * SANDBOX events are rejected by the mapper unless `REVENUECAT_ALLOW_SANDBOX`
 * is explicitly on. That flag must stay off in production: RevenueCat delivers
 * sandbox and production events to the same endpoint, so without it anyone able
 * to drive a sandbox purchase grants themselves Plus on the live app.
 *
 * Status codes are chosen for RevenueCat's retry behaviour, which retries 5xx
 * and gives up on 4xx:
 *   200 — durably decided (applied, duplicate, stale, ignored, unattributable)
 *   400 — malformed payload; retrying cannot help
 *   401 — bad or missing secret
 *   500 — transient failure, or the account does not exist yet (usually the
 *         webhook racing account creation, where a retry genuinely helps)
 */

/** True only when explicitly enabled. Any other value, including unset, is off. */
export const isSandboxAllowed = (): boolean =>
  process.env.REVENUECAT_ALLOW_SANDBOX === 'true';

/**
 * Verifies the Authorization header against the configured secret.
 *
 * Accepts the bare secret or a `Bearer `-prefixed form, since the RevenueCat
 * dashboard takes a free-text header value and both conventions are common.
 * Both comparisons are constant-time.
 */
const verifyWebhookSecret = (authorization: string | undefined): void => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    throw new HttpError('Billing webhook secret not configured.', {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  }

  const provided = authorization ?? '';
  const matches =
    timingSafeStringEqual(provided, secret) ||
    timingSafeStringEqual(provided, `Bearer ${secret}`);

  if (!matches) {
    throw new HttpError('Unauthorized billing webhook call.', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  }
};

interface WebhookReply {
  outcome: string;
  eventId: string | null;
}

export const buildBillingRoutes = (
  _dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.post<{ Reply: WebhookReply | ErrorResponse }>(
      '/billing/webhook',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['outcome', 'eventId'],
              properties: {
                outcome: { type: 'string' },
                eventId: { type: ['string', 'null'] },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        verifyWebhookSecret(request.headers.authorization);

        const db = ensureSupabase();
        const result = await applyRevenueCatWebhook(db, request.body, {
          entitlementId: PLUS_ENTITLEMENT_ID,
          allowSandbox: isSandboxAllowed(),
        });

        switch (result.kind) {
          case 'applied':
            request.log.info(
              { event: 'billing_webhook_applied', userId: result.userId, eventId: result.eventId },
              'subscription state updated',
            );
            return reply.status(200).send({ outcome: 'applied', eventId: result.eventId });

          case 'duplicate':
            // Routine: RevenueCat retries. Not worth more than debug.
            request.log.debug(
              { event: 'billing_webhook_duplicate', eventId: result.eventId },
              'duplicate billing event ignored',
            );
            return reply.status(200).send({ outcome: 'duplicate', eventId: result.eventId });

          case 'stale':
            request.log.warn(
              { event: 'billing_webhook_stale', eventId: result.eventId },
              'out-of-order billing event not applied',
            );
            return reply.status(200).send({ outcome: 'stale', eventId: result.eventId });

          case 'ignored':
            request.log.info(
              {
                event: 'billing_webhook_ignored',
                eventId: result.eventId,
                reason: result.reason,
              },
              'billing event ignored',
            );
            return reply.status(200).send({ outcome: `ignored:${result.reason}`, eventId: result.eventId });

          case 'unattributable':
            // A real purchase we cannot attribute — the client bought before
            // identifying itself to RevenueCat. Loud, because it means someone
            // paid and may not have received anything.
            request.log.error(
              { event: 'billing_webhook_unattributable', appUserId: result.appUserId },
              'billing event has no resolvable user',
            );
            return reply.status(200).send({ outcome: 'unattributable', eventId: null });

          case 'unknown_user':
            // Likely the webhook beating account creation. 500 so RevenueCat
            // retries with backoff.
            request.log.error(
              { event: 'billing_webhook_unknown_user', userId: result.userId },
              'billing event for an account that does not exist yet',
            );
            throw new HttpError('Account not found for this subscription.', {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
            });

          case 'invalid':
            request.log.warn(
              { event: 'billing_webhook_invalid', reason: result.reason },
              'malformed billing webhook payload',
            );
            throw new HttpError('Malformed webhook payload.', {
              statusCode: 400,
              code: 'BAD_REQUEST',
              details: [result.reason],
            });

          case 'error':
          default:
            request.log.error(
              { event: 'billing_webhook_error', message: (result as { message?: string }).message },
              'billing webhook processing failed',
            );
            throw new HttpError('Billing webhook processing failed.', {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
            });
        }
      },
    );
  };

  return routes;
};
