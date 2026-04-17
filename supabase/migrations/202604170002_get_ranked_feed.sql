-- ═══════════════════════════════════════════════════════════════════════════
-- Social Network — Ranked Feed RPC
-- Blended feed: own posts + followed users (any distance) + nearby strangers
-- Scoring: recency_decay × (type_weight + follow_boost + own_demotion
--          + reaction_score + comment_score + proximity_score)
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_ranked_feed(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_ranked_feed(
  p_viewer_id UUID,
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_cursor_score DOUBLE PRECISION DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ,
  like_count BIGINT,
  love_count BIGINT,
  comment_count BIGINT,
  liked_by_me BOOLEAN,
  loved_by_me BOOLEAN,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  rider_tier TEXT,
  score DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_ranked_feed(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ranked_feed(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER) TO service_role;
