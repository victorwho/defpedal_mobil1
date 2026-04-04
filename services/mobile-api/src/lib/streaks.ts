import type { FastifyRequest } from 'fastify';

import { supabaseAdmin } from './supabaseAdmin';

/**
 * Extract timezone from x-timezone header, default to UTC.
 */
export const getTimezone = (request: FastifyRequest): string =>
  (request.headers['x-timezone'] as string | undefined) ?? 'UTC';

/**
 * Fire-and-forget: call qualify_streak_action RPC.
 * Failures are logged but never propagate to the caller.
 */
export const qualifyStreakAsync = (
  userId: string,
  actionType: string,
  timeZone: string,
  logger: FastifyRequest['log'],
): void => {
  if (!supabaseAdmin) return;
  void supabaseAdmin
    .rpc('qualify_streak_action', {
      p_user_id: userId,
      p_action_type: actionType,
      p_time_zone: timeZone,
    })
    .then(({ error }) => {
      if (error) {
        logger.warn(
          { event: 'streak_qualify_error', actionType, error: error.message },
          'streak qualification failed',
        );
      }
    });
};
