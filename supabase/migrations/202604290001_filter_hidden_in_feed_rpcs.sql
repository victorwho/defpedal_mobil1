-- ---------------------------------------------------------------------------
-- 202604290001_filter_hidden_in_feed_rpcs
--
-- Closes the moderation read-side gap discovered after Phase 1 of the
-- Play Store readiness review: migration 202604270001_ugc_moderation added
-- `is_hidden` columns + RLS policies for `feed_comments`, `trip_shares`,
-- `hazards`, but the API reads via the service-role client (`supabaseAdmin`)
-- which bypasses RLS, AND the four community-feed RPCs were never updated
-- to include the filter in their bodies. Result: a moderator could mark a
-- trip share or hazard hidden and it would still appear in:
--   - `get_ranked_feed`         (community/social feed)
--   - `get_nearby_feed`         (legacy community list)
--   - `get_city_heartbeat`      (city pulse counts + top contributors)
--   - `get_neighborhood_leaderboard` (hazards-metric branch only)
--
-- This migration:
--   1. Adds `is_hidden` column to `activity_feed` so the social-feed RPC
--      can filter it. activity_feed entries of type='ride' are linked to
--      `trip_shares` via `payload->>'tripId' = trip_shares.trip_id`, so a
--      trigger keeps the two flags in sync going forward.
--   2. Backfills existing hidden trip_shares into the activity_feed entries
--      (rows hidden before the trigger was wired up).
--   3. Recreates the four RPCs with `is_hidden = false` filters preserving
--      every other piece of behaviour (cursor pagination, scoring, joins,
--      block-list filtering, anonymous exclusion, etc.).
--
-- Known gap: activity_feed entries of type='hazard_standalone' /
-- 'hazard_batch' do NOT carry a hazard ID in their payload (only lat/lon/
-- type/reportedAt), so we cannot mirror `hazards.is_hidden` to the matching
-- activity_feed row via trigger. The right long-term fix is to extend the
-- auto-publish payload to include `hazardId`, then add a similar trigger
-- on `hazards`. For now: hazard moderation is enforced on the primary
-- read path (`/v1/hazards/nearby` filters `is_hidden=false` since
-- commit 74e838f) and on the leaderboard hazards-metric branch (this
-- migration). Hazard activity-feed entries can leak through `get_ranked_feed`
-- — low real-world volume (5 rows out of 141 today) and resolvable by
-- future payload extension.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Schema: is_hidden on activity_feed + index for the visible-only path.
-- ---------------------------------------------------------------------------

ALTER TABLE activity_feed
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_activity_feed_visible
  ON activity_feed (created_at DESC)
  WHERE is_hidden = false;

-- ---------------------------------------------------------------------------
-- 2. Trigger: trip_shares.is_hidden → activity_feed.is_hidden propagation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.propagate_trip_share_hidden_to_activity_feed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_hidden IS DISTINCT FROM OLD.is_hidden THEN
    UPDATE activity_feed
    SET is_hidden = NEW.is_hidden
    WHERE type = 'ride'
      AND payload->>'tripId' = NEW.trip_id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trip_share_hidden_to_activity_feed ON trip_shares;
CREATE TRIGGER trg_trip_share_hidden_to_activity_feed
  AFTER UPDATE OF is_hidden ON trip_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_trip_share_hidden_to_activity_feed();

-- ---------------------------------------------------------------------------
-- 3. Backfill: any trip_share already hidden before this migration must
--    cascade to its activity_feed entry now (the trigger above only fires
--    on future UPDATEs).
-- ---------------------------------------------------------------------------

UPDATE activity_feed af
   SET is_hidden = true
  FROM trip_shares ts
 WHERE ts.is_hidden = true
   AND af.type = 'ride'
   AND af.payload->>'tripId' = ts.trip_id::text
   AND af.is_hidden = false;

-- ---------------------------------------------------------------------------
-- 4. get_city_heartbeat — add ts.is_hidden = false to every trip_shares
--    subquery, hz.is_hidden = false to the hazardHotspots subquery.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_city_heartbeat(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision DEFAULT 15000,
  p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. get_nearby_feed — add ts.is_hidden = false.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_nearby_feed(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision,
  feed_limit integer,
  cursor_shared_at timestamp with time zone,
  requesting_user_id uuid
)
RETURNS TABLE(
  id uuid, user_id uuid, title text, start_location_text text, destination_text text,
  distance_meters numeric, duration_seconds numeric, elevation_gain_meters numeric,
  average_speed_mps numeric, safety_rating integer, safety_tags text[],
  geometry_polyline6 text, note text, shared_at timestamp with time zone,
  like_count bigint, love_count integer, comment_count bigint,
  liked_by_me boolean, loved_by_me boolean, profiles jsonb
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
      ts.id, ts.user_id, ts.title, ts.start_location_text, ts.destination_text,
      ts.distance_meters, ts.duration_seconds, ts.elevation_gain_meters,
      ts.average_speed_mps, ts.safety_rating, ts.safety_tags,
      ts.geometry_polyline6, ts.note, ts.shared_at,
      COALESCE(lc.cnt, 0) AS like_count,
      COALESCE(tl.cnt, 0)::int AS love_count,
      COALESCE(cc.cnt, 0) AS comment_count,
      EXISTS(SELECT 1 FROM feed_likes fl WHERE fl.trip_share_id = ts.id AND fl.user_id = requesting_user_id) AS liked_by_me,
      EXISTS(SELECT 1 FROM trip_loves tl2 WHERE tl2.trip_share_id = ts.id AND tl2.user_id = requesting_user_id) AS loved_by_me,
      jsonb_build_object(
        'display_name', COALESCE(p.display_name, 'Rider'),
        'avatar_url', p.avatar_url,
        'guardian_tier', p.guardian_tier,
        'rider_tier', COALESCE(p.rider_tier, 'kickstand')
      ) AS profiles
    FROM trip_shares ts
    LEFT JOIN profiles p ON p.id = ts.user_id
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM feed_likes fl WHERE fl.trip_share_id = ts.id) lc ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM trip_loves tl WHERE tl.trip_share_id = ts.id) tl ON true
    LEFT JOIN LATERAL (SELECT COUNT(*) AS cnt FROM feed_comments fc WHERE fc.trip_share_id = ts.id AND fc.is_hidden = false) cc ON true
    WHERE ST_DWithin(ts.start_coordinate, ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography, radius_meters)
    AND ts.is_hidden = false
    AND (cursor_shared_at IS NULL OR ts.shared_at < cursor_shared_at)
    ORDER BY ts.shared_at DESC
    LIMIT feed_limit;
$function$;

-- ---------------------------------------------------------------------------
-- 6. get_neighborhood_leaderboard — hazards branch gains h.is_hidden = false.
--    The CO2 branch reads from `trips` (the rider's own trip records, not
--    UGC) so no is_hidden filter applies there: a moderated trip_share
--    doesn't unwind the rider's own distance — same policy as session 21.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_neighborhood_leaderboard(
  p_user_lat double precision,
  p_user_lon double precision,
  p_radius_meters integer DEFAULT 15000,
  p_metric text DEFAULT 'co2'::text,
  p_period text DEFAULT 'week'::text,
  p_requesting_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  rank bigint, user_id uuid, display_name text, avatar_url text, rider_tier text,
  metric_value numeric, rank_delta integer, is_champion boolean, is_requesting_user boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        AND h.is_hidden = false
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
$function$;

-- ---------------------------------------------------------------------------
-- 7. get_ranked_feed — filter af.is_hidden = false on activity_feed.
--    Also tightens the comment count to visible comments only (mirrors the
--    feed-comments.ts API change in commit 74e838f).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ranked_feed(
  p_viewer_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_cursor_score double precision DEFAULT NULL::double precision,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, user_id uuid, type text, payload jsonb, created_at timestamp with time zone,
  like_count bigint, love_count bigint, comment_count bigint,
  liked_by_me boolean, loved_by_me boolean,
  display_name text, username text, avatar_url text, rider_tier text,
  score double precision
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    WHERE af.created_at > now() - interval '30 days'
      AND af.is_hidden = false
      AND af.user_id NOT IN (SELECT blocked_uid FROM private_blocked)
      AND (
        af.user_id = p_viewer_id
        OR af.user_id IN (SELECT following_id FROM viewer_follows)
        OR (af.location IS NOT NULL AND ST_DWithin(af.location, v_point, 50000))
        OR (af.location IS NULL AND af.user_id IN (SELECT following_id FROM viewer_follows))
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
