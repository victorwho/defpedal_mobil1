// @vitest-environment node
/**
 * Unit tests for the Supabase branch of `startTripRecord`.
 *
 * Same reason `submissions.hazardInsert.test.ts` exists: `submissions.test.ts`
 * mocks `supabaseAdmin` as null and only reaches the in-memory fallback, so it
 * can never see the row actually written. The upsert payload is exactly where
 * the planned route (migration 202609100001) lands, and a dropped column is
 * invisible at every other layer — typecheck passes, the request succeeds, and
 * the route is simply gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type UpsertRow = Record<string, unknown>;

const upsertRows: UpsertRow[] = [];

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockImplementation((rows: UpsertRow[]) => {
        upsertRows.push(rows[0]!);
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'trip-1' }, error: null }),
          }),
        };
      }),
    }),
  },
}));

import { startTripRecord } from './submissions';

const baseRequest = {
  clientTripId: 'ct-1',
  sessionId: 's-1',
  startLocationText: 'Home',
  startCoordinate: { lat: 44.4, lon: 26.1 },
  destinationText: 'Work',
  destinationCoordinate: { lat: 44.5, lon: 26.2 },
  distanceMeters: 5000,
  startedAt: '2026-09-10T08:00:00.000Z',
};

describe('startTripRecord — planned route captured at start', () => {
  beforeEach(() => {
    upsertRows.length = 0;
  });

  it('writes the planned route when the client sends one', async () => {
    await startTripRecord(
      {
        ...baseRequest,
        plannedRoutePolyline6: 'abc123',
        plannedRouteDistanceMeters: 5123,
        routingMode: 'safe',
      },
      'user-1',
    );

    expect(upsertRows[0]).toMatchObject({
      planned_route_polyline6: 'abc123',
      planned_route_distance_meters: 5123,
      routing_mode: 'safe',
    });
  });

  /**
   * The point of the feature: a trips row alone must be able to draw the map,
   * so the geometry has to be on the row written at START, not only on the
   * trip_tracks row written at END.
   */
  it('puts the route on the trips row, not somewhere it needs the track to survive', async () => {
    await startTripRecord(
      { ...baseRequest, plannedRoutePolyline6: 'geom', routingMode: 'flat' },
      'user-1',
    );
    expect(Object.keys(upsertRows[0]!)).toContain('planned_route_polyline6');
    expect(upsertRows[0]).toMatchObject({ end_reason: 'in_progress' });
  });

  /**
   * This is an UPSERT on (user_id, client_trip_id) — a retry from the offline
   * queue replays it. Sending explicit nulls keeps an old client honest rather
   * than leaving a stale value behind from a previous attempt.
   */
  it('sends explicit nulls for an old client rather than omitting the keys', async () => {
    await startTripRecord(baseRequest, 'user-1');
    expect(upsertRows[0]).toMatchObject({
      planned_route_polyline6: null,
      planned_route_distance_meters: null,
      routing_mode: null,
    });
  });

  it('still returns the trip id the queue needs to resolve', async () => {
    const result = await startTripRecord(baseRequest, 'user-1');
    expect(result).toMatchObject({ clientTripId: 'ct-1', tripId: 'trip-1' });
  });
});
