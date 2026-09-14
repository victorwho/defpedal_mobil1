import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const selectChain = vi.fn();

vi.mock('./supabaseAdmin', () => ({
  get supabaseAdmin() {
    return {
      from: () => ({
        insert: insertMock,
        select: selectChain,
      }),
    };
  },
}));

import { PLAN_DEDUPE_WINDOW_MS, recordPlannedRoute } from './plannedRoutes';

/** Build the `.select().eq().eq().gte().limit()` chain PostgREST exposes. */
const mockLookup = (result: { data: unknown[] | null; error: unknown }) => {
  const limit = vi.fn().mockResolvedValue(result);
  const gte = vi.fn(() => ({ limit }));
  const eq2 = vi.fn(() => ({ gte }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  selectChain.mockReturnValue({ eq: eq1 });
  return { eq1, eq2, gte, limit };
};

describe('recordPlannedRoute', () => {
  beforeEach(() => {
    insertMock.mockReset();
    selectChain.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it('records a plan that has not been seen inside the window', async () => {
    mockLookup({ data: [], error: null });

    const result = await recordPlannedRoute(
      { lat: 45.657, lon: 25.601, routingMode: 'safe', distanceMeters: 8200, dedupeKey: 'k1' },
      'user-1',
    );

    expect(result).toEqual({ recorded: true, deduped: false });
    expect(insertMock).toHaveBeenCalledTimes(1);

    const row = insertMock.mock.calls[0][0][0];
    // Longitude first in WKT — the classic ordering bug.
    expect(row.start_location).toBe('SRID=4326;POINT(25.601 45.657)');
    expect(row.user_id).toBe('user-1');
    expect(row.routing_mode).toBe('safe');
    // Server stamps the time: a wrong device clock must not move a plan across
    // a day boundary.
    expect(row.created_at).toBeUndefined();
  });

  it('NEVER stores a destination, only the origin', async () => {
    mockLookup({ data: [], error: null });

    await recordPlannedRoute(
      { lat: 45.657, lon: 25.601, dedupeKey: '45.6570,25.6010>44.4268,26.1025' },
      'user-1',
    );

    const row = insertMock.mock.calls[0][0][0];
    const columns = Object.keys(row);
    // The privacy invariant of this table, asserted rather than trusted to
    // review: no destination, no geometry, no free text.
    expect(columns).toEqual(
      expect.arrayContaining(['user_id', 'start_location', 'routing_mode', 'distance_meters', 'dedupe_key']),
    );
    expect(columns).not.toContain('destination');
    expect(columns).not.toContain('end_location');
    expect(columns).not.toContain('geometry_polyline6');
    // The dedupe key does carry the destination, but it is opaque and is only
    // ever compared for equality — it must not be broken back out into a column.
    expect(row.start_location).not.toContain('26.1025');
  });

  it('drops a duplicate plan already recorded inside the window', async () => {
    mockLookup({ data: [{ id: 'existing' }], error: null });

    const result = await recordPlannedRoute(
      { lat: 45.657, lon: 25.601, dedupeKey: 'k1' },
      'user-1',
    );

    // This is the guard that keeps the number defensible: cycling
    // Safe/Fast/Flat refetches the preview and must not count three times.
    expect(result).toEqual({ recorded: false, deduped: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('queries the dedupe window from the supplied clock', async () => {
    const { gte } = mockLookup({ data: [], error: null });
    const now = new Date('2026-09-14T12:00:00.000Z');

    await recordPlannedRoute({ lat: 1, lon: 2, dedupeKey: 'k1' }, 'user-1', now);

    expect(gte).toHaveBeenCalledWith(
      'created_at',
      new Date(now.getTime() - PLAN_DEDUPE_WINDOW_MS).toISOString(),
    );
  });

  it('writes nothing when the dedupe lookup fails', async () => {
    mockLookup({ data: null, error: { message: 'unavailable' } });

    const result = await recordPlannedRoute(
      { lat: 45.657, lon: 25.601, dedupeKey: 'k1' },
      'user-1',
    );

    // Under-counting is recoverable; an inflated count is not. If we cannot
    // prove the plan is new, we do not write it.
    expect(result).toEqual({ recorded: false, deduped: false });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('skips the lookup entirely when no dedupe key is supplied', async () => {
    const result = await recordPlannedRoute({ lat: 45.657, lon: 25.601 }, 'user-1');

    expect(selectChain).not.toHaveBeenCalled();
    expect(result).toEqual({ recorded: true, deduped: false });
  });

  it('never throws when the insert fails', async () => {
    mockLookup({ data: [], error: null });
    insertMock.mockResolvedValue({ error: { message: 'boom' } });

    await expect(
      recordPlannedRoute({ lat: 1, lon: 2, dedupeKey: 'k1' }, 'user-1'),
    ).resolves.toEqual({ recorded: false, deduped: false });
  });

  it('never throws when the client itself rejects', async () => {
    selectChain.mockImplementation(() => {
      throw new Error('network down');
    });

    await expect(
      recordPlannedRoute({ lat: 1, lon: 2, dedupeKey: 'k1' }, 'user-1'),
    ).resolves.toEqual({ recorded: false, deduped: false });
  });
});
