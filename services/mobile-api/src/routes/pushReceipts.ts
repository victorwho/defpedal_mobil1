import type { ErrorResponse } from '@defensivepedal/core';
import type { FastifyPluginAsync } from 'fastify';

import { verifyCronAuth } from '../lib/cronAuth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { errorResponseSchema } from '../lib/feedSchemas';
import { HttpError } from '../lib/http';
import { processPushReceipts } from '../lib/pushReceipts';
import { ensureSupabase } from './feed-helpers';

/**
 * POST /v1/notifications/receipts/check — Cloud Scheduler only.
 *
 * Drains `push_receipts`: asks Expo for the receipt of every ticket older than
 * 15 minutes, deletes `push_tokens` rows whose receipt says
 * `DeviceNotRegistered`, and clears the bookkeeping rows. Audit SCALE-18.
 *
 * Safe to run at any cadence — the work is idempotent and batched
 * (`RECEIPT_BATCH_LIMIT` per call), so a missed tick just means the next one
 * has more to do. Suggested: every 30 min.
 */
interface ReceiptCheckReply {
  runAt: string;
  polled: number;
  resolved: number;
  pruned: number;
  expired: number;
}

export const buildPushReceiptRoutes = (
  _dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.post<{ Reply: ReceiptCheckReply | ErrorResponse }>(
      '/notifications/receipts/check',
      {
        schema: {
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['runAt', 'polled', 'resolved', 'pruned', 'expired'],
              properties: {
                runAt: { type: 'string', format: 'date-time' },
                polled: { type: 'integer' },
                resolved: { type: 'integer' },
                pruned: { type: 'integer' },
                expired: { type: 'integer' },
              },
            },
            401: errorResponseSchema,
            500: errorResponseSchema,
          },
        },
      },
      async (request) => {
        verifyCronAuth(request);
        const db = ensureSupabase();

        try {
          const result = await processPushReceipts(db);
          request.log.info(
            { event: 'push_receipts_processed', ...result },
            'push receipt sweep complete',
          );
          return { runAt: new Date().toISOString(), ...result };
        } catch (error) {
          request.log.error({ err: error }, 'push receipt sweep failed');
          throw new HttpError('Receipt sweep failed.', {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
          });
        }
      },
    );
  };

  return routes;
};
