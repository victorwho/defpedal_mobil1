-- Stats RPCs were filtering on `end_reason = 'completed'`, which only catches
-- trips that auto-completed because the rider crossed the destination GPS
-- threshold. Since session 34 (2026-04-28) added the Save-or-Discard end-ride
-- dialog, the **Save** flow records `end_reason = 'stopped'` — the user
-- explicitly chose to keep the ride. Auto-recovered rides after an app kill
-- are recorded as `'app_killed'`. All three values represent real finished
-- rides the user wants counted; only `'in_progress'` (the placeholder row
-- inserted on trip_start) should be excluded.
--
-- Result of the bug: any user who manually stops their ride (the majority of
-- riders, since most don't GPS-arrive at the exact destination) sees 0 trips
-- in weekly / monthly / lifetime stats. Verified on the test user — 103 of
-- 137 recent rows are `'stopped'`.
--
-- Fix: replace `end_reason = 'completed'` with `end_reason <> 'in_progress'`
-- in:
--   • get_trip_stats_dashboard  (per-period + lifetime totals + mode splits + streaks)
--   • get_user_trip_stats        (legacy lifetime-only RPC, still consumed)
--   • get_user_public_profile    (community profile lifetime totals)
--
-- The XP backfill query in 202604090002 keeps the `= 'completed'` filter —
-- it runs once per user to seed initial XP, not live, and a stricter filter
-- there is conservative.

-- ─────────────────────────────────────────────────────────────────────────
-- get_trip_stats_dashboard
-- ─────────────────────────────────────────────────────────────────────────

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

  -- ── Lifetime totals ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress';

  -- ── Current-week totals ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO weekly_totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
    AND (started_at AT TIME ZONE time_zone) >= v_week_start;

  -- ── Current-month totals ──
  SELECT
    COUNT(*)::INT                                                                          AS total_trips,
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0)   AS total_distance_meters,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))), 0)                          AS total_duration_seconds
  INTO monthly_totals_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
    AND (started_at AT TIME ZONE time_zone) >= v_month_start;

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
      AND end_reason <> 'in_progress'
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
      AND end_reason <> 'in_progress'
      AND started_at >= date_trunc('month', NOW() AT TIME ZONE time_zone) - INTERVAL '11 months'
    GROUP BY date_trunc('month', started_at AT TIME ZONE time_zone)
    ORDER BY period_start
  ) m;

  -- ── Riding streaks (lifetime) ──
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

  -- ── Mode split (lifetime) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress';

  -- ── Mode split (current week) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO weekly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
    AND (started_at AT TIME ZONE time_zone) >= v_week_start;

  -- ── Mode split (current month) ──
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'safe'), 0)::INT AS safe_trips,
    COALESCE(COUNT(*) FILTER (WHERE routing_mode = 'fast'), 0)::INT AS fast_trips
  INTO monthly_mode_split_row
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress'
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

-- ─────────────────────────────────────────────────────────────────────────
-- get_user_trip_stats (legacy lifetime-only RPC; still consumed by
-- submissions.ts:295 for backwards-compatible callers)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_trip_stats(requesting_user_id UUID)
RETURNS TABLE(
  total_trips BIGINT,
  total_distance_meters DOUBLE PRECISION,
  total_duration_seconds DOUBLE PRECISION
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    COUNT(*),
    COALESCE(SUM(COALESCE(actual_distance_meters, planned_route_distance_meters, 0)), 0),
    COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp))), 0)
  FROM trip_tracks
  WHERE user_id = requesting_user_id
    AND end_reason <> 'in_progress';
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- get_user_public_profile — community profile lifetime totals
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_public_profile(p_user_id UUID, p_requesting_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result JSONB;
  v_profile RECORD;
  v_trip_count INT;
  v_total_distance NUMERIC;
  v_followers INT;
  v_following INT;
  v_follow_status TEXT;
  v_is_private BOOLEAN;
  v_trips JSONB;
  v_total_co2 NUMERIC;
  v_total_hazards INT;
BEGIN
  SELECT display_name, username, avatar_url, rider_tier, is_private
  INTO v_profile FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_is_private := COALESCE(v_profile.is_private, false);

  SELECT COUNT(*)::INT, COALESCE(SUM(actual_distance_meters), 0)::NUMERIC
  INTO v_trip_count, v_total_distance
  FROM trip_tracks WHERE user_id = p_user_id AND end_reason <> 'in_progress';

  v_total_co2 := ROUND((v_total_distance * 0.00012)::numeric, 2);

  SELECT COUNT(*)::INT INTO v_total_hazards FROM hazards WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_followers FROM user_follows WHERE following_id = p_user_id AND status = 'accepted';
  SELECT COUNT(*)::INT INTO v_following FROM user_follows WHERE follower_id = p_user_id AND status = 'accepted';

  SELECT COALESCE(uf.status, 'none') INTO v_follow_status
  FROM (SELECT 'none' AS status) d
  LEFT JOIN user_follows uf ON uf.follower_id = p_requesting_user_id AND uf.following_id = p_user_id;

  SELECT COALESCE(jsonb_agg(item ORDER BY item_created DESC), '[]'::jsonb) INTO v_trips
  FROM (
    SELECT
      jsonb_build_object(
        'id', af.id,
        'title', af.payload->>'title',
        'distanceMeters', (af.payload->>'distanceMeters')::numeric,
        'durationSeconds', (af.payload->>'durationSeconds')::numeric,
        'safetyRating', (af.payload->>'safetyRating')::int,
        'sharedAt', af.created_at,
        'geometryPolyline6', af.payload->>'geometryPolyline6'
      ) AS item,
      af.created_at AS item_created
    FROM activity_feed af
    WHERE af.user_id = p_user_id AND af.type = 'ride'
    ORDER BY af.created_at DESC
    LIMIT 20
  ) sub;

  result := jsonb_build_object(
    'id', p_user_id,
    'displayName', COALESCE(v_profile.display_name, 'Rider'),
    'username', v_profile.username,
    'avatarUrl', v_profile.avatar_url,
    'riderTier', COALESCE(v_profile.rider_tier, 'kickstand'),
    'totalTrips', v_trip_count,
    'totalDistanceMeters', v_total_distance,
    'totalCo2SavedKg', v_total_co2,
    'totalHazardsReported', v_total_hazards,
    'followersCount', v_followers,
    'followingCount', v_following,
    'isFollowedByMe', (v_follow_status = 'accepted'),
    'followStatus', v_follow_status,
    'isPrivate', v_is_private,
    'recentTrips', v_trips
  );

  RETURN result;
END;
$function$;
