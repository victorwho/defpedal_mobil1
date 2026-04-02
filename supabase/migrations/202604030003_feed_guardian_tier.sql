-- Add guardian_tier to get_nearby_feed profiles JSONB
-- Must DROP first because return type is unchanged but JSONB content changes.

DROP FUNCTION IF EXISTS get_nearby_feed(double precision, double precision, double precision, integer, timestamptz, uuid);

CREATE OR REPLACE FUNCTION get_nearby_feed(
  user_lat double precision,
  user_lon double precision,
  radius_meters double precision,
  feed_limit int,
  cursor_shared_at timestamptz,
  requesting_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  start_location_text text,
  destination_text text,
  distance_meters numeric,
  duration_seconds numeric,
  elevation_gain_meters numeric,
  average_speed_mps numeric,
  safety_rating int,
  safety_tags text[],
  geometry_polyline6 text,
  note text,
  shared_at timestamptz,
  like_count bigint,
  love_count int,
  comment_count bigint,
  liked_by_me boolean,
  loved_by_me boolean,
  profiles jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ts.id,
    ts.user_id,
    ts.title,
    ts.start_location_text,
    ts.destination_text,
    ts.distance_meters,
    ts.duration_seconds,
    ts.elevation_gain_meters,
    ts.average_speed_mps,
    ts.safety_rating,
    ts.safety_tags,
    ts.geometry_polyline6,
    ts.note,
    ts.shared_at,
    COALESCE(lc.cnt, 0) AS like_count,
    COALESCE(tl.cnt, 0)::int AS love_count,
    COALESCE(cc.cnt, 0) AS comment_count,
    EXISTS(
      SELECT 1 FROM feed_likes fl
      WHERE fl.trip_share_id = ts.id AND fl.user_id = requesting_user_id
    ) AS liked_by_me,
    EXISTS(
      SELECT 1 FROM trip_loves tl2
      WHERE tl2.trip_share_id = ts.id AND tl2.user_id = requesting_user_id
    ) AS loved_by_me,
    jsonb_build_object(
      'display_name', COALESCE(p.display_name, 'Rider'),
      'avatar_url', p.avatar_url,
      'guardian_tier', p.guardian_tier
    ) AS profiles
  FROM trip_shares ts
  LEFT JOIN profiles p ON p.id = ts.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM feed_likes fl WHERE fl.trip_share_id = ts.id
  ) lc ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM trip_loves tl WHERE tl.trip_share_id = ts.id
  ) tl ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM feed_comments fc WHERE fc.trip_share_id = ts.id
  ) cc ON true
  WHERE ST_DWithin(
    ts.start_coordinate,
    ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
    radius_meters
  )
  AND (cursor_shared_at IS NULL OR ts.shared_at < cursor_shared_at)
  ORDER BY ts.shared_at DESC
  LIMIT feed_limit;
$$;
