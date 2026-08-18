// Durable half of flat-route metering. The device counts locally; this makes
// the count survive a reinstall. What matters most here is that a failed write
// is reported as a failure — acknowledging rides that were never recorded would
// hand the rider free quota every time the network hiccuped.
import { beforeEach, describe, expect, it } from 'vitest';

import { isValidPeriodKey, reconcileFlatRouteMeter } from './usageMeters';

const USER = 'user-1';

let upserts: Array<Record<string, unknown>> = [];

interface Config {
  existing?: number | null;
  readError?: boolean;
  upsertError?: boolean;
  readThrows?: boolean;
}

const makeDb = (c: Config = {}) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => {
              if (c.readThrows) throw new Error('boom');
              if (c.readError) return Promise.resolve({ data: null, error: { message: 'x' } });
              return Promise.resolve({
                data: c.existing === undefined ? null : { count: c.existing },
                error: null,
              });
            },
          }),
        }),
      }),
    }),
    upsert: (row: Record<string, unknown>) => {
      upserts.push(row);
      return Promise.resolve({ error: c.upsertError ? { message: 'x' } : null });
    },
  }),
});

beforeEach(() => {
  upserts = [];
});

describe('isValidPeriodKey', () => {
  it.each(['2026-08', '2026-01', '2099-12'])('accepts %s', (k) => {
    expect(isValidPeriodKey(k)).toBe(true);
  });

  it.each(['2026-8', '26-08', '2026-13-01', 'nope', '', null, 5])('rejects %s', (k) => {
    expect(isValidPeriodKey(k)).toBe(false);
  });
});

describe('reconcileFlatRouteMeter', () => {
  it('adds pending rides to an existing count', async () => {
    const r = await reconcileFlatRouteMeter(makeDb({ existing: 1 }), USER, '2026-08', 2);
    expect(r).toEqual({ periodKey: '2026-08', total: 3, accepted: 2 });
    expect(upserts[0]).toMatchObject({ count: 3, period_key: '2026-08', meter: 'flat_route' });
  });

  it('starts from zero when there is no row yet', async () => {
    const r = await reconcileFlatRouteMeter(makeDb(), USER, '2026-08', 2);
    expect(r).toMatchObject({ total: 2, accepted: 2 });
  });

  it('is a read-only no-op for zero pending', async () => {
    const r = await reconcileFlatRouteMeter(makeDb({ existing: 3 }), USER, '2026-08', 0);
    expect(r).toEqual({ periodKey: '2026-08', total: 3, accepted: 0 });
    expect(upserts).toHaveLength(0);
  });

  it('never refunds quota on a negative pending', async () => {
    const r = await reconcileFlatRouteMeter(makeDb({ existing: 3 }), USER, '2026-08', -5);
    expect(r).toMatchObject({ total: 3, accepted: 0 });
    expect(upserts).toHaveLength(0);
  });

  it('clamps an absurd pending so the counter cannot be poisoned', async () => {
    const r = await reconcileFlatRouteMeter(makeDb({ existing: 0 }), USER, '2026-08', 10_000, 50);
    expect(r).toMatchObject({ total: 50, accepted: 50 });
  });

  it('truncates a fractional pending', async () => {
    const r = await reconcileFlatRouteMeter(makeDb({ existing: 0 }), USER, '2026-08', 2.9);
    expect(r).toMatchObject({ accepted: 2 });
  });

  it('rejects a malformed period key without writing', async () => {
    expect(await reconcileFlatRouteMeter(makeDb(), USER, '2026-8', 1)).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it('reports failure when the write fails, so the device retries', async () => {
    // Returning success here would clear the device's pending count for rides
    // the server never recorded — free quota on every transient error.
    expect(await reconcileFlatRouteMeter(makeDb({ upsertError: true }), USER, '2026-08', 2)).toBeNull();
  });

  it('reports failure when the current count cannot be read', async () => {
    expect(await reconcileFlatRouteMeter(makeDb({ readError: true }), USER, '2026-08', 2)).toBeNull();
  });

  it('reports failure rather than throwing when the read throws', async () => {
    expect(await reconcileFlatRouteMeter(makeDb({ readThrows: true }), USER, '2026-08', 1)).toBeNull();
  });
});
