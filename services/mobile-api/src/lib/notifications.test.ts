// A user with no registered device used to be logged as status='failed',
// which is indistinguishable from "Expo rejected the send". In the 30 days to
// 2026-08-17 that pinned notification_log at 2,329 failed vs 1,423 sent (~62%
// failure) when every one of those 2,329 rows was a token-less user — the same
// failed-vs-sent signal that surfaced error-log #69's months-long silent
// Android outage. These tests pin the corrected semantics:
//   suppressed + reason  -> we chose not to send (incl. no device registered)
//   failed   + errorCode -> we sent and Expo rejected it
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface LoggedRow {
  status: string;
  suppression_reason: string | null;
  expo_ticket_id: string | null;
  category: string;
}

let inserted: LoggedRow[] = [];
let prefsRow: Record<string, unknown> | null = null;
let tokenRows: Array<{ expo_push_token: string }> = [];
let sentCount = 0;

const makeChain = (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit', 'delete']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data: prefsRow, error: null });
  chain.insert = vi.fn().mockImplementation((row: LoggedRow) => {
    if (table === 'notification_log') inserted.push(row);
    return Promise.resolve({ data: null, error: null });
  });
  const result = () => {
    if (table === 'push_tokens') return { data: tokenRows, error: null };
    // notification_log head-count query backing the daily budget
    if (table === 'notification_log') return { data: [], error: null, count: sentCount };
    return { data: [], error: null };
  };
  (chain as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (v: unknown) => unknown,
  ) => Promise.resolve(result()).then(resolve, reject);
  return chain;
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => makeChain(table) }),
}));

const sendPushNotification = vi.fn();
vi.mock('./push', () => ({
  sendPushNotification: (...a: unknown[]) => sendPushNotification(...a),
  isDeadTokenError: (code?: string) => code === 'DeviceNotRegistered',
}));

import { dispatchNotification } from './notifications';

describe('dispatchNotification — notification_log semantics', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://test.local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    inserted = [];
    prefsRow = {
      notify_weather: true, notify_hazard: true, notify_community: true, notify_mia: true,
      quiet_hours_start: null, quiet_hours_end: null, quiet_hours_timezone: null,
    };
    tokenRows = [];
    sentCount = 0;
    sendPushNotification.mockReset();
  });

  afterEach(() => {
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  });

  it('logs a user with no push token as suppressed/no_push_token, never failed', async () => {
    tokenRows = [];

    await dispatchNotification('user-1', 'mia', { title: 'T', body: 'B' });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe('suppressed');
    expect(inserted[0]!.suppression_reason).toBe('no_push_token');
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it('logs a real Expo rejection as failed and records the error code', async () => {
    tokenRows = [{ expo_push_token: 'ExponentPushToken[abc]' }];
    sendPushNotification.mockResolvedValue({
      token: 'ExponentPushToken[abc]', ticketId: null, errorCode: 'InvalidCredentials',
    });

    await dispatchNotification('user-2', 'mia', { title: 'T', body: 'B' });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.status).toBe('failed');
    expect(inserted[0]!.suppression_reason).toBe('InvalidCredentials');
    expect(inserted[0]!.expo_ticket_id).toBeNull();
  });

  it('falls back to unknown_error when Expo fails without a code', async () => {
    tokenRows = [{ expo_push_token: 'ExponentPushToken[abc]' }];
    sendPushNotification.mockResolvedValue({
      token: 'ExponentPushToken[abc]', ticketId: null, errorCode: undefined,
    });

    await dispatchNotification('user-3', 'mia', { title: 'T', body: 'B' });

    expect(inserted[0]!.status).toBe('failed');
    expect(inserted[0]!.suppression_reason).toBe('unknown_error');
  });

  it('logs a successful send as sent with the ticket and no reason', async () => {
    tokenRows = [{ expo_push_token: 'ExponentPushToken[abc]' }];
    sendPushNotification.mockResolvedValue({
      token: 'ExponentPushToken[abc]', ticketId: 'ticket-1', errorCode: undefined,
    });

    await dispatchNotification('user-4', 'mia', { title: 'T', body: 'B' });

    expect(inserted[0]!.status).toBe('sent');
    expect(inserted[0]!.expo_ticket_id).toBe('ticket-1');
    expect(inserted[0]!.suppression_reason).toBeNull();
  });

  it('still labels the pre-send gates distinctly (category_disabled)', async () => {
    prefsRow = {
      notify_weather: true, notify_hazard: true, notify_community: true, notify_mia: false,
      quiet_hours_start: null, quiet_hours_end: null, quiet_hours_timezone: null,
    };

    await dispatchNotification('user-5', 'mia', { title: 'T', body: 'B' });

    expect(inserted[0]!.status).toBe('suppressed');
    expect(inserted[0]!.suppression_reason).toBe('category_disabled');
  });
});
