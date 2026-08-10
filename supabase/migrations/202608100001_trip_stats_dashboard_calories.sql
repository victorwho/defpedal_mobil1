-- Add calories to the History-tab Stats Dashboard (get_trip_stats_dashboard).
--
-- Context: session 100 shipped the calories-burned fix (ride_impacts rows now
-- hold real kcal), and the lifetime Impact Dashboard shows totalCaloriesBurned
-- via get_impact_dashboard — but the per-period Stats Dashboard RPC never
-- summed calories, so that screen had no calories stat at all.
--
-- This CREATE OR REPLACE is based on the LIVE definition read via
-- pg_get_functiondef on 2026-08-10 (NOT the last codebase migration — live
-- RPCs have drifted; see memory reference_supabase-rpc-drift). Delta vs live:
--   * each of the three totals queries (lifetime / week / month) LEFT JOINs
--     ride_impacts on (trip_id, user_id) and adds
--     COALESCE(SUM(ri.calories_burned), 0) AS total_calories_burned
--     — summing the STORED per-ride kcal so this screen always agrees with
--     the Impact Dashboard, instead of re-deriving from aggregate speed;
--   * the three totals JSON objects gain 'totalCaloriesBurned'.
-- The join is 1:0..1 (ride_impacts is unique per trip), so COUNT(*)/SUM rows
-- are unchanged; the user_id predicate guards against any future trip_id
-- collision across users.

CREATE OR REPLACE FUNCTION public.get_trip_stats_dashboard(requesting_user_id uuid, time_zone text DEFAULT 'UTC'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  totals_row RECORD;
  weekly_totals_row RECORD;
  monthly_totals_row RECORD;
  weekly_arr JSONB;
  monthly_arr JSONB;
  current_streak INT;
  longest_streak INT;
  mode_split_row RECORD;
  weekly_mode_split_row RECORD;
  monthly_mode_split_row RECORD;
  streak_data RECORD;
  v_week_start TIMESTAMPTZ;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_week_start  := date_trunc('week',  NOW() AT TIME ZONE time_zone);
  v_month_start := date_trunc('month', NOW() AT TIME ZONE time_zone);

  SELECT
    COUNT(*)::INT                                                                                   AS total_trips,
    COALESCE(SUM(COALESCE(tt.actual_distance_meters, tt.planned_route_distance_meters, 0)), 0)      AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (tt.ended_at - tt.started_at))), 0)                             AS total_duration_seconds,
    COALESCE(SUM(ri.calories_burned), 0)                                                            AS total_calories_burned
  INTO totals_row
  FROM trip_tracks tt
  LEFT JOIN ride_impacts ri ON ri.trip_id = tt.trip_id AND ri.user_id = tt.user_id
  WHERE tt.user_id = requesting_user_id
    AND tt.end_reason <> 'in_progress';

  SELECT
    COUNT(*)::INT                                                                                   AS total_trips,
    COALESCE(SUM(COALESCE(tt.actual_distance_meters, tt.planned_route_distance_meters, 0)), 0)      AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (tt.ended_at - tt.started_at))), 0)                             AS total_duration_seconds,
    COALESCE(SUM(ri.calories_burned), 0)                                                            AS total_calories_burned
  INTO weekly_totals_row
  FROM trip_tracks tt
  LEFT JOIN ride_impacts ri ON ri.trip_id = tt.trip_id AND ri.user_id = tt.user_id
  WHERE tt.user_id = requesting_user_id
    AND tt.end_reason <> 'in_progress'
    AND (tt.started_at AT TIME ZONE time_zone) >= v_week_start;

  SELECT
    COUNT(*)::INT                                                                                   AS total_trips,
    COALESCE(SUM(COALESCE(tt.actual_distance_meters, tt.planned_route_distance_meters, 0)), 0)      AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (tt.ended_at - tt.started_at))), 0)                             AS total_duration_seconds,
    COALESCE(SUM(ri.calories_burned), 0)                                                            AS total_calories_burned
  INTO monthly_totals_row
  FROM trip_tracks tt
  LEFT JOIN ride_impacts ri ON ri.trip_id = tt.trip_id AND ri.user_id = tt.user_id
  WHERE tt.user_id = requesting_user_id
    AND tt.end_reason <> 'in_progress'
    AND (tt.started_at AT TIME ZONE time_zone) >= v_month_start;

  SELECT COALESCE(jsonb_agg(row_to_json(w)::jsonb ORDER BY w.period_start), '[]'::jsonb)
  INTO weekly_arr
  FROM (
    SELECT
      date_trunc('week', started_at AT TIME ZONE time_zone)::date::text AS period_start,
      COUNT(*)::INT                                                  AS trips,
      COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)::double precision AS distance_meters,
      COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)::double precision AS duration_seconds
    FROM trip_tracks
    WHERE user_id = requesting_user_id
      AND end_reason <> 'in_progress'
      AND started_at >= date_trunc('week', NOW() AT TIME ZONE time_zone) - INTERVAL '11 weeks'
    GROUP BY date_trunc('week', started_at AT TIME ZONE time_zone)
    ORDER BY period_start
  ) w;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.period_start), '[]'::jsonb)
  INTO monthly_arr
  FROM (
    SELECT
      date_trunc('month', started_at AT TIME ZONE time_zone)::date::text AS period_start,
      COUNT(*)::INT                                                   AS trips,
      COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)::double precision AS distance_meters,
      COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)::double precision AS duration_seconds
    FROM trip_tracks
    WHERE user_id = requesting_user_id
      AND end_reason <> 'in_progress'
      AND started_at >= date_trunc('month', NOW() AT TIME ZONE time_zone) - INTERVAL '11 months'
    GROUP BY date_trunc('month', started_at AT TIME ZONE time_zone)
    ORDER BY period_start
  ) m;

  SELECT sub.max_streak, sub.cur_streak
  INTO streak_data
  FROM (
    SELECT
      COALESCE(MAX(ct), 0) AS max_streak,
      COALESCE(
        (SELECT ct FROM (
          SELECT MAX(rd) AS last_day, COUNT(*)::INT AS ct
          FROM (
            SELECT rd, rd - (ROW_NUMBER() OVER (ORDER BY rd))::int AS g
            FROM (SELECT DISTINCT (started_at AT TIME ZONE time_zone)::date AS rd FROM trip_tracks WHERE user_id = requesting_user_id AND end_reason <> 'in_progress') d
          ) x
          GROUP BY g
        ) y WHERE y.last_day = (NOW() AT TIME ZONE time_zone)::date OR y.last_day = (NOW() AT TIME ZONE time_zone)::date - 1 ORDER BY y.last_day DESC LIMIT 1),
        0
      ) AS cur_streak
    FROM (
      SELECT COUNT(*)::INT AS ct
      FROM (
        SELECT rd, rd - (ROW_NUMBER() OVER (ORDER BY rd))::int AS g
        FROM (SELECT DISTINCT (started_at AT TIME ZONE time_zone)::date AS rd FROM trip_tracks WHERE user_id = requesting_user_id AND end_reason <> 'in_progress') d
      ) x
      GROUP BY g
    ) all_streaks
  ) sub;

  longest_streak := streak_data.max_streak;
  current_streak := streak_data.cur_streak;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress';

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO weekly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
    AND (started_at AT TIME ZONE time_zone) >= v_week_start;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO monthly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
    AND (started_at AT TIME ZONE time_zone) >= v_month_start;

  result := jsonb_build_object(
    'totals', jsonb_build_object(
      'totalTrips',           totals_row.total_trips,
      'totalDistanceMeters',  totals_row.total_distance_meters,
      'totalDurationSeconds', totals_row.total_duration_seconds,
      'totalCaloriesBurned',  totals_row.total_calories_burned
    ),
    'weeklyTotals', jsonb_build_object(
      'totalTrips',           weekly_totals_row.total_trips,
      'totalDistanceMeters',  weekly_totals_row.total_distance_meters,
      'totalDurationSeconds', weekly_totals_row.total_duration_seconds,
      'totalCaloriesBurned',  weekly_totals_row.total_calories_burned
    ),
    'monthlyTotals', jsonb_build_object(
      'totalTrips',           monthly_totals_row.total_trips,
      'totalDistanceMeters',  monthly_totals_row.total_distance_meters,
      'totalDurationSeconds', monthly_totals_row.total_duration_seconds,
      'totalCaloriesBurned',  monthly_totals_row.total_calories_burned
    ),
    'weekly',  weekly_arr,
    'monthly', monthly_arr,
    'currentStreakDays', current_streak,
    'longestStreakDays', longest_streak,
    'modeSplit', jsonb_build_object(
      'safeTrips', mode_split_row.safe_trips,
      'fastTrips', mode_split_row.fast_trips
    ),
    'weeklyModeSplit', jsonb_build_object(
      'safeTrips', weekly_mode_split_row.safe_trips,
      'fastTrips', weekly_mode_split_row.fast_trips
    ),
    'monthlyModeSplit', jsonb_build_object(
      'safeTrips', monthly_mode_split_row.safe_trips,
      'fastTrips', monthly_mode_split_row.fast_trips
    )
  );

  RETURN result;
END;
$function$;
