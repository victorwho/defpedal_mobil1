import type { FastifyPluginAsync } from 'fastify';

import { requireFullUser } from '../lib/auth';
import type { MobileApiDependencies } from '../lib/dependencies';
import { HttpError } from '../lib/http';
import { captureServerException } from '../lib/sentry';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { supabaseAuthClient } from '../lib/supabaseAuth';

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * Account routes — anonymous → account data merge (review P1 #10).
 *
 * POST /v1/account/merge-anonymous re-parents an anonymous account's data onto
 * the caller's full account, but ONLY when the caller's account is fresh
 * (no rides/XP) — see the `merge_anonymous_account` SQL function.
 *
 * Security: the caller's JWT (the merge TARGET) must be a full, non-anonymous
 * account (requireFullUser). The SOURCE anonymous account is proven by passing
 * its access token in the body, which we verify server-side and confirm is
 * actually anonymous before merging. Neither id is taken on trust.
 */
export const buildAccountRoutes = (
  dependencies: MobileApiDependencies,
): FastifyPluginAsync => {
  const routes: FastifyPluginAsync = async (app) => {
    app.post(
      '/account/merge-anonymous',
      {
        schema: {
          body: {
            type: 'object',
            required: ['anonymousAccessToken'],
            additionalProperties: false,
            properties: {
              anonymousAccessToken: { type: 'string', minLength: 10, maxLength: 8192 },
            },
          },
          response: {
            200: {
              type: 'object',
              additionalProperties: false,
              required: ['merged'],
              properties: {
                merged: { type: 'boolean' },
                reason: { type: 'string' },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request) => {
        // TARGET (B): must be a full, non-anonymous account.
        const target = await requireFullUser(request, dependencies.authenticateUser);

        const { anonymousAccessToken } = request.body as { anonymousAccessToken: string };

        if (!supabaseAuthClient || !supabaseAdmin) {
          throw new HttpError('Service unavailable.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
          });
        }

        // Verify the SOURCE token + confirm it really is an anonymous user.
        const {
          data: { user: anonUser },
          error: anonError,
        } = await supabaseAuthClient.auth.getUser(anonymousAccessToken);

        if (anonError || !anonUser) {
          throw new HttpError('Invalid anonymous session.', {
            statusCode: 401,
            code: 'UNAUTHORIZED',
          });
        }

        // Only anonymous→account merges. A non-anonymous source token must never
        // be re-parented away from its owner.
        if (anonUser.is_anonymous !== true) {
          return { merged: false, reason: 'source_not_anonymous' };
        }

        if (anonUser.id === target.id) {
          return { merged: false, reason: 'same_user' };
        }

        const { data, error: rpcError } = await supabaseAdmin.rpc('merge_anonymous_account', {
          p_anon_id: anonUser.id,
          p_target_id: target.id,
        });

        if (rpcError) {
          captureServerException(rpcError, { route: 'merge-anonymous', targetId: target.id });
          throw new HttpError('Account merge failed.', {
            statusCode: 502,
            code: 'UPSTREAM_ERROR',
            details: [rpcError.message],
          });
        }

        const result = (data ?? {}) as { merged?: boolean; reason?: string };
        return {
          merged: result.merged === true,
          ...(result.reason ? { reason: result.reason } : {}),
        };
      },
    );
  };

  return routes;
};
