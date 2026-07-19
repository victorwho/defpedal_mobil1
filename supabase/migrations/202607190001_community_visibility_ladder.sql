-- Community visibility ladder (2026-07-19)
--
-- Community surfaces felt empty because they sliced by "today" + a 15 km
-- radius. This migration adds the server-side data for the honest-widening
-- ladder (see packages/core/src/communityVisibility.ts for the ladder
-- decision logic and thresholds — the RPCs stay dumb and parameterized):
--
--   1. get_community_pulse_counts  — 9 ride counts (window × scope) so the
--      API can pick the City Heartbeat rung in one cheap round trip.
--   2. get_activity_feed_scope_counts — candidate-item counts per scope for
--      the ranked feed's radius ladder.
--   3. get_city_heartbeat — rewritten FROM THE LIVE DEFINITION (which has
--      is_hidden filters + is_anonymous on contributors that the old repo
--      migration lacked). Adds: windowed/scoped `pulse`, scope-resolved
--      chartDaily (7d) + chartWeekly (4×7d buckets), community-wide
--      lifetime `communityTotals`, and scope-aware topContributors.
--      Legacy keys (today/daily/totals/hazardHotspots) keep their exact
--      pre-ladder semantics at the nearby radius so old API revisions and
--      old cached clients stay correct. Hazard hotspots deliberately stay
--      nearby-only (hazards 100 km away are noise, not community warmth).
--   4. get_ranked_feed — rewritten FROM THE LIVE DEFINITION. The hard-coded
--      50 km radius and 30-day cutoff become parameters
--      (p_radius_meters NULL = no spatial filter; p_max_age_days) with
--      defaults preserving the old behavior, so the currently deployed API
--      revision keeps working until the new one ships.
--
-- Deploy order: apply this migration BEFORE the API revision that passes
-- the new arguments (all new params have old-behavior defaults).
-- NOTE: numbers rendered from these RPCs are always computed from real
-- rows — the ladder only widens what is shown, it never fabricates.

-- ---------------------------------------------------------------------------
-- 1. Pulse counts: rides per (window × scope) from trip_shares
-- ---------------------------------------------------------------------------

create or replace function get_community_pulse_counts(
  user_lat double precision,
  user_lon double precision,
  nearby_radius_meters double precision default 15000,
  region_radius_meters double precision default 100000
)
returns jsonb
language plpgsql stable
as $$
declare
  v_point geography;
  v_today date;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  v_today := current_date;

  select jsonb_build_object(
    'today', jsonb_build_object(
      'nearby',    count(*) filter (where d.day = v_today and d.within_nearby),
      'region',    count(*) filter (where d.day = v_today and d.within_region),
      'community', count(*) filter (where d.day = v_today)
    ),
    'week', jsonb_build_object(
      'nearby',    count(*) filter (where d.day > v_today - 7 and d.within_nearby),
      'region',    count(*) filter (where d.day > v_today - 7 and d.within_region),
      'community', count(*) filter (where d.day > v_today - 7)
    ),
    'month', jsonb_build_object(
      'nearby',    count(*) filter (where d.day > v_today - 30 and d.within_nearby),
      'region',    count(*) filter (where d.day > v_today - 30 and d.within_region),
      'community', count(*) filter (where d.day > v_today - 30)
    )
  ) into v_result
  from (
    select
      ts.shared_at::date as day,
      ST_DWithin(ts.start_coordinate, v_point, nearby_radius_meters) as within_nearby,
      ST_DWithin(ts.start_coordinate, v_point, region_radius_meters) as within_region
    from trip_shares ts
    where ts.is_hidden = false
      and ts.shared_at::date > v_today - 30
  ) d;

  return coalesce(v_result, jsonb_build_object(
    'today', jsonb_build_object('nearby', 0, 'region', 0, 'community', 0),
    'week',  jsonb_build_object('nearby', 0, 'region', 0, 'community', 0),
    'month', jsonb_build_object('nearby', 0, 'region', 0, 'community', 0)
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Feed scope counts: located candidate items per scope
-- ---------------------------------------------------------------------------

create or replace function get_activity_feed_scope_counts(
  user_lat double precision,
  user_lon double precision,
  nearby_radius_meters double precision default 50000,
  region_radius_meters double precision default 100000,
  p_max_age_days integer default 365
)
returns jsonb
language plpgsql stable
as $$
declare
  v_point geography;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;

  -- Only located items count toward the scope decision: location-NULL rows
  -- (old badge/tier events, private publishes) are follower-only in
  -- get_ranked_feed and would inflate the community rung otherwise.
  select jsonb_build_object(
    'nearby',    count(*) filter (where ST_DWithin(af.location, v_point, nearby_radius_meters)),
    'region',    count(*) filter (where ST_DWithin(af.location, v_point, region_radius_meters)),
    'community', count(*)
  ) into v_result
  from activity_feed af
  where af.is_hidden = false
    and af.location is not null
    and af.created_at > now() - make_interval(days => p_max_age_days);

  return coalesce(v_result, jsonb_build_object('nearby', 0, 'region', 0, 'community', 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. get_city_heartbeat — pulse ladder + charts + lifetime community totals
-- ---------------------------------------------------------------------------

-- The signature gains parameters; CREATE OR REPLACE would create an
-- overload and break PostgREST named-arg resolution, so drop the old one.
drop function if exists public.get_city_heartbeat(double precision, double precision, double precision, integer);

create or replace function get_city_heartbeat(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision default 15000,
  p_days integer default 7,
  p_pulse_window text default 'today',
  p_pulse_radius_meters double precision default 15000
)
returns jsonb
language plpgsql stable
as $$
declare
  v_point geography;
  v_today date;
  v_since date;
  v_pulse_since date;
  v_result jsonb;
begin
  v_point := ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography;
  v_today := current_date;
  v_since := v_today - (p_days - 1);

  -- Window → first day included in the pulse. Unknown values degrade to today.
  v_pulse_since := case p_pulse_window
    when 'month' then v_today - 29
    when 'week'  then v_today - 6
    else v_today
  end;

  select jsonb_build_object(
    -- Literal today @ nearby radius (legacy shape — old clients label it "Today")
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
        and ts.is_hidden = false
        and ts.shared_at::date = v_today
    ),

    -- Ladder-resolved pulse: window chosen by the API (today/week/month),
    -- radius NULL = community-wide.
    'pulse', (
      select jsonb_build_object(
        'rides',          coalesce(count(*)::int, 0),
        'distanceMeters', coalesce(sum(ts.distance_meters::double precision), 0),
        'co2SavedKg',     round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'activeRiders',   coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
        and ts.is_hidden = false
        and ts.shared_at::date >= v_pulse_since
        and ts.shared_at::date <= v_today
    ),

    -- Daily activity for chart (legacy: nearby radius)
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
          and ts.is_hidden = false
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    -- Daily activity at the ladder-resolved scope (last p_days days)
    'chartDaily', (
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
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
          and ts.shared_at::date >= v_since
          and ts.shared_at::date <= v_today
        group by ts.shared_at::date
      ) d
    ),

    -- Weekly buckets (4 × 7 days ending today) at the ladder-resolved scope.
    -- Empty buckets are emitted as zeros so the client renders 4 bars.
    'chartWeekly', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'weekStart',        w.week_start,
          'rides',            coalesce(b.rides, 0),
          'distanceMeters',   coalesce(b.distance_meters, 0),
          'co2SavedKg',       round((coalesce(b.distance_meters, 0) / 1000.0 * 0.12)::numeric, 2),
          'communitySeconds', round((coalesce(b.distance_meters, 0) / 1000.0 * 4.5)::numeric)
        ) order by w.week_start
      ), '[]'::jsonb)
      from (
        select g.idx, (v_today - (g.idx * 7 + 6))::date as week_start
        from generate_series(0, 3) as g(idx)
      ) w
      left join (
        select
          ((v_today - ts.shared_at::date) / 7)::int as idx,
          count(*)::int as rides,
          coalesce(sum(ts.distance_meters::double precision), 0) as distance_meters
        from trip_shares ts
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
          and ts.shared_at::date > v_today - 28
          and ts.shared_at::date <= v_today
        group by 1
      ) b on b.idx = w.idx
    ),

    -- Cumulative totals within the nearby radius (legacy shape, unchanged)
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
        and ts.is_hidden = false
    ),

    -- Lifetime community-wide totals (NO spatial filter — labeled as such
    -- in the UI; these only ever go up)
    'communityTotals', (
      select jsonb_build_object(
        'rides',            coalesce(count(*)::int, 0),
        'distanceMeters',   coalesce(sum(ts.distance_meters::double precision), 0),
        'durationSeconds',  coalesce(sum(ts.duration_seconds::double precision), 0),
        'co2SavedKg',       round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 0.12)::numeric, 2),
        'communitySeconds', round((coalesce(sum(ts.distance_meters::double precision), 0) / 1000.0 * 4.5)::numeric),
        'uniqueRiders',     coalesce(count(distinct ts.user_id)::int, 0)
      )
      from trip_shares ts
      where ts.is_hidden = false
    ),

    -- Hazard hotspots (top 5 types in last 7 days) — DELIBERATELY stays at
    -- the nearby radius; the UI hides the section when empty instead of
    -- widening (distant hazards are noise, not warmth).
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
          and hz.is_hidden = false
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

    -- Top 5 contributors at the ladder-resolved scope (radius NULL = all)
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
        where (p_pulse_radius_meters is null or ST_DWithin(ts.start_coordinate, v_point, p_pulse_radius_meters))
          and ts.is_hidden = false
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
-- 4. get_ranked_feed — parameterized radius + recency
-- ---------------------------------------------------------------------------

drop function if exists public.get_ranked_feed(uuid, double precision, double precision, double precision, uuid, integer);

create or replace function public.get_ranked_feed(
  p_viewer_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_cursor_score double precision default null,
  p_cursor_id uuid default null,
  p_limit integer default 20,
  p_radius_meters double precision default 50000,
  p_max_age_days integer default 30
)
returns table(
  id uuid, user_id uuid, type text, payload jsonb,
  created_at timestamp with time zone,
  like_count bigint, love_count bigint, comment_count bigint,
  liked_by_me boolean, loved_by_me boolean,
  display_name text, username text, avatar_url text, rider_tier text,
  score double precision
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_point GEOGRAPHY;
  v_half_life_hours DOUBLE PRECISION := 12.0;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

  RETURN QUERY
  WITH
  viewer_follows AS (
    SELECT uf.following_id FROM user_follows uf
    WHERE uf.follower_id = p_viewer_id AND uf.status = 'accepted'
  ),
  private_blocked AS (
    SELECT p.id AS blocked_uid FROM profiles p
    WHERE p.is_private = true AND p.id != p_viewer_id
      AND NOT EXISTS (
        SELECT 1 FROM user_follows uf2
        WHERE uf2.following_id = p.id AND uf2.follower_id = p_viewer_id AND uf2.status = 'accepted'
      )
  ),
  candidates AS (
    SELECT af.* FROM activity_feed af
    WHERE af.created_at > now() - make_interval(days => p_max_age_days)
      AND af.is_hidden = false
      AND af.user_id NOT IN (SELECT blocked_uid FROM private_blocked)
      AND (
        af.user_id = p_viewer_id
        OR af.user_id IN (SELECT following_id FROM viewer_follows)
        -- Location-NULL items stay follower-only regardless of scope:
        -- widening to 'community' (p_radius_meters NULL) must not surface
        -- events from users who never share a located activity.
        OR (
          af.location IS NOT NULL
          AND (p_radius_meters IS NULL OR ST_DWithin(af.location, v_point, p_radius_meters))
        )
      )
  ),
  scored AS (
    SELECT
      c.id, c.user_id, c.type, c.payload, c.created_at, c.location,
      COALESCE(likes.cnt, 0) AS like_count,
      COALESCE(loves.cnt, 0) AS love_count,
      COALESCE(comments.cnt, 0) AS comment_count,
      EXISTS (SELECT 1 FROM activity_reactions ar WHERE ar.activity_id = c.id AND ar.user_id = p_viewer_id AND ar.reaction_type = 'like') AS liked_by_me,
      EXISTS (SELECT 1 FROM activity_reactions ar WHERE ar.activity_id = c.id AND ar.user_id = p_viewer_id AND ar.reaction_type = 'love') AS loved_by_me,
      COALESCE(p.display_name, 'Rider') AS display_name,
      p.username,
      p.avatar_url,
      COALESCE(p.rider_tier, 'kickstand') AS rider_tier,
      (vf.following_id IS NOT NULL) AS is_followed,
      (c.user_id = p_viewer_id) AS is_own,
      EXP(-0.693147 * EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600.0 / v_half_life_hours) AS recency_decay,
      CASE c.type WHEN 'tier_up' THEN 1.5 WHEN 'ride' THEN 1.0 WHEN 'hazard_batch' THEN 0.9 WHEN 'hazard_standalone' THEN 0.9 WHEN 'badge_unlock' THEN 0.8 ELSE 1.0 END AS type_weight,
      CASE WHEN c.location IS NULL THEN 0.0 ELSE ST_Distance(c.location, v_point) END AS distance_meters
    FROM candidates c
    LEFT JOIN profiles p ON p.id = c.user_id
    LEFT JOIN viewer_follows vf ON vf.following_id = c.user_id
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM activity_reactions ar WHERE ar.activity_id = c.id AND ar.reaction_type = 'like') likes ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM activity_reactions ar WHERE ar.activity_id = c.id AND ar.reaction_type = 'love') loves ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM activity_comments ac WHERE ac.activity_id = c.id) comments ON true
  ),
  ranked AS (
    SELECT s.*,
      s.recency_decay * (
        s.type_weight
        + CASE WHEN s.is_followed THEN 3.0 ELSE 0.0 END
        + CASE WHEN s.is_own THEN -0.5 ELSE 0.0 END
        + LN(1.0 + s.like_count + s.love_count * 1.5)
        + LN(1.0 + s.comment_count) * 0.5
        + CASE WHEN s.distance_meters <= 5000 THEN 1.0 WHEN s.distance_meters <= 15000 THEN 0.7 WHEN s.distance_meters <= 50000 THEN 0.3 ELSE 0.0 END
      ) AS final_score
    FROM scored s
  )
  SELECT r.id, r.user_id, r.type, r.payload, r.created_at,
    r.like_count, r.love_count, r.comment_count, r.liked_by_me, r.loved_by_me,
    r.display_name, r.username, r.avatar_url, r.rider_tier, r.final_score AS score
  FROM ranked r
  WHERE (p_cursor_score IS NULL OR (r.final_score, r.id) < (p_cursor_score, p_cursor_id))
  ORDER BY r.final_score DESC, r.id DESC
  LIMIT p_limit;
END;
$function$;
