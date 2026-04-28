import type {
  HazardReportRequest,
  HazardReportResponse,
  NavigationFeedbackRequest,
  TripEndRequest,
  TripEndResponse,
  TripHistoryItem,
  TripStartRequest,
  TripStartResponse,
  TripStatsDashboard,
  TripTrackRequest,
  UserStats,
  WriteAckResponse,
} from '@defensivepedal/core';
import { calculateCo2SavedKg, calculateTrailDistanceMeters } from '@defensivepedal/core';

import { supabaseAdmin } from './supabaseAdmin';

const memoryTrips = new Map<
  string,
  {
    tripId: string;
    request: TripStartRequest;
    userId: string;
    endedAt?: string;
    endReason?: TripEndRequest['reason'];
  }
>();
const memoryHazards = new Map<string, { request: HazardReportRequest; userId: string | null }>();
const memoryFeedback = new Map<
  string,
  {
    request: NavigationFeedbackRequest;
    userId: string;
  }
>();

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
};

const toPointWkt = (lat: number, lon: number) => `POINT(${lon} ${lat})`;

export const submitHazardReport = async (
  request: HazardReportRequest,
  userId: string | null,
): Promise<HazardReportResponse> => {
  const reportId = createId('hazard');

  if (supabaseAdmin) {
    const now = new Date(request.reportedAt);
    // Server-side length guard. The DB has a CHECK (char_length <= 280)
    // but a truncate here keeps a misbehaving client from tripping the
    // 502 UPSTREAM_ERROR path for a cosmetic overflow.
    const trimmedDescription = request.description?.trim().slice(0, 280);
    const descriptionOrNull = trimmedDescription && trimmedDescription.length > 0
      ? trimmedDescription
      : null;

    const baseInsert = {
      user_id: userId,
      location: {
        latitude: request.coordinate.lat,
        longitude: request.coordinate.lon,
      },
      reported_at: request.reportedAt,
      day: now.toISOString().substring(0, 10),
      time_of_day: now.toTimeString().substring(0, 8),
      ...(request.source ? { source: request.source } : {}),
      ...(descriptionOrNull !== null ? { description: descriptionOrNull } : {}),
    };

    let error: { message: string } | null = null;

    if (request.hazardType) {
      const extendedInsert = {
        ...baseInsert,
        hazard_type: request.hazardType,
      };

      const extendedResult = await supabaseAdmin.from('hazards').insert([extendedInsert]);
      error = extendedResult.error;

      if (
        error &&
        /hazard_type|schema cache|column/i.test(error.message)
      ) {
        const fallbackResult = await supabaseAdmin.from('hazards').insert([baseInsert]);
        error = fallbackResult.error;
      }
    } else {
      const baseResult = await supabaseAdmin.from('hazards').insert([baseInsert]);
      error = baseResult.error;
    }

    if (error) {
      throw new Error(error.message);
    }
  } else {
    memoryHazards.set(reportId, { request, userId });
  }

  return {
    reportId,
    acceptedAt: new Date().toISOString(),
  };
};

export const startTripRecord = async (
  request: TripStartRequest,
  userId: string,
): Promise<TripStartResponse> => {
  if (supabaseAdmin) {
    // Idempotent on (user_id, client_trip_id). A retry from the offline queue
    // (timeout, kill-recovery, dropped response) returns the existing trip's
    // id instead of creating a duplicate. Migration 202604270002 enforces the
    // partial UNIQUE index that makes this safe.
    const { data, error } = await supabaseAdmin
      .from('trips')
      .upsert(
        [
          {
            user_id: userId,
            client_trip_id: request.clientTripId,
            start_location_text: request.startLocationText,
            start_location: toPointWkt(request.startCoordinate.lat, request.startCoordinate.lon),
            destination_text: request.destinationText,
            destination_location: toPointWkt(
              request.destinationCoordinate.lat,
              request.destinationCoordinate.lon,
            ),
            distance_meters: request.distanceMeters,
            started_at: request.startedAt,
            end_reason: 'in_progress',
          },
        ],
        { onConflict: 'user_id,client_trip_id' },
      )
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message ?? 'Trip start write failed.');
    }

    return {
      clientTripId: request.clientTripId,
      tripId: data.id as string,
      acceptedAt: new Date().toISOString(),
    };
  }

  const tripId = createId('trip');
  memoryTrips.set(request.clientTripId, {
    tripId,
    request,
    userId,
  });

  return {
    clientTripId: request.clientTripId,
    tripId,
    acceptedAt: new Date().toISOString(),
  };
};

export const finishTripRecord = async (
  request: TripEndRequest,
  userId: string,
): Promise<TripEndResponse> => {
  if (supabaseAdmin) {
    const mutation = supabaseAdmin
      .from('trips')
      .update({
        end_reason: request.reason,
        ended_at: request.endedAt,
      })
      .eq('id', request.tripId)
      .eq('user_id', userId);

    const { error } = await mutation;

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const memoryTrip = memoryTrips.get(request.clientTripId);

    if (memoryTrip) {
      memoryTrips.set(request.clientTripId, {
        ...memoryTrip,
        endedAt: request.endedAt,
        endReason: request.reason,
      });
    }
  }

  return {
    clientTripId: request.clientTripId,
    tripId: request.tripId,
    acceptedAt: new Date().toISOString(),
  };
};

export const submitNavigationFeedback = async (
  request: NavigationFeedbackRequest,
  userId: string,
): Promise<WriteAckResponse> => {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('navigation_feedback').insert([
      {
        session_id: request.sessionId,
        start_location: request.startLocationText,
        destination: request.destinationText,
        distance_km: Number((request.distanceMeters / 1000).toFixed(2)),
        duration_minutes: Math.max(1, Math.round(request.durationSeconds / 60)),
        rating: request.rating,
        feedback_text: request.feedbackText,
      },
    ]);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    memoryFeedback.set(createId('feedback'), {
      request,
      userId,
    });
  }

  return {
    acceptedAt: new Date().toISOString(),
  };
};

export const saveTripTrack = async (
  request: TripTrackRequest,
  userId: string,
): Promise<WriteAckResponse> => {
  if (supabaseAdmin) {
    const actualDistance = request.gpsBreadcrumbs.length >= 2
      ? calculateTrailDistanceMeters(request.gpsBreadcrumbs)
      : null;

    // Idempotent on trip_id (one trip → one track). Retries upsert the latest
    // GPS trail rather than inserting a duplicate row that would show up as a
    // second trip in history. Migration 202604270002 enforces UNIQUE(trip_id).
    const { error } = await supabaseAdmin.from('trip_tracks').upsert(
      [
        {
          trip_id: request.tripId,
          user_id: userId,
          routing_mode: request.routingMode,
          planned_route_polyline6: request.plannedRoutePolyline6 ?? null,
          planned_route_distance_meters: request.plannedRouteDistanceMeters ?? null,
          actual_distance_meters: actualDistance,
          gps_trail: request.gpsBreadcrumbs,
          end_reason: request.endReason,
          started_at: request.startedAt,
          ended_at: request.endedAt,
          bike_type: request.bikeType ?? null,
          aqi_at_start: request.aqiAtStart ?? null,
        },
      ],
      { onConflict: 'trip_id' },
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    acceptedAt: new Date().toISOString(),
  };
};

export const getUserStats = async (
  userId: string,
): Promise<UserStats> => {
  if (!supabaseAdmin) {
    return {
      totalTrips: 0,
      totalDistanceMeters: 0,
      totalCo2SavedKg: 0,
      totalDurationSeconds: 0,
    };
  }

  const { data, error } = await supabaseAdmin.rpc('get_user_trip_stats', {
    requesting_user_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const totalDistanceMeters = Number(row?.total_distance_meters ?? 0);

  return {
    totalTrips: Number(row?.total_trips ?? 0),
    totalDistanceMeters,
    totalCo2SavedKg: calculateCo2SavedKg(totalDistanceMeters),
    totalDurationSeconds: Number(row?.total_duration_seconds ?? 0),
  };
};

export const getTripHistory = async (
  userId: string,
): Promise<TripHistoryItem[]> => {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('trip_tracks')
    .select('id, trip_id, routing_mode, planned_route_polyline6, planned_route_distance_meters, actual_distance_meters, gps_trail, end_reason, started_at, ended_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    tripId: row.trip_id as string,
    routingMode: row.routing_mode as 'safe' | 'fast',
    plannedRoutePolyline6: (row.planned_route_polyline6 as string) ?? undefined,
    plannedRouteDistanceMeters: (row.planned_route_distance_meters as number) ?? undefined,
    gpsBreadcrumbs: ((row.gps_trail as Array<{ lat: number; lon: number }>) ?? []).map(
      (pt) => ({ lat: pt.lat, lon: pt.lon }),
    ),
    endReason: row.end_reason as 'completed' | 'stopped' | 'app_killed' | 'in_progress',
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? null,
    distanceMeters: (row.actual_distance_meters as number) ?? undefined,
  }));
};

export type DeleteTripResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

/**
 * Hard-deletes a trip_tracks row owned by the user. The user-scoped match
 * (`id` + `user_id`) prevents deleting another user's row even with a guessed
 * UUID. Returns 'not_found' when no row matches — the route layer maps that to
 * a 404 so a missing trip and a foreign trip are indistinguishable from the
 * caller's perspective.
 *
 * Also clears the user's matching trip_shares row (+ cascaded feed_likes,
 * feed_comments, trip_loves) and any activity_feed `ride` entry whose
 * `payload.tripId` references the same parent trip (+ cascaded
 * activity_reactions, activity_comments). This keeps the City Heartbeat,
 * Community Stats, Neighborhood Leaderboard, Community Feed, and the social
 * Activity Feed in sync with what History shows. Without this, a deleted ride
 * lingered in every community surface because they all read from trip_shares /
 * activity_feed instead of trip_tracks.
 *
 * Profile counters, ride_impacts, ride_microlives, badges, XP, and leaderboard
 * snapshots are intentionally left untouched: deleting a trip removes it from
 * the user-visible surfaces, but does not unwind already-awarded achievements
 * or rewrite immutable historical snapshots.
 */
export const deleteTripTrack = async (
  trackId: string,
  userId: string,
): Promise<DeleteTripResult> => {
  if (!supabaseAdmin) return { status: 'not_found' };

  // `.select('id, trip_id')` after a DELETE returns the row that was deleted,
  // so we capture the parent trip_id (which the share + activity_feed rows are
  // keyed on) atomically. If no row matches, data is empty and we early-return
  // before touching the other tables.
  const { data, error } = await supabaseAdmin
    .from('trip_tracks')
    .delete()
    .eq('id', trackId)
    .eq('user_id', userId)
    .select('id, trip_id');

  if (error) {
    throw new Error(error.message);
  }

  if ((data?.length ?? 0) === 0) {
    return { status: 'not_found' };
  }

  const parentTripId = data?.[0]?.trip_id as string | null | undefined;

  // Clean up the auto-shared community-feed entry (cascades to feed_likes /
  // feed_comments / trip_loves via existing FK rules) and the activity_feed
  // ride entry (cascades to activity_reactions / activity_comments). Both
  // queries are user-scoped as defence-in-depth; failures here are non-fatal
  // because the History row is already gone — we log the upstream error to
  // the caller through a thrown Error so the route layer surfaces a 502.
  if (parentTripId) {
    const { error: shareError } = await supabaseAdmin
      .from('trip_shares')
      .delete()
      .eq('user_id', userId)
      .eq('trip_id', parentTripId);

    if (shareError) {
      throw new Error(`trip_shares cleanup failed: ${shareError.message}`);
    }

    const { error: activityError } = await supabaseAdmin
      .from('activity_feed')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'ride')
      .eq('payload->>tripId', parentTripId);

    if (activityError) {
      throw new Error(`activity_feed cleanup failed: ${activityError.message}`);
    }
  }

  return { status: 'deleted' };
};

export const getTripStatsDashboard = async (
  userId: string,
  timeZone: string = 'UTC',
): Promise<TripStatsDashboard> => {
  const emptyUserStats = { totalTrips: 0, totalDistanceMeters: 0, totalCo2SavedKg: 0, totalDurationSeconds: 0 };
  const emptyModeSplit = { safeTrips: 0, fastTrips: 0 };
  const emptyDashboard: TripStatsDashboard = {
    totals: emptyUserStats,
    weeklyTotals: emptyUserStats,
    monthlyTotals: emptyUserStats,
    weekly: [],
    monthly: [],
    currentStreakDays: 0,
    longestStreakDays: 0,
    modeSplit: emptyModeSplit,
    weeklyModeSplit: emptyModeSplit,
    monthlyModeSplit: emptyModeSplit,
  };

  if (!supabaseAdmin) {
    return emptyDashboard;
  }

  const { data, error } = await supabaseAdmin.rpc('get_trip_stats_dashboard', {
    requesting_user_id: userId,
    time_zone: timeZone,
  });

  if (error) {
    throw new Error(error.message);
  }

  type RawTotals = { totalTrips?: number; totalDistanceMeters?: number; totalDurationSeconds?: number } | null | undefined;
  type RawModeSplit = { safeTrips?: number; fastTrips?: number } | null | undefined;
  const raw = data as {
    totals: RawTotals;
    weeklyTotals?: RawTotals;
    monthlyTotals?: RawTotals;
    weekly: Array<{ period_start: string; trips: number; distance_meters: number; duration_seconds: number }>;
    monthly: Array<{ period_start: string; trips: number; distance_meters: number; duration_seconds: number }>;
    currentStreakDays: number;
    longestStreakDays: number;
    modeSplit: RawModeSplit;
    weeklyModeSplit?: RawModeSplit;
    monthlyModeSplit?: RawModeSplit;
  } | null;

  if (!raw) {
    return emptyDashboard;
  }

  const mapTotals = (row: RawTotals) => {
    const distance = Number(row?.totalDistanceMeters ?? 0);
    return {
      totalTrips: Number(row?.totalTrips ?? 0),
      totalDistanceMeters: distance,
      totalCo2SavedKg: calculateCo2SavedKg(distance),
      totalDurationSeconds: Number(row?.totalDurationSeconds ?? 0),
    };
  };

  const mapModeSplit = (row: RawModeSplit) => ({
    safeTrips: Number(row?.safeTrips ?? 0),
    fastTrips: Number(row?.fastTrips ?? 0),
  });

  return {
    totals: mapTotals(raw.totals),
    weeklyTotals: mapTotals(raw.weeklyTotals),
    monthlyTotals: mapTotals(raw.monthlyTotals),
    weekly: (raw.weekly ?? []).map((b) => ({
      periodStart: b.period_start,
      trips: b.trips,
      distanceMeters: b.distance_meters,
      durationSeconds: b.duration_seconds,
    })),
    monthly: (raw.monthly ?? []).map((b) => ({
      periodStart: b.period_start,
      trips: b.trips,
      distanceMeters: b.distance_meters,
      durationSeconds: b.duration_seconds,
    })),
    currentStreakDays: raw.currentStreakDays ?? 0,
    longestStreakDays: raw.longestStreakDays ?? 0,
    modeSplit: mapModeSplit(raw.modeSplit),
    weeklyModeSplit: mapModeSplit(raw.weeklyModeSplit),
    monthlyModeSplit: mapModeSplit(raw.monthlyModeSplit),
  };
};
