// @vitest-environment node
/**
 * The Supabase branch of `getTripHistory`: history rows are trip_tracks, but
 * the planned duration is written to `trips` at START (adaptive ETA Phase 3,
 * migration 202610210001), so it is read in a second query and merged by trip
 * id. A dropped merge is invisible everywhere else. The bike is the Profile
 * bike already stored on the track (`bike_type`).
 */
import { describe, expect, it, vi } from 'vitest';

const tables: Record<string, unknown[]> = {
  trip_tracks: [
    {
      id: 'track-1',
      trip_id: 'trip-1',
      routing_mode: 'safe',
      planned_route_distance_meters: 6000,
      actual_distance_meters: 6100,
      gps_trail: [],
      end_reason: 'completed',
      started_at: '2026-10-21T08:00:00.000Z',
      ended_at: '2026-10-21T08:20:00.000Z',
      reroute_count: 0,
      bike_type: 'E-bike',
    },
    {
      id: 'track-2',
      trip_id: 'trip-2',
      routing_mode: 'safe',
      gps_trail: [],
      end_reason: 'completed',
      started_at: '2026-10-20T08:00:00.000Z',
      ended_at: '2026-10-20T08:20:00.000Z',
      reroute_count: null,
      bike_type: null,
    },
  ],
  ride_impacts: [],
  trips: [
    { id: 'trip-1', planned_route_duration_seconds: 1440 },
    { id: 'trip-2', planned_route_duration_seconds: null },
  ],
};

let tripsError: { message: string } | null = null;

const chain = (rows: unknown[], error: { message: string } | null = null) => {
  const result = Promise.resolve({ data: error ? null : rows, error });
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'in']) builder[m] = () => builder;
  builder.then = result.then.bind(result);
  return builder;
};

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => chain(tables[table] ?? [], table === 'trips' ? tripsError : null),
  },
}));

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('./sentry', () => ({ captureServerException: capture }));

import { getTripHistory } from './submissions';

describe('getTripHistory — adaptive ETA fields', () => {
  it('planned duration from trips; bike and reroute count from the track', async () => {
    const [recorded, older] = await getTripHistory('user-1');
    expect(recorded).toMatchObject({ plannedDurationSeconds: 1440, isEbike: true, rerouteCount: 0 });
    expect(older!.plannedDurationSeconds).toBeUndefined();
    expect(older!.isEbike).toBe(false); // no bike picked = a normal bike
    expect(older!.rerouteCount).toBeUndefined();
  });

  it('a failed trips read keeps history and reports it', async () => {
    tripsError = { message: 'boom' };
    const rows = await getTripHistory('user-1');
    tripsError = null;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.plannedDurationSeconds).toBeUndefined();
    expect(capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ source: 'trip_history_start_facts' }));
  });
});
