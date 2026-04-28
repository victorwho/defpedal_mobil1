-- Trip stats dashboard — return per-period totals + mode splits.
--
-- The previous version returned only lifetime `totals` and `modeSplit`, so the
-- History tab's Week / Month / All Time tabs all rendered identical numbers
-- (the frontend has nowhere else to read totals from). This adds:
--   • weeklyTotals  — calendar-week totals (timezone-aware)
--   • monthlyTotals — calendar-month totals
--   • weeklyModeSplit, monthlyModeSplit — paired safe/fast splits
--
-- The historical bucket arrays (`weekly` / `monthly`) and the lifetime
-- `streak` fields are unchanged.

CREATE OR REPLACE FUNCTION get_trip_stats_dashboard(requesting_user_id UUID, time_zone TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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

  -- ── Lifetime totals (existing behaviour) ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed';

  -- ── Current-week totals ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO weekly_totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed'
    AND (started_at AT TIME ZONE time_zone) >= v_week_start;

  -- ── Current-month totals ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO monthly_totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed'
    AND (started_at AT TIME ZONE time_zone) >= v_month_start;

  -- ── Weekly buckets (last 12 weeks, Monday-aligned) — unchanged ──
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
      AND end_reason = 'completed'
      AND started_at >= date_trunc('week', NOW() AT TIME ZONE time_zone) - INTERVAL '11 weeks'
    GROUP BY date_trunc('week', started_at AT TIME ZONE time_zone)
    ORDER BY period_start
  ) w;

  -- ── Monthly buckets (last 12 months) — unchanged ──
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
      AND end_reason = 'completed'
      AND started_at >= date_trunc('month', NOW() AT TIME ZONE time_zone) - INTERVAL '11 months'
    GROUP BY date_trunc('month', started_at AT TIME ZONE time_zone)
    ORDER BY period_start
  ) m;

  -- ── Riding streaks (lifetime, unchanged from prior version) ──
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
            FROM (SELECT DISTINCT (started_at AT TIME ZONE time_zone)::date AS rd FROM trip_tracks WHERE user_id = requesting_user_id AND end_reason = 'completed') d
          ) x
          GROUP BY g
        ) y WHERE y.last_day = (NOW() AT TIME ZONE time_zone)::date OR y.last_day = (NOW() AT TIME ZONE time_zone)::date - 1 ORDER BY y.last_day DESC LIMIT 1),
        0
      ) AS cur_streak
    FROM (
      SELECT COUNT(*)::INT AS ct
      FROM (
        SELECT rd, rd - (ROW_NUMBER() OVER (ORDER BY rd))::int AS g
        FROM (SELECT DISTINCT (started_at AT TIME ZONE time_zone)::date AS rd FROM trip_tracks WHERE user_id = requesting_user_id AND end_reason = 'completed') d
      ) x
      GROUP BY g
    ) all_streaks
  ) sub;

  longest_streak := streak_data.max_streak;
  current_streak := streak_data.cur_streak;

  -- ── Mode split (lifetime) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed';

  -- ── Mode split (current week) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO weekly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed'
    AND (started_at AT TIME ZONE time_zone) >= v_week_start;

  -- ── Mode split (current month) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO monthly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed'
    AND (started_at AT TIME ZONE time_zone) >= v_month_start;

  -- ── Assemble result ──
  result := jsonb_build_object(
    'totals', jsonb_build_object(
      'totalTrips',           totals_row.total_trips,
      'totalDistanceMeters',  totals_row.total_distance_meters,
      'totalDurationSeconds', totals_row.total_duration_seconds
    ),
    'weeklyTotals', jsonb_build_object(
      'totalTrips',           weekly_totals_row.total_trips,
      'totalDistanceMeters',  weekly_totals_row.total_distance_meters,
      'totalDurationSeconds', weekly_totals_row.total_duration_seconds
    ),
    'monthlyTotals', jsonb_build_object(
      'totalTrips',           monthly_totals_row.total_trips,
      'totalDistanceMeters',  monthly_totals_row.total_distance_meters,
      'totalDurationSeconds', monthly_totals_row.total_duration_seconds
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
$$;
