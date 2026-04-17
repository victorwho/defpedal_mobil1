-- ═══════════════════════════════════════════════════════════════════════════
-- Social Network — Suggested Users RPC
-- Ranks potential follow targets by nearby activity + route similarity
-- Excludes already-followed users and the viewer
-- Private users still appear (following triggers request flow)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_suggested_users(
  p_viewer_id UUID,
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  rider_tier TEXT,
  activity_count BIGINT,
  mutual_follows BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point GEOGRAPHY;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

  RETURN QUERY
  WITH
  -- Users the viewer already follows (any status)
  already_following AS (
    SELECT uf.following_id
    FROM user_follows uf
    WHERE uf.follower_id = p_viewer_id
  ),
  -- Users who follow the viewer (for mutual follow detection)
  viewer_followers AS (
    SELECT uf.follower_id
    FROM user_follows uf
    WHERE uf.following_id = p_viewer_id
      AND uf.status = 'accepted'
  ),
  -- Nearby active users in last 30 days
  nearby_active AS (
    SELECT
      af.user_id AS uid,
      COUNT(*) AS act_count
    FROM activity_feed af
    WHERE af.created_at > now() - interval '30 days'
      AND af.user_id != p_viewer_id
      AND af.user_id NOT IN (SELECT following_id FROM already_following)
      AND af.location IS NOT NULL
      AND ST_DWithin(af.location, v_point, 15000)  -- 15km radius
    GROUP BY af.user_id
    HAVING COUNT(*) >= 1
  ),
  -- Mutual follow counts (people who follow the viewer AND are followed by the candidate)
  with_mutuals AS (
    SELECT
      na.uid,
      na.act_count,
      (
        SELECT COUNT(*)
        FROM user_follows uf1
        WHERE uf1.follower_id = na.uid
          AND uf1.status = 'accepted'
          AND uf1.following_id IN (SELECT follower_id FROM viewer_followers)
      ) AS mutual_count
    FROM nearby_active na
  )
  SELECT
    wm.uid AS user_id,
    COALESCE(p.display_name, 'Rider') AS display_name,
    p.avatar_url,
    COALESCE(p.rider_tier, 'kickstand') AS rider_tier,
    wm.act_count AS activity_count,
    wm.mutual_count AS mutual_follows
  FROM with_mutuals wm
  JOIN profiles p ON p.id = wm.uid
  ORDER BY
    wm.mutual_count DESC,   -- Mutual connections first
    wm.act_count DESC,      -- Then most active
    wm.uid                  -- Stable tiebreaker
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_suggested_users(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_suggested_users(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO service_role;
