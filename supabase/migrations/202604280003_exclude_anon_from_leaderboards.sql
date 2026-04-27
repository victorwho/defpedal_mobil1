-- Hide anonymous (pre-signup) users from the City Heartbeat top contributors
-- list and the Neighborhood Safety Leaderboard. Their trips still count in
-- the community totals (today / daily / totals on city_heartbeat,
-- get_community_stats) — only the named, ranked surfaces are filtered.
--
-- Strategy: denormalize `auth.users.is_anonymous` onto `profiles` so the
-- existing public RPCs can filter without needing to read the auth schema
-- (which would force SECURITY DEFINER + auth grants on what are currently
-- plain STABLE functions).
--
-- The flag is kept in sync via:
--   1. handle_new_user trigger — captures is_anonymous on profile creation
--   2. sync_profile_is_anonymous trigger — flips the profile flag when an
--      anonymous user upgrades to a real account (Supabase preserves the
--      same auth.users.id but updates is_anonymous to false).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.is_anonymous column + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

UPDATE profiles p
   SET is_anonymous = COALESCE(u.is_anonymous, false)
  FROM auth.users u
 WHERE u.id = p.id
   AND p.is_anonymous IS DISTINCT FROM COALESCE(u.is_anonymous, false);

-- ---------------------------------------------------------------------------
-- 2. handle_new_user — capture is_anonymous on profile creation
--    (Replaces 202604220001's version; same body plus is_anonymous insert.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO profiles (id, display_name, auto_share_rides, trim_route_endpoints, is_anonymous)
  VALUES (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1),
      ''
    ),
    true,
    true,
    coalesce(new.is_anonymous, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. sync_profile_is_anonymous — flips profile flag on anon → real upgrade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_is_anonymous()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.is_anonymous IS DISTINCT FROM OLD.is_anonymous THEN
    UPDATE public.profiles
       SET is_anonymous = COALESCE(NEW.is_anonymous, false)
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_is_anonymous_trigger ON auth.users;
CREATE TRIGGER sync_profile_is_anonymous_trigger
  AFTER UPDATE OF is_anonymous ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_is_anonymous();

-- ---------------------------------------------------------------------------
-- 4. get_city_heartbeat — exclude anon from topContributors only.
--    today / daily / totals / hazardHotspots remain unchanged so anon
--    users' trips still contribute to community-wide aggregates.
-- ---------------------------------------------------------------------------
create or replace function get_city_heartbeat(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision default 15000,
  p_days integer default 7
)
returns jsonb
language plpgsql stable
as $$
declare
  v_point geography;
  v_today date;
  v_since date;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  v_today := current_date;
  v_since := v_today - (p_days - 1);

  select jsonb_build_object(
    -- Today's pulse (community-wide; anon trips count here)
    'today', (
      select jsonb_build_object(
        'rides',          coalesce(count(*)::int, 0),
        'distanceMeters', coalesce(sum(ts.distance_meters::double precision), 0),
        'co2SavedKg',     round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'activeRiders',   coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
        and ts.shared_at::date = v_today
    ),

    -- Daily activity for chart (community-wide; anon trips count here)
    'daily', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'day',              d.day,
          'rides',            d.rides,
          'distanceMeters',   d.distance_meters,
          'co2SavedKg',       round((d.distance_meters / 1000.0 * 0.12)::numeric, 2),
          'communitySeconds', round((d.distance_meters / 1000.0 * 4.5)::numeric)
        ) order by d.day
      ), '[]'::jsonb)
      from (
        select
          ts.shared_at::date as day,
          count(*)::int as rides,
          coalesce(sum(ts.distance_meters::double precision), 0) as distance_meters
        from trip_shares ts
        where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    -- Cumulative totals (community-wide; anon trips count here)
    'totals', (
      select jsonb_build_object(
        'rides',            coalesce(count(*)::int, 0),
        'distanceMeters',   coalesce(sum(ts.distance_meters::double precision), 0),
        'durationSeconds',  coalesce(sum(ts.duration_seconds::double precision), 0),
        'co2SavedKg',       round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'uniqueRiders',     coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
    ),

    -- Hazard hotspots (top 5 types in last 7 days)
    'hazardHotspots', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'hazardType', h.hazard_type,
          'count',      h.cnt,
          'lat',        h.avg_lat,
          'lon',        h.avg_lon
        ) order by h.cnt desc
      ), '[]'::jsonb)
      from (
        select
          hz.hazard_type,
          count(*)::int as cnt,
          round(avg((hz.location->>'lat')::double precision)::numeric, 5) as avg_lat,
          round(avg((hz.location->>'lon')::double precision)::numeric, 5) as avg_lon
        from hazards hz
        where hz.hazard_type is not null
          and hz.created_at >= (now() - interval '7 days')
          and ST_DWithin(
            ST_SetSRID(ST_MakePoint(
              (hz.location->>'lon')::double precision,
              (hz.location->>'lat')::double precision
            ), 4326)::geography,
            v_point,
            radius_meters
          )
        group by hz.hazard_type
        order by cnt desc
        limit 5
      ) h
    ),

    -- Top 5 contributors — only signed-up users who share publicly
    'topContributors', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'displayName', c.display_name,
          'avatarUrl',   c.avatar_url,
          'rideCount',   c.ride_count,
          'distanceKm',  round((c.total_distance_m / 1000.0)::numeric, 1)
        ) order by c.ride_count desc
      ), '[]'::jsonb)
      from (
        select
          p.display_name,
          p.avatar_url,
          count(*)::int as ride_count,
          coalesce(sum(ts.distance_meters::double precision), 0) as total_distance_m
        from trip_shares ts
        join profiles p on p.id = ts.user_id
        where ST_DWithin(ts.start_coordinate, v_point, radius_meters)
          and p.auto_share_rides = true
          and p.is_anonymous = false
        group by p.id, p.display_name, p.avatar_url
        order by ride_count desc
        limit 5
      ) c
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_neighborhood_leaderboard — exclude anon from ranking pool.
--    Both UNION branches gain `AND p.is_anonymous = false`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_neighborhood_leaderboard(
  p_user_lat DOUBLE PRECISION,
  p_user_lon DOUBLE PRECISION,
  p_radius_meters INTEGER DEFAULT 15000,
  p_metric TEXT DEFAULT 'co2',
  p_period TEXT DEFAULT 'week',
  p_requesting_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  rank BIGINT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  rider_tier TEXT,
  metric_value NUMERIC,
  rank_delta INTEGER,
  is_champion BOOLEAN,
  is_requesting_user BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geography;
  v_period_start TIMESTAMPTZ;
  v_prev_period_type TEXT;
  v_prev_period_end DATE;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_user_lon, p_user_lat), 4326)::geography;

  IF p_period = 'week' THEN
    v_period_start := date_trunc('week', now() AT TIME ZONE 'UTC')::date + interval '4 hours';
    v_prev_period_type := 'weekly';
    v_prev_period_end := (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 1);
  ELSIF p_period = 'month' THEN
    v_period_start := date_trunc('month', now() AT TIME ZONE 'UTC')::date + interval '4 hours';
    v_prev_period_type := 'monthly';
    v_prev_period_end := (date_trunc('month', now() AT TIME ZONE 'UTC')::date - 1);
  ELSE
    v_period_start := NULL;
    v_prev_period_type := 'weekly';
    v_prev_period_end := (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 1);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT * FROM (
      -- CO2 metric (signed-up sharers only)
      SELECT
        p.id AS uid,
        COALESCE(p.username, p.display_name, 'Rider') AS dname,
        p.avatar_url AS aurl,
        COALESCE(p.rider_tier, 'kickstand') AS rtier,
        COALESCE(SUM(t.distance_meters * 0.00012), 0) AS mval
      FROM trips t
      JOIN profiles p ON p.id = t.user_id
      WHERE p_metric = 'co2'
        AND t.start_location IS NOT NULL
        AND t.distance_meters > 0
        AND ST_DWithin(t.start_location, v_point, p_radius_meters)
        AND (v_period_start IS NULL OR t.started_at >= v_period_start)
        AND (p.auto_share_rides = true OR p.id = p_requesting_user_id)
        AND p.is_anonymous = false
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rider_tier
      HAVING SUM(t.distance_meters * 0.00012) > 0

      UNION ALL

      -- Hazards metric (signed-up sharers only)
      SELECT
        p.id AS uid,
        COALESCE(p.username, p.display_name, 'Rider') AS dname,
        p.avatar_url AS aurl,
        COALESCE(p.rider_tier, 'kickstand') AS rtier,
        COUNT(*)::NUMERIC AS mval
      FROM hazards h
      JOIN profiles p ON p.id = h.user_id
      WHERE p_metric = 'hazards'
        AND h.user_id IS NOT NULL
        AND h.location IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(
            (h.location->>'longitude')::double precision,
            (h.location->>'latitude')::double precision
          ), 4326)::geography,
          v_point,
          p_radius_meters
        )
        AND (v_period_start IS NULL OR h.created_at >= v_period_start)
        AND (p.auto_share_rides = true OR p.id = p_requesting_user_id)
        AND p.is_anonymous = false
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rider_tier
      HAVING COUNT(*) > 0
    ) combined
  ),
  with_rank AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY r.mval DESC, r.uid) AS rk,
      r.*
    FROM ranked r
  ),
  top50 AS (
    SELECT * FROM with_rank WHERE rk <= 50
  ),
  latest_champion AS (
    SELECT ls.user_id AS champ_uid
    FROM leaderboard_snapshots ls
    WHERE ls.metric = p_metric
      AND ls.period_type = v_prev_period_type
      AND ls.rank = 1
    ORDER BY ls.period_end DESC
    LIMIT 1
  ),
  prev_ranks AS (
    SELECT ls.user_id AS prev_uid, ls.rank AS prev_rank
    FROM leaderboard_snapshots ls
    WHERE ls.metric = p_metric
      AND ls.period_type = v_prev_period_type
      AND ls.period_end = v_prev_period_end
  )
  SELECT
    t.rk AS rank,
    t.uid AS user_id,
    t.dname AS display_name,
    t.aurl AS avatar_url,
    t.rtier AS rider_tier,
    ROUND(t.mval, 2) AS metric_value,
    CASE
      WHEN pr.prev_rank IS NOT NULL THEN (pr.prev_rank - t.rk)::INTEGER
      ELSE NULL
    END AS rank_delta,
    (lc.champ_uid IS NOT NULL) AS is_champion,
    (t.uid = p_requesting_user_id) AS is_requesting_user
  FROM top50 t
  LEFT JOIN latest_champion lc ON lc.champ_uid = t.uid
  LEFT JOIN prev_ranks pr ON pr.prev_uid = t.uid

  UNION ALL

  -- Append requesting user if not in top 50 (only meaningful for non-anon
  -- users — anon callers won't appear in `with_rank` because the CTE filters
  -- them out, so this branch returns no rows for them.)
  SELECT
    wr.rk AS rank,
    wr.uid AS user_id,
    wr.dname AS display_name,
    wr.aurl AS avatar_url,
    wr.rtier AS rider_tier,
    ROUND(wr.mval, 2) AS metric_value,
    CASE
      WHEN pr2.prev_rank IS NOT NULL THEN (pr2.prev_rank - wr.rk)::INTEGER
      ELSE NULL
    END AS rank_delta,
    (lc2.champ_uid IS NOT NULL) AS is_champion,
    true AS is_requesting_user
  FROM with_rank wr
  LEFT JOIN latest_champion lc2 ON lc2.champ_uid = wr.uid
  LEFT JOIN prev_ranks pr2 ON pr2.prev_uid = wr.uid
  WHERE p_requesting_user_id IS NOT NULL
    AND wr.uid = p_requesting_user_id
    AND wr.rk > 50

  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_neighborhood_leaderboard(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_neighborhood_leaderboard(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, UUID) TO service_role;

COMMIT;
