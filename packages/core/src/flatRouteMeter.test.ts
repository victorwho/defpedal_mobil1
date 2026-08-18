import { describe, expect, it } from 'vitest';

import {
  acknowledgeFlatRoutes,
  consumeFlatRoute,
  DEFAULT_FLAT_ROUTE_METER,
  flatRoutePeriodKey,
  flatRoutesRemaining,
  flatRoutesUsed,
  mergeFlatRouteMeters,
  normalizeMeterForPeriod,
  type FlatRouteMeterState,
} from './flatRouteMeter';

const meter = (overrides: Partial<FlatRouteMeterState> = {}): FlatRouteMeterState => ({
  ...DEFAULT_FLAT_ROUTE_METER,
  periodKey: '2026-08',
  ...overrides,
});

describe('flatRoutePeriodKey', () => {
  it('buckets an instant into YYYY-MM in UTC', () => {
    expect(flatRoutePeriodKey('2026-08-15T12:00:00.000Z', 'UTC')).toBe('2026-08');
  });

  it('uses the rider timezone, not UTC, at a month boundary', () => {
    // 12:00Z on Aug 31 is already 02:00 on Sep 1 in UTC+14.
    const instant = '2026-08-31T12:00:00.000Z';
    expect(flatRoutePeriodKey(instant, 'UTC')).toBe('2026-08');
    expect(flatRoutePeriodKey(instant, 'Pacific/Kiritimati')).toBe('2026-09');
  });

  it('bucket lags UTC for timezones behind it', () => {
    // 03:00Z on Sep 1 is still Aug 31 on the US west coast.
    const instant = '2026-09-01T03:00:00.000Z';
    expect(flatRoutePeriodKey(instant, 'UTC')).toBe('2026-09');
    expect(flatRoutePeriodKey(instant, 'America/Los_Angeles')).toBe('2026-08');
  });

  it('falls back to UTC for an unknown timezone rather than throwing', () => {
    expect(flatRoutePeriodKey('2026-08-15T12:00:00.000Z', 'Not/AZone')).toBe('2026-08');
  });

  it('returns an empty key for an unparseable timestamp', () => {
    expect(flatRoutePeriodKey('not-a-date', 'UTC')).toBe('');
  });

  it('pads single-digit months so keys sort chronologically', () => {
    expect(flatRoutePeriodKey('2026-01-05T00:00:00.000Z', 'UTC')).toBe('2026-01');
    // Lexicographic order must equal chronological order — merge relies on it.
    expect('2026-01' < '2026-09').toBe(true);
    expect('2026-09' < '2027-01').toBe(true);
  });
});

describe('flatRoutesUsed', () => {
  it('sums synced and pending within the same period', () => {
    expect(flatRoutesUsed(meter({ syncedCount: 2, pendingCount: 1 }), '2026-08')).toBe(3);
  });

  it('counts zero for a different period — quota resets by being ignored', () => {
    expect(flatRoutesUsed(meter({ syncedCount: 3, pendingCount: 2 }), '2026-09')).toBe(0);
  });

  it('treats negative counters as zero', () => {
    expect(flatRoutesUsed(meter({ syncedCount: -5, pendingCount: -1 }), '2026-08')).toBe(0);
  });
});

describe('flatRoutesRemaining', () => {
  it('returns Infinity for an unlimited tier', () => {
    const result = flatRoutesRemaining(meter({ syncedCount: 99 }), '2026-08', null);
    expect(result).toBe(Number.POSITIVE_INFINITY);
  });

  it('counts down against the limit', () => {
    expect(flatRoutesRemaining(meter({ syncedCount: 1 }), '2026-08', 3)).toBe(2);
  });

  it('never goes negative when a rider somehow overshoots', () => {
    expect(flatRoutesRemaining(meter({ syncedCount: 9 }), '2026-08', 3)).toBe(0);
  });

  it('restores the full allowance in a new period', () => {
    expect(flatRoutesRemaining(meter({ syncedCount: 3 }), '2026-09', 3)).toBe(3);
  });
});

describe('normalizeMeterForPeriod', () => {
  it('is a no-op within the same period', () => {
    const state = meter({ syncedCount: 2 });
    expect(normalizeMeterForPeriod(state, '2026-08')).toBe(state);
  });

  it('zeroes both counters on rollover', () => {
    const rolled = normalizeMeterForPeriod(meter({ syncedCount: 3, pendingCount: 1 }), '2026-09');
    expect(rolled).toEqual({ periodKey: '2026-09', syncedCount: 0, pendingCount: 0 });
  });
});

describe('consumeFlatRoute', () => {
  it('increments pending, never synced', () => {
    const next = consumeFlatRoute(meter({ syncedCount: 1 }), '2026-08');
    expect(next.pendingCount).toBe(1);
    expect(next.syncedCount).toBe(1);
  });

  it('does not mutate the input', () => {
    const before = meter({ pendingCount: 0 });
    const snapshot = { ...before };
    consumeFlatRoute(before, '2026-08');
    expect(before).toEqual(snapshot);
  });

  it('rolls the period over before counting', () => {
    const next = consumeFlatRoute(meter({ syncedCount: 3, pendingCount: 2 }), '2026-09');
    expect(next).toEqual({ periodKey: '2026-09', syncedCount: 0, pendingCount: 1 });
  });

  it('accumulates across an offline stretch', () => {
    let state = meter();
    for (let i = 0; i < 4; i += 1) state = consumeFlatRoute(state, '2026-08');
    expect(flatRoutesUsed(state, '2026-08')).toBe(4);
  });
});

describe('acknowledgeFlatRoutes', () => {
  it('moves pending into synced', () => {
    const next = acknowledgeFlatRoutes(meter({ syncedCount: 1, pendingCount: 2 }), 2);
    expect(next).toEqual({ periodKey: '2026-08', syncedCount: 3, pendingCount: 0 });
  });

  it('keeps the total stable — an ack must never change what a rider has used', () => {
    const before = meter({ syncedCount: 1, pendingCount: 2 });
    const after = acknowledgeFlatRoutes(before, 2);
    expect(flatRoutesUsed(after, '2026-08')).toBe(flatRoutesUsed(before, '2026-08'));
  });

  it('clamps an over-ack so a duplicate cannot hand out free quota', () => {
    const next = acknowledgeFlatRoutes(meter({ syncedCount: 0, pendingCount: 1 }), 5);
    expect(next).toEqual({ periodKey: '2026-08', syncedCount: 1, pendingCount: 0 });
  });

  it('ignores a non-positive ack', () => {
    const state = meter({ pendingCount: 2 });
    expect(acknowledgeFlatRoutes(state, 0)).toBe(state);
    expect(acknowledgeFlatRoutes(state, -3)).toBe(state);
  });
});

describe('mergeFlatRouteMeters', () => {
  it('keeps local pending while taking the server synced count', () => {
    const merged = mergeFlatRouteMeters(
      meter({ syncedCount: 0, pendingCount: 2 }),
      meter({ syncedCount: 1, pendingCount: 0 }),
    );
    expect(merged).toEqual({ periodKey: '2026-08', syncedCount: 1, pendingCount: 2 });
  });

  it('counts an offline ride on top of one made on another device', () => {
    // Server saw 1 ride from the tablet; this phone started 2 more offline.
    const merged = mergeFlatRouteMeters(
      meter({ syncedCount: 0, pendingCount: 2 }),
      meter({ syncedCount: 1 }),
    );
    expect(flatRoutesUsed(merged, '2026-08')).toBe(3);
  });

  it('never lowers a synced count on a lagging read', () => {
    const merged = mergeFlatRouteMeters(
      meter({ syncedCount: 3 }),
      meter({ syncedCount: 1 }),
    );
    expect(merged.syncedCount).toBe(3);
  });

  it('adopts the server period when the server has rolled over first', () => {
    const merged = mergeFlatRouteMeters(
      meter({ periodKey: '2026-08', syncedCount: 3, pendingCount: 1 }),
      meter({ periodKey: '2026-09', syncedCount: 0 }),
    );
    expect(merged).toEqual({ periodKey: '2026-09', syncedCount: 0, pendingCount: 0 });
  });

  it('drops pending rides from a month that already rolled over', () => {
    const merged = mergeFlatRouteMeters(
      meter({ periodKey: '2026-08', pendingCount: 3 }),
      meter({ periodKey: '2026-09' }),
    );
    expect(flatRoutesUsed(merged, '2026-09')).toBe(0);
  });

  it('keeps local when the device has rolled over ahead of the server', () => {
    const merged = mergeFlatRouteMeters(
      meter({ periodKey: '2026-09', syncedCount: 0, pendingCount: 1 }),
      meter({ periodKey: '2026-08', syncedCount: 3 }),
    );
    expect(merged).toEqual({ periodKey: '2026-09', syncedCount: 0, pendingCount: 1 });
  });

  it('does not mutate either input', () => {
    const local = meter({ pendingCount: 1 });
    const remote = meter({ syncedCount: 2 });
    const localBefore = { ...local };
    const remoteBefore = { ...remote };
    mergeFlatRouteMeters(local, remote);
    expect(local).toEqual(localBefore);
    expect(remote).toEqual(remoteBefore);
  });
});
