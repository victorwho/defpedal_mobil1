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
 * Send a single push notification via Expo Push API.
 * Returns the ticket ID on success, null on failure.
 */
export const sendPushNotification = async (
  message: PushMessage,
): Promise<string | null> => {
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

    if (!response.ok) return null;

    const result = await response.json();
    const ticket = result?.data as PushTicket | undefined;

    if (ticket?.status === 'ok' && ticket.id) {
      return ticket.id;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Send a batch of push notifications (up to 100 per call).
 * Returns an array of ticket IDs (null for failures).
 */
export const sendBatchPushNotifications = async (
  messages: readonly PushMessage[],
): Promise<(string | null)[]> => {
  const results: (string | null)[] = [];

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
        results.push(...batch.map(() => null));
        continue;
      }

      const result = await response.json();
      const tickets = (result?.data ?? []) as PushTicket[];

      for (const ticket of tickets) {
        results.push(ticket.status === 'ok' ? (ticket.id ?? null) : null);
      }
    } catch {
      results.push(...batch.map(() => null));
    }
  }

  return results;
};

/**
 * Check receipts for sent notifications. Returns invalid token expo push tokens
 * that should be removed from the database.
 */
export const checkReceipts = async (
  ticketIds: readonly string[],
): Promise<string[]> => {
  const invalidTokens: string[] = [];

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!response.ok) return invalidTokens;

    const result = await response.json();
    const receipts = (result?.data ?? {}) as Record<string, PushReceipt>;

    for (const [, receipt] of Object.entries(receipts)) {
      if (
        receipt.status === 'error' &&
        receipt.details?.error === 'DeviceNotRegistered'
      ) {
        // The token is no longer valid
        invalidTokens.push(receipt.message ?? '');
      }
    }
  } catch {
    // Ignore receipt check failures
  }

  return invalidTokens;
};
