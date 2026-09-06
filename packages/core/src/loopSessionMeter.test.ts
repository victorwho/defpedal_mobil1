import { describe, expect, it } from 'vitest';

import {
  acknowledgeLoopSessions,
  beginLoopSession,
  DEFAULT_LOOP_SESSION_METER,
  isLoopSessionActive,
  LOOP_SESSION_WINDOW_MS,
  loopSessionPeriodKey,
  loopSessionRemainingMs,
  loopSessionsRemaining,
  loopSessionsUsed,
  mergeLoopSessionMeters,
  normalizeLoopMeterForPeriod,
  type LoopSessionMeterState,
} from './loopSessionMeter';

const PERIOD = '2026-09';
const AT = '2026-09-06T10:00:00.000Z';
const plus = (ms: number): string =>
  new Date(new Date(AT).getTime() + ms).toISOString();

const meter = (over: Partial<LoopSessionMeterState> = {}): LoopSessionMeterState => ({
  ...DEFAULT_LOOP_SESSION_METER,
  periodKey: PERIOD,
  ...over,
});

describe('loopSessionPeriodKey', () => {
  it('buckets by the rider s own calendar month, not UTC', () => {
    // 01:30 on the 1st in Bucharest is still 22:30 on the 31st in UTC.
    expect(
      loopSessionPeriodKey('2026-09-30T22:30:00.000Z', 'Europe/Bucharest'),
    ).toBe('2026-10');
    expect(loopSessionPeriodKey('2026-09-30T22:30:00.000Z', 'UTC')).toBe('2026-09');
  });

  it('falls back to UTC for an unknown timezone rather than throwing', () => {
    expect(loopSessionPeriodKey(AT, 'Mars/Olympus')).toBe('2026-09');
  });
});

describe('session window', () => {
  it('reports no session when none has been opened', () => {
    expect(isLoopSessionActive(meter(), AT, PERIOD)).toBe(false);
  });

  it('stays open for the full window', () => {
    const state = meter({ sessionStartedAt: AT });
    expect(isLoopSessionActive(state, plus(0), PERIOD)).toBe(true);
    expect(
      isLoopSessionActive(state, plus(LOOP_SESSION_WINDOW_MS - 1_000), PERIOD),
    ).toBe(true);
  });

  it('closes exactly at the window edge', () => {
    const state = meter({ sessionStartedAt: AT });
    expect(isLoopSessionActive(state, plus(LOOP_SESSION_WINDOW_MS), PERIOD)).toBe(
      false,
    );
  });

  it('cannot straddle a quota reset', () => {
    const state = meter({ periodKey: '2026-08', sessionStartedAt: AT });
    expect(isLoopSessionActive(state, plus(60_000), PERIOD)).toBe(false);
  });

  it('treats a stamp in the future as open rather than charging twice', () => {
    // Device clocks drift and get corrected mid-session.
    const state = meter({ sessionStartedAt: plus(5 * 60_000) });
    expect(isLoopSessionActive(state, AT, PERIOD)).toBe(true);
  });

  it('is closed for an unparseable stamp', () => {
    expect(
      isLoopSessionActive(meter({ sessionStartedAt: 'not-a-date' }), AT, PERIOD),
    ).toBe(false);
  });

  it('counts down the remaining window', () => {
    const state = meter({ sessionStartedAt: AT });
    expect(loopSessionRemainingMs(state, plus(0), PERIOD)).toBe(
      LOOP_SESSION_WINDOW_MS,
    );
    expect(loopSessionRemainingMs(state, plus(600_000), PERIOD)).toBe(
      LOOP_SESSION_WINDOW_MS - 600_000,
    );
  });

  it('reports zero remaining once the window has closed', () => {
    const state = meter({ sessionStartedAt: AT });
    expect(
      loopSessionRemainingMs(state, plus(LOOP_SESSION_WINDOW_MS + 1), PERIOD),
    ).toBe(0);
  });
});

describe('beginLoopSession', () => {
  it('charges one session and stamps the window', () => {
    const next = beginLoopSession(meter(), PERIOD, AT);
    expect(next.pendingCount).toBe(1);
    expect(next.sessionStartedAt).toBe(AT);
  });

  it('is idempotent inside an open window', () => {
    // The caller invokes this on every drawn loop; only the first may charge.
    const first = beginLoopSession(meter(), PERIOD, AT);
    const second = beginLoopSession(first, PERIOD, plus(60_000));
    const third = beginLoopSession(second, PERIOD, plus(20 * 60_000));
    expect(third.pendingCount).toBe(1);
    expect(third.sessionStartedAt).toBe(AT);
  });

  it('charges again once the window has expired', () => {
    const first = beginLoopSession(meter(), PERIOD, AT);
    const later = beginLoopSession(
      first,
      PERIOD,
      plus(LOOP_SESSION_WINDOW_MS + 1_000),
    );
    expect(later.pendingCount).toBe(2);
    expect(later.sessionStartedAt).toBe(plus(LOOP_SESSION_WINDOW_MS + 1_000));
  });

  it('rolls the month over before charging', () => {
    const stale = meter({ periodKey: '2026-08', syncedCount: 3, pendingCount: 0 });
    const next = beginLoopSession(stale, PERIOD, AT);
    expect(next.periodKey).toBe(PERIOD);
    expect(next.syncedCount).toBe(0);
    expect(next.pendingCount).toBe(1);
  });

  it('does not mutate the input state', () => {
    const state = meter();
    beginLoopSession(state, PERIOD, AT);
    expect(state.pendingCount).toBe(0);
    expect(state.sessionStartedAt).toBeNull();
  });
});

describe('quota', () => {
  it('sums synced and pending sessions', () => {
    expect(loopSessionsUsed(meter({ syncedCount: 1, pendingCount: 2 }), PERIOD)).toBe(
      3,
    );
  });

  it('ignores a tally from a month that has already rolled', () => {
    expect(
      loopSessionsUsed(meter({ periodKey: '2026-08', syncedCount: 3 }), PERIOD),
    ).toBe(0);
  });

  it('reports infinity for an unmetered tier', () => {
    expect(loopSessionsRemaining(meter({ syncedCount: 99 }), PERIOD, null)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('never reports negative remaining', () => {
    expect(loopSessionsRemaining(meter({ syncedCount: 10 }), PERIOD, 3)).toBe(0);
  });

  it('clears the open session when the month rolls', () => {
    const rolled = normalizeLoopMeterForPeriod(
      meter({ periodKey: '2026-08', sessionStartedAt: AT, pendingCount: 2 }),
      PERIOD,
    );
    expect(rolled.sessionStartedAt).toBeNull();
    expect(rolled.pendingCount).toBe(0);
  });
});

describe('server reconciliation', () => {
  it('moves pending sessions into synced', () => {
    const next = acknowledgeLoopSessions(meter({ pendingCount: 2 }), 2);
    expect(next.syncedCount).toBe(2);
    expect(next.pendingCount).toBe(0);
  });

  it('cannot be driven negative by a double acknowledgement', () => {
    const once = acknowledgeLoopSessions(meter({ pendingCount: 1 }), 1);
    const twice = acknowledgeLoopSessions(once, 1);
    expect(twice.pendingCount).toBe(0);
    expect(twice.syncedCount).toBe(1);
  });

  it('never lowers a count within the same month', () => {
    // Quota is monotonic — a lagging read must not hand back allowance.
    const merged = mergeLoopSessionMeters(
      meter({ syncedCount: 2, pendingCount: 1 }),
      meter({ syncedCount: 1 }),
    );
    expect(merged.syncedCount).toBe(2);
    expect(merged.pendingCount).toBe(1);
  });

  it('keeps the open session local across a merge', () => {
    const merged = mergeLoopSessionMeters(
      meter({ sessionStartedAt: AT }),
      meter({ sessionStartedAt: null, syncedCount: 1 }),
    );
    expect(merged.sessionStartedAt).toBe(AT);
  });

  it('drops pending sessions from a month that has already rolled', () => {
    // Charging in October for an unsynced September session is a bug to the
    // only person who can see it.
    const merged = mergeLoopSessionMeters(
      meter({ periodKey: '2026-09', pendingCount: 2 }),
      meter({ periodKey: '2026-10', syncedCount: 0 }),
    );
    expect(merged.periodKey).toBe('2026-10');
    expect(merged.pendingCount).toBe(0);
  });

  it('keeps local state when the device has already rolled ahead', () => {
    const merged = mergeLoopSessionMeters(
      meter({ periodKey: '2026-10', pendingCount: 1 }),
      meter({ periodKey: '2026-09', syncedCount: 3 }),
    );
    expect(merged.periodKey).toBe('2026-10');
    expect(merged.pendingCount).toBe(1);
  });
});
