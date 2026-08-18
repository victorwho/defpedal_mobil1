const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_LIMIT = 100;

export interface PushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, unknown>;
  readonly categoryId?: string;
  readonly sound?: 'default' | null;
  readonly badge?: number;
}

interface PushTicket {
  readonly id?: string;
  readonly status: 'ok' | 'error';
  readonly message?: string;
  readonly details?: { error?: string };
}

interface PushReceipt {
  readonly status: 'ok' | 'error';
  readonly message?: string;
  readonly details?: { error?: string };
}

/**
 * Structured result of a single send (review 2026-06-12). Previously the send
 * functions collapsed EVERY outcome to `string | null`, discarding the
 * in-ticket `DeviceNotRegistered` error — the cheapest possible signal that a
 * token is dead. Callers now get the token back plus the Expo error code so
 * they can prune dead `push_tokens` rows immediately and log throttling
 * (e.g. MessageRateExceeded) instead of silently dropping it.
 */
export interface PushSendResult {
  /** The Expo push token this result is for (so callers can prune it). */
  readonly token: string;
  /** Expo ticket id when the message was accepted for delivery, else null. */
  readonly ticketId: string | null;
  /**
   * Expo error code when the send-response ticket reported status='error'
   * (e.g. 'DeviceNotRegistered', 'MessageRateExceeded'), or a synthetic
   * 'transport_error' for non-200 / network failures. Undefined on success.
   */
  readonly errorCode?: string;
}

/** True when an Expo error code means the token will never deliver again. */
export const isDeadTokenError = (errorCode: string | undefined): boolean =>
  errorCode === 'DeviceNotRegistered';

const parseTicket = (token: string, ticket: PushTicket | undefined): PushSendResult => {
  if (ticket?.status === 'ok' && ticket.id) {
    return { token, ticketId: ticket.id };
  }
  return { token, ticketId: null, errorCode: ticket?.details?.error ?? 'send_rejected' };
};

/**
 * Send a single push notification via Expo Push API. Returns a structured
 * result; never throws.
 */
export const sendPushNotification = async (
  message: PushMessage,
): Promise<PushSendResult> => {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        categoryId: message.categoryId,
        sound: message.sound ?? 'default',
        badge: message.badge,
      }),
    });

    if (!response.ok) {
      return { token: message.to, ticketId: null, errorCode: `http_${response.status}` };
    }

    const result: { data?: PushTicket } = await response.json();
    return parseTicket(message.to, result?.data);
  } catch {
    return { token: message.to, ticketId: null, errorCode: 'transport_error' };
  }
};

/**
 * Send a batch of push notifications (up to 100 per call). Returns one
 * structured result per input message, in order; never throws.
 */
export const sendBatchPushNotifications = async (
  messages: readonly PushMessage[],
): Promise<PushSendResult[]> => {
  const results: PushSendResult[] = [];

  for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
    const batch = messages.slice(i, i + BATCH_LIMIT);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data ?? {},
          sound: m.sound ?? 'default',
        }))),
      });

      if (!response.ok) {
        results.push(
          ...batch.map((m) => ({
            token: m.to,
            ticketId: null,
            errorCode: `http_${response.status}`,
          })),
        );
        continue;
      }

      const result: { data?: PushTicket[] } = await response.json();
      const tickets = result?.data ?? [];

      batch.forEach((m, idx) => {
        results.push(parseTicket(m.to, tickets[idx]));
      });
    } catch {
      results.push(
        ...batch.map((m) => ({ token: m.to, ticketId: null, errorCode: 'transport_error' })),
      );
    }
  }

  return results;
};

/** Outcome of one receipt-polling pass. */
export interface ReceiptCheckResult {
  /** Tokens whose receipt reported `DeviceNotRegistered` — delete these. */
  readonly deadTokens: string[];
  /**
   * Ticket ids Expo actually returned a receipt for. Callers use this to
   * distinguish "resolved, safe to forget" from "not ready yet, ask again":
   * Expo omits ids whose receipt has not been generated, and dropping those
   * would silently discard the very failures this poll exists to catch.
   */
  readonly resolvedIds: string[];
}

/**
 * Poll Expo for delivery receipts. Takes a ticketId→token map, which the caller
 * persists at send time in `push_receipts` — a receipt is keyed by TICKET ID and
 * does not carry the token, so without that table a receipt cannot be resolved
 * back to the `push_tokens` row it condemns.
 *
 * This is the DELAYED half of dead-token pruning. The immediate half (the
 * in-ticket `DeviceNotRegistered` at accept time) is handled inline by
 * `notifications.ts` / `nudges/dispatcher.ts`; the receipt catches tokens that
 * are accepted and then rejected minutes later at the FCM/APNs hop, which the
 * inline path structurally cannot see.
 *
 * Fixed 2026-06-12: the original pushed `receipt.message` (a human-readable
 * sentence) instead of a token, so it could never have pruned anything.
 * Wired 2026-08-18 (audit SCALE-18) — before that it had zero callers.
 */
export const checkReceipts = async (
  ticketIdToToken: Readonly<Record<string, string>>,
): Promise<ReceiptCheckResult> => {
  const deadTokens: string[] = [];
  const resolvedIds: string[] = [];
  const ids = Object.keys(ticketIdToToken);
  if (ids.length === 0) return { deadTokens, resolvedIds };

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) return { deadTokens, resolvedIds };

    const result: { data?: Record<string, PushReceipt> } = await response.json();
    const receipts = result?.data ?? {};

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      resolvedIds.push(ticketId);
      if (receipt.status === 'error' && isDeadTokenError(receipt.details?.error)) {
        const token = ticketIdToToken[ticketId];
        if (token) deadTokens.push(token);
      }
    }
  } catch {
    // Ignore receipt check failures — non-fatal. Nothing is marked resolved, so
    // the rows stay queued and the next pass retries them.
  }

  return { deadTokens, resolvedIds };
};
