// @vitest-environment node
/**
 * What `saveTripTrack` persists about the route a ride was actually on.
 *
 * `submissions.test.ts` mocks `supabaseAdmin` to null and exercises the memory
 * path, which cannot see the column payload at all — so these live in their own
 * file with a capturing upsert. The distinction they exist to protect is
 * "unknown" versus "none": `reroute_count` is nullable with no default, and a
 * `?? 0` anywhere on this path would silently assert that every ride from every
 * older client had no reroutes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsertSpy } = vi.hoisted(() => ({ upsertSpy: vi.fn() }));

vi.mock('../lib/supabaseAdmin', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.upsert = upsertSpy.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  return { supabaseAdmin: chain };
});

import { saveTripTrack } from '../lib/submissions';
import type { TripTrackRequest } from '@defensivepedal/core';

const STARTED_AT = '2026-09-15T08:00:00.000Z';
const ENDED_AT = '2026-09-15T08:40:00.000Z';

const PLANNED = 'planned_geometry_at_start';
const FINAL = 'geometry_after_reroute';

const baseRequest = (overrides: Partial<TripTrackRequest> = {}): TripTrackRequest => ({
  tripId: 'trip-1',
  clientTripId: 'client-trip-1',
  routingMode: 'safe',
  gpsBreadcrumbs: [],
  endReason: 'completed',
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  ...overrides,
});

/** The single row handed to `.upsert([...])`. */
const upsertedRow = (): Record<string, unknown> => {
  expect(upsertSpy).toHaveBeenCalledTimes(1);
  const rows = upsertSpy.mock.calls[0]![0] as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

beforeEach(() => {
  upsertSpy.mockClear();
});

describe('saveTripTrack — route provenance columns', () => {
  it('stores the route the rider set out on and the one they finished on', async () => {
    await saveTripTrack(
      baseRequest({
        plannedRoutePolyline6: PLANNED,
        plannedRouteDistanceMeters: 4200,
        finalRoutePolyline6: FINAL,
        rerouteCount: 2,
        lastRerouteAt: '2026-09-15T08:12:00.000Z',
      }),
      'user-1',
    );

    const row = upsertedRow();
    expect(row.planned_route_polyline6).toBe(PLANNED);
    expect(row.planned_route_distance_meters).toBe(4200);
    expect(row.final_route_polyline6).toBe(FINAL);
    expect(row.reroute_count).toBe(2);
    expect(row.last_reroute_at).toBe('2026-09-15T08:12:00.000Z');
  });

  it('keeps the two geometries distinct — the final route never overwrites the planned one', async () => {
    // The whole point of the change. Before it, one column held whichever
    // geometry navigation happened to be on at ride end.
    await saveTripTrack(
      baseRequest({ plannedRoutePolyline6: PLANNED, finalRoutePolyline6: FINAL, rerouteCount: 1 }),
      'user-1',
    );

    const row = upsertedRow();
    expect(row.planned_route_polyline6).not.toBe(row.final_route_polyline6);
    expect(row.planned_route_polyline6).toBe(PLANNED);
  });

  it('records 0 reroutes as 0, not null — a ride that never rerouted KNOWS that', async () => {
    await saveTripTrack(
      baseRequest({
        plannedRoutePolyline6: PLANNED,
        finalRoutePolyline6: PLANNED,
        rerouteCount: 0,
        lastRerouteAt: null,
      }),
      'user-1',
    );

    const row = upsertedRow();
    expect(row.reroute_count).toBe(0);
    expect(row.last_reroute_at).toBeNull();
    // A ride with no reroutes finished on the route it started on.
    expect(row.final_route_polyline6).toBe(row.planned_route_polyline6);
  });

  it('writes NULL — never 0 — when the client did not report a count', async () => {
    // An older client, or an offline-queued mutation built before this field
    // existed. "We do not know" and "there were none" are different facts, and
    // only NULL can say the first one.
    await saveTripTrack(baseRequest({ plannedRoutePolyline6: PLANNED }), 'user-1');

    const row = upsertedRow();
    expect(row.reroute_count).toBeNull();
    expect(row.reroute_count).not.toBe(0);
    expect(row.last_reroute_at).toBeNull();
    expect(row.final_route_polyline6).toBeNull();
  });

  it('does not invent a final route from the planned one', async () => {
    // Tempting, and wrong: without a reported count we do not know whether the
    // ride rerouted, so we cannot claim the planned route was also the final.
    await saveTripTrack(baseRequest({ plannedRoutePolyline6: PLANNED }), 'user-1');
    expect(upsertedRow().final_route_polyline6).toBeNull();
  });
});
