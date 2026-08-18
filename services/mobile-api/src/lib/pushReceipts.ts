/**
 * Expo delivery-receipt polling — the delayed half of dead-token pruning.
 *
 * Audit SCALE-18: `checkReceipts` existed in `push.ts` since 2026-06-12 with
 * zero callers, because a receipt is keyed by Expo ticket id and carries no
 * token, and nothing persisted that mapping. `push_receipts` (migration
 * 202608180001) is that store; this module writes it at send time and drains it
 * on a cron.
 *
 * Why the inline prune is not enough: `DeviceNotRegistered` in the send response
 * only covers tokens Expo rejects at accept time. A token that is accepted and
 * then fails at the FCM/APNs hop is reported ONLY in the receipt, minutes later.
 * Those are invisible to the inline path, never pruned, and accumulate — and
 * Expo deprioritises senders with high error rates, so they degrade delivery for
 * every user (the reputational mechanism behind error-log #69).
 */
import { checkReceipts } from './push';

/** Supabase client surface used here (the DB schema is untyped in this repo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
type Db = any;

/** Expo keeps receipts for ~24 h; unresolved rows past that are unrecoverable. */
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
/** Give Expo time to generate the receipt before the first poll. */
export const RECEIPT_MIN_AGE_MS = 15 * 60 * 1000;
/** Expo accepts up to 1000 ids per receipt request; stay well under it. */
export const RECEIPT_BATCH_LIMIT = 300;

export interface RecordTicketInput {
  readonly ticketId: string;
  readonly userId: string;
  readonly token: string;
}

/**
 * Remember an accepted ticket so its receipt can be resolved later.
 *
 * Best-effort by design: a failure here must never break or slow a send, and a
 * lost row costs only a delayed prune.
 */
export const recordPushTicket = async (db: Db, input: RecordTicketInput): Promise<void> => {
  try {
    await db.from('push_receipts').upsert(
      {
        ticket_id: input.ticketId,
        user_id: input.userId,
        expo_push_token: input.token,
      },
      { onConflict: 'ticket_id' },
    );
  } catch {
    // Never let receipt bookkeeping affect delivery.
  }
};

export interface ProcessReceiptsResult {
  /** Rows old enough to poll that we looked at this pass. */
  readonly polled: number;
  /** Tickets Expo returned a receipt for. */
  readonly resolved: number;
  /** push_tokens rows deleted because the receipt said DeviceNotRegistered. */
  readonly pruned: number;
  /** Rows dropped unresolved because Expo no longer retains their receipt. */
  readonly expired: number;
}

/**
 * Drain one batch of due receipts.
 *
 * Ordering is deliberate: prune tokens FIRST, then delete the bookkeeping rows.
 * If the process dies in between, the row is polled again next pass and the
 * prune is idempotent — whereas the reverse order would forget a dead token.
 */
export const processPushReceipts = async (
  db: Db,
  now: Date = new Date(),
): Promise<ProcessReceiptsResult> => {
  const dueBefore = new Date(now.getTime() - RECEIPT_MIN_AGE_MS).toISOString();
  const expiredBefore = new Date(now.getTime() - RECEIPT_TTL_MS).toISOString();

  const { data: rows } = await db
    .from('push_receipts')
    .select('ticket_id, user_id, expo_push_token')
    .lte('created_at', dueBefore)
    .order('created_at', { ascending: true })
    .limit(RECEIPT_BATCH_LIMIT);

  const pending: Array<{ ticket_id: string; user_id: string; expo_push_token: string }> =
    rows ?? [];

  let pruned = 0;
  let resolved = 0;

  if (pending.length > 0) {
    const ticketToToken: Record<string, string> = {};
    const tokenToUser = new Map<string, string>();
    for (const row of pending) {
      ticketToToken[row.ticket_id] = row.expo_push_token;
      tokenToUser.set(row.expo_push_token, row.user_id);
    }

    const { deadTokens, resolvedIds } = await checkReceipts(ticketToToken);
    resolved = resolvedIds.length;

    // push_tokens is UNIQUE(user_id, device_id) — the token alone is not unique,
    // so scope every delete to its owner rather than deleting by token globally.
    for (const token of new Set(deadTokens)) {
      const userId = tokenToUser.get(token);
      if (!userId) continue;
      const { error } = await db
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('expo_push_token', token);
      if (!error) pruned += 1;
    }

    if (resolvedIds.length > 0) {
      await db.from('push_receipts').delete().in('ticket_id', resolvedIds);
    }
  }

  // Unresolved past Expo's retention window: the receipt will never arrive, so
  // holding the row forever would just grow the table.
  const { data: expiredRows } = await db
    .from('push_receipts')
    .delete()
    .lt('created_at', expiredBefore)
    .select('ticket_id');

  return {
    polled: pending.length,
    resolved,
    pruned,
    expired: (expiredRows ?? []).length,
  };
};
