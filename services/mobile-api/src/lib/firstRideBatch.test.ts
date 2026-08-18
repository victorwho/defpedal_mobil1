// The first-ride cron asked the DB ~6 times PER rider (weekly budget, three
// dedupe counts, ride count, last trip). At 687 candidates against a us-east-1
// database from europe-central2 that is ~410s of round-trips, and the job hit
// its 300s deadline and 504'd every day for 8+ days (error-log #82), always
// dying in the same prefix so the tail was never evaluated.
//
// These tests pin the batched replacements against the semantics of the
// per-user queries they replace — including the quirks, which are the parts a
// rewrite silently gets wrong.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadFirstRideLogIndex,
  loadRiderTripFacts,
  weekStart,
} from './firstRideNotifications';

let logRows: unknown[] = [];
let tripRows: unknown[] = [];
const inCalls: Array<{ table: string; ids: string[] }> = [];

const makeDb = () => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn((_col: string, ids: string[]) => {
      inCalls.push({ table, ids });
      return Promise.resolve({ data: table === 'trips' ? tripRows : logRows, error: null });
    });
    return chain;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
}) as any;

beforeEach(() => { logRows = []; tripRows = []; inCalls.length = 0; });

describe('weekStart', () => {
  it('anchors to Monday 04:00 UTC', () => {
    const wed = new Date('2026-08-19T12:00:00Z'); // Wednesday
    expect(weekStart(wed).toISOString()).toBe('2026-08-17T04:00:00.000Z');
  });

  it('rolls back a week when the instant is before Monday 04:00', () => {
    const monEarly = new Date('2026-08-17T02:00:00Z');
    expect(weekStart(monEarly).toISOString()).toBe('2026-08-10T04:00:00.000Z');
  });
});

describe('loadFirstRideLogIndex', () => {
  it('counts only sent rows inside the week for the budget', () => {
    logRows = [
      { user_id: 'u1', status: 'sent', body: 'x', created_at: '2026-08-18T09:00:00Z' },
      { user_id: 'u1', status: 'sent', body: 'x', created_at: '2026-08-10T09:00:00Z' }, // last week
      { user_id: 'u1', status: 'suppressed', body: 'x', created_at: '2026-08-18T09:00:00Z' },
    ];
    return loadFirstRideLogIndex(makeDb(), ['u1'], new Date('2026-08-19T12:00:00Z')).then((idx) => {
      expect(idx.weeklySent.get('u1')).toBe(1);
    });
  });

  it('counts dedupe markers REGARDLESS of status, matching the query it replaces', async () => {
    // The old priorSendCount had no status filter: a suppressed row still means
    // "we already tried this template". Getting this wrong would re-send.
    logRows = [
      { user_id: 'u1', status: 'suppressed', body: 'Ready for your first route?', created_at: '2026-08-18T09:00:00Z' },
    ];
    const idx = await loadFirstRideLogIndex(makeDb(), ['u1'], new Date('2026-08-19T12:00:00Z'));
    expect(idx.priorSends.get('u1|first_ride_nudge')).toBe(1);
    expect(idx.weeklySent.get('u1')).toBeUndefined();
  });

  it('matches markers case-insensitively and across locales', async () => {
    logRows = [
      { user_id: 'u1', status: 'sent', body: 'Gata pentru PRIMA TA RUTĂ?', created_at: '2026-08-18T09:00:00Z' },
      { user_id: 'u2', status: 'sent', body: '¿Listo para tu primera ruta?', created_at: '2026-08-18T09:00:00Z' },
      { user_id: 'u3', status: 'sent', body: 'been a while since your last ride', created_at: '2026-08-18T09:00:00Z' },
    ];
    const idx = await loadFirstRideLogIndex(makeDb(), ['u1', 'u2', 'u3'], new Date('2026-08-19T12:00:00Z'));
    expect(idx.priorSends.get('u1|first_ride_nudge')).toBe(1);
    expect(idx.priorSends.get('u2|first_ride_nudge')).toBe(1);
    expect(idx.priorSends.get('u3|lapsed_reengagement')).toBe(1);
  });

  it('chunks large candidate sets rather than building one enormous URL', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `u${i}`);
    await loadFirstRideLogIndex(makeDb(), ids, new Date());
    expect(inCalls.filter((c) => c.table === 'notification_log').length).toBe(3);
    expect(inCalls[0]!.ids.length).toBe(200);
  });

  it('returns empty for no candidates without querying', async () => {
    const idx = await loadFirstRideLogIndex(makeDb(), [], new Date());
    expect(idx.weeklySent.size).toBe(0);
    expect(inCalls.length).toBe(0);
  });
});

describe('loadRiderTripFacts', () => {
  it('counts every trip including in-progress ones (preserving the old query)', async () => {
    tripRows = [
      { user_id: 'u1', ended_at: '2026-08-01T10:00:00Z', start_location: 'A' },
      { user_id: 'u1', ended_at: null, start_location: 'B' },
    ];
    const facts = await loadRiderTripFacts(makeDb(), ['u1']);
    expect(facts.rideCounts.get('u1')).toBe(2);
  });

  it('picks the latest COMPLETED trip for last_ride_at + coordinates', async () => {
    tripRows = [
      { user_id: 'u1', ended_at: '2026-08-01T10:00:00Z', start_location: 'older' },
      { user_id: 'u1', ended_at: '2026-08-15T10:00:00Z', start_location: 'newest' },
      { user_id: 'u1', ended_at: null, start_location: 'in-progress' },
    ];
    const facts = await loadRiderTripFacts(makeDb(), ['u1']);
    expect(facts.lastTrips.get('u1')).toEqual({
      ended_at: '2026-08-15T10:00:00Z',
      start_location: 'newest',
    });
  });

  it('leaves a rider with only in-progress trips without a last trip', async () => {
    tripRows = [{ user_id: 'u1', ended_at: null, start_location: 'B' }];
    const facts = await loadRiderTripFacts(makeDb(), ['u1']);
    expect(facts.rideCounts.get('u1')).toBe(1);
    expect(facts.lastTrips.get('u1')).toBeUndefined();
  });
});
