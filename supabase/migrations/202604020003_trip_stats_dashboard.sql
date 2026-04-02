-- Trip Statistics Dashboard RPC
-- Returns aggregated stats: totals, weekly/monthly buckets, streaks, mode split
-- All in a single RPC call to minimize round-trips from the mobile app.
-- Accepts a time_zone parameter for correct day/week/month bucketing in the user's locale.

CREATE OR REPLACE FUNCTION get_trip_stats_dashboard(requesting_user_id UUID, time_zone TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  totals_row RECORD;
  weekly_arr JSONB;
  monthly_arr JSONB;
  current_streak INT;
  longest_streak INT;
  mode_split_row RECORD;
  streak_data RECORD;
BEGIN
  -- ── Totals ──
  SELECT
    COUNT(*)::INT                                                       AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0) AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)       AS total_duration_seconds
  INTO totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed';

  -- ── Weekly buckets (last 12 weeks, Monday-aligned) ──
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

  -- ── Monthly buckets (last 12 months) ──
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

  -- ── Riding streaks (consecutive calendar days with at least one completed trip) ──
  -- Uses nested subqueries instead of CTEs to avoid PL/pgSQL variable name collisions
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

  -- ── Mode split ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason = 'completed';

  -- ── Assemble result ──
  result := jsonb_build_object(
    'totals', jsonb_build_object(
      'totalTrips',          totals_row.total_trips,
      'totalDistanceMeters', totals_row.total_distance_meters,
      'totalDurationSeconds',totals_row.total_duration_seconds
    ),
    'weekly',  weekly_arr,
    'monthly', monthly_arr,
    'currentStreakDays', current_streak,
    'longestStreakDays', longest_streak,
    'modeSplit', jsonb_build_object(
      'safeTrips', mode_split_row.safe_trips,
      'fastTrips', mode_split_row.fast_trips
    )
  );

  RETURN result;
END;
$$;

-- ── Performance indexes ──
-- Composite index for the dashboard queries (user + completion filter + time ordering)
CREATE INDEX IF NOT EXISTS idx_trip_tracks_user_completed_started
  ON trip_tracks (user_id, end_reason, started_at)
  WHERE end_reason = 'completed';
