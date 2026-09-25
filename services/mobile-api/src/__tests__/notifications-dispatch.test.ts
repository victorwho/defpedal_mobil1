// @vitest-environment node
/**
 * dispatchNotification — preference-read failure must fail CLOSED.
 *
 * Regression cover for P1-4 in docs/plans/external-review-triage-2026-09-25.md.
 *
 * The category gate and the quiet-hours gate both live inside `if (prefs)`, and
 * the preferences read used to drop its Supabase `error`. So a DB blip produced
 * `prefs === null`, skipped BOTH gates, and sent the push anyway — to a rider who
 * had switched that category off, or at 03:00 inside their quiet hours. The error
 * path was less safe than the success path, which is the one shape that must
 * never happen in this file.
 *
 * These tests pin BOTH directions: a failed read must suppress, and a healthy
 * read must still deliver (so the fix cannot silently kill all notifications).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — table-aware so each query can be steered independently
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown; count?: number };

const tableResults: Record<string, QueryResult> = {};
const insertedRows: Array<{ table: string; row: Record<string, unknown> }> = [];

const resultFor = (table: string): QueryResult =>
  tableResults[table] ?? { data: null, error: null };

const makeChain = (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'limit', 'update', 'delete']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.insert = vi.fn((row: Record<string, unknown>) => {
    insertedRows.push({ table, row });
    return Promise.resolve({ data: null, error: null });
  });
  chain.single = vi.fn(() => Promise.resolve(resultFor(table)));
  // Make the chain awaitable for the non-.single() queries.
  (chain as { then?: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (v: unknown) => unknown,
  ) => Promise.resolve(resultFor(table)).then(resolve, reject);
  return chain;
};

const supabaseClient = { from: vi.fn((table: string) => makeChain(table)) };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseClient,
}));

// ---------------------------------------------------------------------------
// The delivery seam — if this is called, we sent something
// ---------------------------------------------------------------------------

const sendPushNotificationMock = vi.fn().mockResolvedValue({ ticketId: 'ticket-1' });

vi.mock('../lib/push', () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotificationMock(...args),
  isDeadTokenError: () => false,
}));

vi.mock('../lib/pushReceipts', () => ({
  recordPushTicket: vi.fn().mockResolvedValue(undefined),
}));

const { dispatchNotification } = await import('../lib/notifications');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = 'user-1';
const payload = { title: 'T', body: 'B' };

const healthyPrefs = {
  notify_weather: true,
  notify_hazard: true,
  notify_community: true,
  notify_mia: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_timezone: null,
};

const logRows = () => insertedRows.filter((r) => r.table === 'notification_log');

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  for (const key of Object.keys(tableResults)) delete tableResults[key];
  insertedRows.length = 0;
  vi.clearAllMocks();
  sendPushNotificationMock.mockResolvedValue({ ticketId: 'ticket-1' });

  // Defaults for the healthy path.
  tableResults.profiles = { data: healthyPrefs, error: null };
  tableResults.notification_log = { count: 0, error: null };
  tableResults.push_tokens = {
    data: [{ expo_push_token: 'ExponentPushToken[abc]' }],
    error: null,
  };
});

describe('dispatchNotification — preferences read', () => {
  it('SUPPRESSES when the preferences read errors, instead of sending', async () => {
    tableResults.profiles = {
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    };

    await dispatchNotification(USER, 'community', payload);

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    expect(logRows()).toHaveLength(1);
    expect(logRows()[0].row.status).toBe('suppressed');
    expect(logRows()[0].row.suppression_reason).toBe('prefs_unavailable');
  });

  it('distinguishes a missing profile row from a database failure', async () => {
    tableResults.profiles = {
      data: null,
      error: { code: 'PGRST116', message: 'Results contain 0 rows' },
    };

    await dispatchNotification(USER, 'community', payload);

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    expect(logRows()[0].row.suppression_reason).toBe('no_profile');
  });

  it('still DELIVERS on the healthy path', async () => {
    await dispatchNotification(USER, 'community', payload);

    // The whole point of pinning this: failing closed must not mean never sending.
    expect(sendPushNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('still honours an explicitly disabled category', async () => {
    tableResults.profiles = {
      data: { ...healthyPrefs, notify_community: false },
      error: null,
    };

    await dispatchNotification(USER, 'community', payload);

    expect(sendPushNotificationMock).not.toHaveBeenCalled();
    expect(logRows()[0].row.suppression_reason).toBe('category_disabled');
  });
});
