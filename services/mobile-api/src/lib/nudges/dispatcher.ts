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
  type NudgePriority,
  type NudgeTrigger,
} from '@defensivepedal/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isDeadTokenError, sendPushNotification } from '../push';

export interface DispatchRequest {
  readonly userId: string;
  readonly trigger: NudgeTrigger;
  readonly context: NudgeContext;
  readonly locale: NudgeLocale;
  readonly sassy: boolean;
  /** Push tokens for the user's devices. Caller resolves from `push_tokens`. */
  readonly pushTokens: ReadonlyArray<string>;
  /**
   * Escalated priority to record on nudge_log (e.g. city_riders_pulse P3→P2
   * on guarantee breach). Falls back to the catalog priority when absent.
   */
  readonly priorityOverride?: NudgePriority;
  /** city_riders_pulse rotation input — forwarded to pickMessage. */
  readonly sendDateISO?: string;
  /** city_riders_pulse rotation input — forwarded to pickMessage. */
  readonly recentVariantIds?: readonly string[];
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
 * Mask a push token for telemetry: keep the last 6 characters of the inner
 * id — enough to correlate against push_tokens rows, without writing full
 * send-capable tokens into analytics contexts.
 */
const maskPushToken = (token: string): string => `…${token.replace(/\]$/, '').slice(-6)}`;

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
    sendDateISO: req.sendDateISO,
    recentVariantIds: req.recentVariantIds,
  });
  const logPriority = req.priorityOverride ?? message.priority;

  // Suppression paths: write a nudge_log row + return without sending.
  if (req.outcome !== 'scheduled' && req.outcome !== 'sent') {
    const { data, error } = await db
      .from('nudge_log')
      .insert({
        user_id: req.userId,
        trigger_id: req.trigger,
        variant_id: message.variantId,
        priority: logPriority,
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
        priority: logPriority,
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

  // Insert the nudge_log row FIRST with outcome 'scheduled' (review
  // 2026-06-12 item 23): the row id must ride in the push `data` payload so
  // the mobile tap handler can POST it back to /v1/nudges/telemetry — the
  // funnel was previously dead because the row was inserted AFTER the send.
  const { data: scheduledRow } = await db
    .from('nudge_log')
    .insert({
      user_id: req.userId,
      trigger_id: req.trigger,
      variant_id: message.variantId,
      priority: logPriority,
      outcome: 'scheduled',
      context: req.context,
    })
    .select('id')
    .single();
  const nudgeLogId = (scheduledRow as { id: string } | null)?.id ?? null;

  // Send to every registered device for the user; succeed if at least one
  // ticket lands. Collect dead tokens from the in-ticket DeviceNotRegistered
  // signal so we can prune them (item 22). Track every per-token failure —
  // "sent" only means ONE token got a ticket, which is exactly how the
  // months-long InvalidCredentials outage stayed invisible (error-log #69).
  let firstTicketId: string | null = null;
  let ticketCount = 0;
  const deadTokens: string[] = [];
  const tokenErrors: Array<{ token: string; code: string }> = [];
  for (const token of req.pushTokens) {
    const result = await sendPushNotification({
      to: token,
      title: message.title,
      body: message.body,
      data: {
        type: 'nudge',
        nudgeLogId,
        triggerId: req.trigger,
        variantId: message.variantId,
        context: req.context,
      },
      categoryId: 'nudge',
    });
    if (result.ticketId) {
      ticketCount++;
      if (!firstTicketId) firstTicketId = result.ticketId;
    } else {
      tokenErrors.push({
        token: maskPushToken(result.token),
        code: result.errorCode ?? 'unknown',
      });
    }
    if (isDeadTokenError(result.errorCode)) deadTokens.push(result.token);
  }

  // Prune dead tokens immediately (item 22) — Expo throttles high-error-rate
  // senders, so stale tokens degrade delivery for every user.
  if (deadTokens.length > 0) {
    await db
      .from('push_tokens')
      .delete()
      .eq('user_id', req.userId)
      .in('expo_push_token', deadTokens);
  }

  const finalOutcome: DispatchRequest['outcome'] = firstTicketId ? 'sent' : 'expo_error';
  const now = new Date().toISOString();

  // Update the scheduled row to its final post-send state, folding the
  // per-token fan-out summary into context so a partially-failing send
  // (e.g. 1 of 4 tokens deliverable) is visible in telemetry.
  if (nudgeLogId) {
    await db
      .from('nudge_log')
      .update({
        outcome: finalOutcome,
        sent_at: finalOutcome === 'sent' ? now : null,
        expo_ticket_id: firstTicketId,
        context: {
          ...req.context,
          delivery: {
            tokens: req.pushTokens.length,
            tickets: ticketCount,
            ...(tokenErrors.length > 0 ? { errors: tokenErrors } : {}),
          },
        },
      })
      .eq('id', nudgeLogId);
  }

  return {
    nudgeLogId,
    outcome: finalOutcome,
    ticketId: firstTicketId,
    title: message.title,
    body: message.body,
    variantId: message.variantId,
  };
};
