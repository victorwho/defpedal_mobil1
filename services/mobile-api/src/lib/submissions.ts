import type {
  CitySuggestionRequest,
  CitySuggestionResponse,
  CountryWaitlistRequest,
  CountryWaitlistResponse,
  HazardReportRequest,
  HazardReportResponse,
  NavigationFeedbackRequest,
  SesizareRequest,
  SesizareResponse,
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
import {
  CIVIA_CATEGORY_BY_HAZARD_TYPE,
  calculateCo2SavedKg,
  calculateTrailDistanceMeters,
  isSesizareEligible,
  sanitizeBreadcrumbs,
} from '@defensivepedal/core';

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

/**
 * Resolve the server `trips.id` for a given (user, clientTripId).
 *
 * trip_start writes `trips.client_trip_id` durably, so this lets the offline
 * queue recover a trip_end / trip_track whose local clientTripId→serverId map
 * was lost (app kill, persist debounce, resetFlow prune). Without it, an
 * orphaned end/track mutation is skipped on every flush forever and the trip
 * is stranded as `in_progress` with no GPS track — the dominant cause of the
 * trip_tracks loss that began when the offline-queue trip flow rolled out
 * (~2026-05). Returns null (→ 404 at the route layer) when no such trip
 * exists, which lets the client dead-letter a truly-missing trip instead of
 * skipping it silently.
 */
export const resolveTripIdByClientId = async (
  clientTripId: string,
  userId: string,
): Promise<{ tripId: string } | null> => {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('trips')
      .select('id')
      // Unique (user_id, client_trip_id) index guarantees at most one row.
      .eq('user_id', userId)
      .eq('client_trip_id', clientTripId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data?.id ? { tripId: data.id as string } : null;
  }

  const memoryTrip = memoryTrips.get(clientTripId);
  return memoryTrip && memoryTrip.userId === userId
    ? { tripId: memoryTrip.tripId }
    : null;
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
        early_end_reason: request.earlyEndReason ?? null,
        early_end_reason_note: request.earlyEndReasonNote ?? null,
        // Always written, even when the client didn't send one (null =
        // "ended by a pre-endAction client"). This also clears a reaper's
        // 'abandoned' stamp when a genuinely late trip_end arrives from a
        // device that came back online.
        end_action: request.endAction ?? null,
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
        user_id: userId,
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
    // Drop stale/cached GPS fixes (e.g. a previous-ride last-known location from
    // another city) before they corrupt the stored distance AND the persisted
    // trail that History/trip-replay draws. Defence-in-depth: the client gates
    // these at append time too, but a stale or offline-queued client could send
    // an un-sanitised trail.
    const cleanTrail = sanitizeBreadcrumbs(
      request.gpsBreadcrumbs,
      Date.parse(request.startedAt),
    );
    const actualDistance = cleanTrail.length >= 2
      ? calculateTrailDistanceMeters(cleanTrail)
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
          gps_trail: cleanTrail,
          end_reason: request.endReason,
          started_at: request.startedAt,
          ended_at: request.endedAt,
          bike_type: request.bikeType ?? null,
          aqi_at_start: request.aqiAtStart ?? null,
          early_end_reason: request.earlyEndReason ?? null,
          early_end_reason_note: request.earlyEndReasonNote ?? null,
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
  /**
   * Oldest ride to return, ISO. `null` = the rider's full history.
   *
   * This is a READ FILTER for the free tier and nothing else: no row is ever
   * deleted on account of it, so subscribing reveals everything again
   * instantly, and lifetime totals, badges and XP continue to be computed over
   * the complete history regardless of tier.
   */
  sinceIso: string | null = null,
): Promise<TripHistoryItem[]> => {
  if (!supabaseAdmin) return [];

  let query = supabaseAdmin
    .from('trip_tracks')
    .select('id, trip_id, routing_mode, planned_route_polyline6, planned_route_distance_meters, actual_distance_meters, gps_trail, end_reason, started_at, ended_at')
    .eq('user_id', userId);

  if (sinceIso) query = query.gte('started_at', sinceIso);

  const { data, error } = await query
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];

  // ride_impacts.trip_id → trips.id, not → trip_tracks.id, so PostgREST cannot
  // do an embedded resource join from trip_tracks. Fetch calories separately.
  const caloriesMap = new Map<string, number>();
  const tripIds = rows.map((r) => r.trip_id as string).filter(Boolean);
  if (tripIds.length > 0) {
    const { data: impactData } = await supabaseAdmin
      .from('ride_impacts')
      .select('trip_id, calories_burned')
      .in('trip_id', tripIds);
    for (const impact of impactData ?? []) {
      caloriesMap.set(impact.trip_id as string, Number(impact.calories_burned ?? 0));
    }
  }

  return rows.map((row: Record<string, unknown>) => ({
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
    caloriesBurned: caloriesMap.get(row.trip_id as string),
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

  type RawTotals = { totalTrips?: number; totalDistanceMeters?: number; totalDurationSeconds?: number; totalCaloriesBurned?: number } | null | undefined;
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
      totalCaloriesBurned: Number(row?.totalCaloriesBurned ?? 0),
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

// ── City suggestions ──

const memoryCitySuggestions = new Map<
  string,
  { request: CitySuggestionRequest; userId: string }
>();

export const submitCitySuggestion = async (
  request: CitySuggestionRequest,
  userId: string,
): Promise<CitySuggestionResponse> => {
  // Server-side trim + length guard. DB has CHECK (1..500) but a clean trim
  // here keeps a misbehaving client from tripping the 502 UPSTREAM_ERROR path.
  const trimmedBody = request.body.trim();
  if (trimmedBody.length === 0 || trimmedBody.length > 500) {
    throw new Error('Suggestion body must be 1-500 characters after trimming.');
  }

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('city_suggestions')
      .insert({
        user_id: userId,
        lat: request.coordinate.lat,
        lon: request.coordinate.lon,
        location: `SRID=4326;${toPointWkt(request.coordinate.lat, request.coordinate.lon)}`,
        body: trimmedBody,
        source: request.source,
        client_submitted_at: request.submittedAt,
        locality: request.locality ?? null,
        route_context: request.routeContext ?? null,
      })
      .select('id, created_at, status')
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Insert failed');
    }

    return {
      id: data.id as string,
      createdAt: data.created_at as string,
      status: 'open',
    };
  }

  const id = createId('city-suggestion');
  memoryCitySuggestions.set(id, { request: { ...request, body: trimmedBody }, userId });
  return {
    id,
    createdAt: new Date().toISOString(),
    status: 'open',
  };
};

const memoryCountryWaitlist = new Map<string, CountryWaitlistRequest & { userId: string }>();

/**
 * Region-gate waitlist signup. The route handler has already normalized
 * `email` (trim + lowercase) and country codes (uppercase); the plain-column
 * unique constraint (email, country_code) plus `ignoreDuplicates` makes the
 * write idempotent — a repeat signup is a silent no-op that still reports
 * `joined`, so the client never has to special-case "already on the list".
 */
export const submitCountryWaitlist = async (
  request: CountryWaitlistRequest,
  userId: string,
): Promise<CountryWaitlistResponse> => {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('country_waitlist')
      .upsert(
        {
          user_id: userId,
          email: request.email,
          country_code: request.countryCode,
          detected_country_code: request.detectedCountryCode ?? null,
          locale: request.locale ?? null,
          source: request.source,
        },
        { onConflict: 'email,country_code', ignoreDuplicates: true },
      );

    if (error) {
      throw new Error(error.message);
    }

    return { status: 'joined' };
  }

  memoryCountryWaitlist.set(`${request.email}:${request.countryCode}`, { ...request, userId });
  return { status: 'joined' };
};

// ---------------------------------------------------------------------------
// Sesizări — civic-complaint escalations (Romania)
// ---------------------------------------------------------------------------

/**
 * Thrown when a rider tries to escalate the same hazard twice. Distinguished
 * from generic upstream failures so the route can answer 409 rather than a
 * misleading 502 — the client treats it as "already escalated", not an error.
 */
export class SesizareDuplicateError extends Error {
  constructor() {
    super('This hazard has already been escalated by this rider.');
    this.name = 'SesizareDuplicateError';
  }
}

const memorySesizari = new Map<string, SesizareRequest & { userId: string }>();

/**
 * Records a hand-off to civia.ro.
 *
 * The row means "the rider opened Civia with a composed petition", NOT "a
 * sesizare was filed" — civia.ro's submit requires a legal identity we never
 * hold. Every count derived from this table inherits that meaning.
 */
export const submitSesizare = async (
  request: SesizareRequest,
  userId: string,
): Promise<SesizareResponse> => {
  // Defence in depth: the route's JSON Schema enums the same list, but this
  // keeps the invariant if the endpoint is ever called from elsewhere.
  if (!isSesizareEligible(request.hazardType)) {
    throw new Error(`Hazard type ${request.hazardType} is not eligible for a sesizare.`);
  }
  const civiaCategory = CIVIA_CATEGORY_BY_HAZARD_TYPE[request.hazardType];
  const address = request.address?.trim().slice(0, 300) || null;

  if (!supabaseAdmin) {
    const id = createId('sesizare');
    memorySesizari.set(id, { ...request, userId });
    return {
      id,
      createdAt: new Date().toISOString(),
      hazardSesizareCount: 1,
      awardedBadges: [],
    };
  }

  const { data, error } = await supabaseAdmin
    .from('sesizari')
    .insert({
      user_id: userId,
      hazard_id: request.hazardId ?? null,
      hazard_type: request.hazardType,
      civia_category: civiaCategory,
      lat: request.coordinate.lat,
      lon: request.coordinate.lon,
      location: `SRID=4326;${toPointWkt(request.coordinate.lat, request.coordinate.lon)}`,
      address,
    })
    .select('id, created_at')
    .single();

  if (error || !data) {
    // 23505 = unique_violation on sesizari_user_hazard_uniq.
    if (error?.code === '23505') throw new SesizareDuplicateError();
    throw new Error(error?.message ?? 'Insert failed');
  }

  // Badge evaluation is additive and best-effort: a failure here must not
  // cost the rider the escalation they already made.
  let awardedBadges: unknown[] = [];
  try {
    const { data: badges } = await supabaseAdmin.rpc('award_sesizare_badges', {
      p_user_id: userId,
    });
    if (Array.isArray(badges)) awardedBadges = badges;
  } catch {
    awardedBadges = [];
  }

  let hazardSesizareCount = 1;
  if (request.hazardId) {
    const { count } = await supabaseAdmin
      .from('sesizari')
      .select('id', { count: 'exact', head: true })
      .eq('hazard_id', request.hazardId);
    if (typeof count === 'number' && count > 0) hazardSesizareCount = count;
  }

  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    hazardSesizareCount,
    awardedBadges,
  };
};

/**
 * Lifetime escalation count for a rider — powers the impact-dashboard row.
 */
export const countSesizariForUser = async (userId: string): Promise<number> => {
  if (!supabaseAdmin) {
    return [...memorySesizari.values()].filter((entry) => entry.userId === userId).length;
  }
  const { count } = await supabaseAdmin
    .from('sesizari')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return typeof count === 'number' ? count : 0;
};
