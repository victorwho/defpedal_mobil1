/**
 * Pedal Nudge — dispatcher.
 *
 * Glues together: voice rendering (`pedalVoice`), push send (`push.ts`),
 * eligibility outcome → nudge_log row write. Used by both the cron and the
 * real-time P0 event path.
 *
 * The dispatcher does NOT decide whether to send — that's the queue's job.
 * Callers pass a pre-decided trigger + context and the dispatcher executes.
 */

import {
  pickMessage,
  type NudgeContext,
  type NudgeLocale,
  type NudgeTrigger,
} from '@defensivepedal/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { sendPushNotification } from '../push';

export interface DispatchRequest {
  readonly userId: string;
  readonly trigger: NudgeTrigger;
  readonly context: NudgeContext;
  readonly locale: NudgeLocale;
  readonly sassy: boolean;
  /** Push tokens for the user's devices. Caller resolves from `push_tokens`. */
  readonly pushTokens: ReadonlyArray<string>;
  /** Outcome captured by the eligibility/queue layer. */
  readonly outcome:
    | 'scheduled'
    | 'sent'
    | 'suppressed_anonymous'
    | 'suppressed_quiet_hours'
    | 'suppressed_weather'
    | 'suppressed_sunset'
    | 'suppressed_cap'
    | 'suppressed_category_pref'
    | 'suppressed_no_token'
    | 'suppressed_qualified_already'
    | 'cancelled_kill_switch'
    | 'expo_error';
}

export interface DispatchResult {
  /** nudge_log row id created for this attempt. */
  readonly nudgeLogId: string | null;
  /** Final outcome (post-send). May differ from request.outcome if Expo fails. */
  readonly outcome: DispatchRequest['outcome'];
  readonly ticketId: string | null;
  readonly title: string;
  readonly body: string;
  readonly variantId: string;
}

/**
 * Persist a nudge_log row and (if outcome is 'sent') fire the push.
 *
 * Returns a record describing what landed. Throws only on truly unexpected
 * errors (DB write failure on a 'sent' row) — suppression outcomes complete
 * successfully without sending.
 */
export const dispatchNudge = async (
  db: SupabaseClient,
  req: DispatchRequest,
): Promise<DispatchResult> => {
  const message = pickMessage({
    trigger: req.trigger,
    locale: req.locale,
    context: req.context,
    sassy: req.sassy,
    userId: req.userId,
  });

  // Suppression paths: write a nudge_log row + return without sending.
  if (req.outcome !== 'scheduled' && req.outcome !== 'sent') {
    const { data, error } = await db
      .from('nudge_log')
      .insert({
        user_id: req.userId,
        trigger_id: req.trigger,
        variant_id: message.variantId,
        priority: message.priority,
        outcome: req.outcome,
        context: req.context,
      })
      .select('id')
      .single();
    return {
      nudgeLogId: error ? null : ((data as { id: string } | null)?.id ?? null),
      outcome: req.outcome,
      ticketId: null,
      title: message.title,
      body: message.body,
      variantId: message.variantId,
    };
  }

  // No push tokens → treat as suppression_no_token.
  if (req.pushTokens.length === 0) {
    const { data } = await db
      .from('nudge_log')
      .insert({
        user_id: req.userId,
        trigger_id: req.trigger,
        variant_id: message.variantId,
        priority: message.priority,
        outcome: 'suppressed_no_token',
        context: req.context,
      })
      .select('id')
      .single();
    return {
      nudgeLogId: (data as { id: string } | null)?.id ?? null,
      outcome: 'suppressed_no_token',
      ticketId: null,
      title: message.title,
      body: message.body,
      variantId: message.variantId,
    };
  }

  // Send to every registered device for the user; succeed if at least one ticket lands.
  let firstTicketId: string | null = null;
  for (const token of req.pushTokens) {
    const ticket = await sendPushNotification({
      to: token,
      title: message.title,
      body: message.body,
      data: {
        type: 'nudge',
        triggerId: req.trigger,
        variantId: message.variantId,
        context: req.context,
      },
      categoryId: 'nudge',
    });
    if (ticket && !firstTicketId) {
      firstTicketId = ticket;
    }
  }

  const finalOutcome: DispatchRequest['outcome'] = firstTicketId ? 'sent' : 'expo_error';
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('nudge_log')
    .insert({
      user_id: req.userId,
      trigger_id: req.trigger,
      variant_id: message.variantId,
      priority: message.priority,
      outcome: finalOutcome,
      sent_at: finalOutcome === 'sent' ? now : null,
      expo_ticket_id: firstTicketId,
      context: req.context,
    })
    .select('id')
    .single();

  if (error) {
    // The push has fired; log row failure is non-fatal but worth surfacing.
    return {
      nudgeLogId: null,
      outcome: finalOutcome,
      ticketId: firstTicketId,
      title: message.title,
      body: message.body,
      variantId: message.variantId,
    };
  }

  return {
    nudgeLogId: (data as { id: string } | null)?.id ?? null,
    outcome: finalOutcome,
    ticketId: firstTicketId,
    title: message.title,
    body: message.body,
    variantId: message.variantId,
  };
};
