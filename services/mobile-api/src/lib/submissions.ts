import type {
  HazardReportRequest,
  HazardReportResponse,
  NavigationFeedbackRequest,
  TripEndRequest,
  TripEndResponse,
  TripHistoryItem,
  TripStartRequest,
  TripStartResponse,
  TripTrackRequest,
  UserStats,
  WriteAckResponse,
} from '@defensivepedal/core';
import { calculateCo2SavedKg } from '@defensivepedal/core';

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
    const baseInsert = {
      user_id: userId,
      location: {
        latitude: request.coordinate.lat,
        longitude: request.coordinate.lon,
      },
      reported_at: request.reportedAt,
      day: now.toISOString().substring(0, 10),
      time_of_day: now.toTimeString().substring(0, 8),
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
    const { data, error } = await supabaseAdmin
      .from('trips')
      .insert([
        {
          user_id: userId,
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
      ])
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
    const { error } = await supabaseAdmin.from('trip_tracks').insert([
      {
        trip_id: request.tripId,
        user_id: userId,
        routing_mode: request.routingMode,
        planned_route_polyline6: request.plannedRoutePolyline6 ?? null,
        planned_route_distance_meters: request.plannedRouteDistanceMeters ?? null,
        gps_trail: request.gpsBreadcrumbs,
        end_reason: request.endReason,
        started_at: request.startedAt,
        ended_at: request.endedAt,
      },
    ]);

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
    .select('id, trip_id, routing_mode, planned_route_polyline6, planned_route_distance_meters, gps_trail, end_reason, started_at, ended_at')
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
  }));
};
