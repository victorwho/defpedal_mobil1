// Audit 2026-07-05 PERF-4: the weekly impact cron used to run 1 + 2N
// sequential Supabase queries (a ride-count probe + a notification-cap probe
// PER opted-in user). These tests pin the batched shape: the gate queries are
// grouped, so their count stays constant regardless of how many users opt in.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chainable Supabase mock that records every from(table) call and resolves a
// configurable result per table.
// ---------------------------------------------------------------------------

const fromCalls: string[] = [];
const resultsByTable: Record<string, { data: unknown; error: null; count?: number }> = {};

const makeChain = (table: string) => {
  const result = () => resultsByTable[table] ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (v: unknown) => unknown,
  ) => Promise.resolve(result()).then(resolve, reject);
  return chain;
};

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      fromCalls.push(table);
      return makeChain(table);
    },
  },
}));

const dispatchSpy = vi.fn().mockResolvedValue(undefined);
vi.mock('./notifications', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchSpy(...args),
}));

import { sendWeeklyImpactSummary } from './scheduledNotifications';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as never;

const makeUsers = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    total_co2_saved_kg: 0,
    total_money_saved_eur: 0,
    quiet_hours_start: null,
    quiet_hours_end: null,
    quiet_hours_timezone: null,
  }));

describe('sendWeeklyImpactSummary (batched gates)', () => {
  beforeEach(() => {
    fromCalls.length = 0;
    dispatchSpy.mockClear();
    for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
  });

  it('gate query count is constant regardless of opted-in user count', async () => {
    const users = makeUsers(50);
    resultsByTable.profiles = { data: users, error: null };
    // Nobody rode this week → everyone skipped, zero per-user follow-ups.
    resultsByTable.ride_impacts = { data: [], error: null };
    resultsByTable.notification_log = { data: [], error: null };

    const result = await sendWeeklyImpactSummary(logger);

    expect(result).toEqual({ sent: 0, skipped: 50 });
    // ONE grouped query per gate (≤500 users fits one chunk) — not one per user.
    expect(fromCalls.filter((t) => t === 'ride_impacts')).toHaveLength(1);
    expect(fromCalls.filter((t) => t === 'notification_log')).toHaveLength(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('sends to riders under the cap and skips riders over it', async () => {
    const users = makeUsers(3);
    resultsByTable.profiles = { data: users, error: null };
    resultsByTable.ride_impacts = {
      data: [
        // user 0: two rides this week
        { user_id: users[0].id, co2_saved_kg: 1.2, money_saved_eur: 3.5 },
        { user_id: users[0].id, co2_saved_kg: 0.8, money_saved_eur: 2.5 },
        // user 1: one ride but will be over the weekly cap
        { user_id: users[1].id, co2_saved_kg: 0.5, money_saved_eur: 1.0 },
        // user 2: no rides
      ],
      error: null,
    };
    resultsByTable.notification_log = {
      data: [
        // user 1 already got 3 sends this week → capped out
        { user_id: users[1].id },
        { user_id: users[1].id },
        { user_id: users[1].id },
      ],
      error: null,
    };
    // Per-sent-user suffix lookups resolve empty (optional data).
    resultsByTable.hazards = { data: [], error: null };
    resultsByTable.trip_shares = { data: [], error: null };
    resultsByTable.leaderboard_snapshots = { data: [], error: null };

    const result = await sendWeeklyImpactSummary(logger);

    expect(result).toEqual({ sent: 1, skipped: 2 });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [userId, category, payload] = dispatchSpy.mock.calls[0] as [string, string, { body: string }];
    expect(userId).toBe(users[0].id);
    expect(category).toBe('system');
    expect(payload.body).toContain('2.0 kg CO2');
    expect(payload.body).toContain('2 rides');
  });
});
