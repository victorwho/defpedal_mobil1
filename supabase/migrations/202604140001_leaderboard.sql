-- ═══════════════════════════════════════════════════════════════════════════
-- Neighborhood Safety Leaderboard
-- 1. leaderboard_snapshots table (weekly/monthly champion history)
-- 2. Badge definitions for champion badges
-- 3. get_neighborhood_leaderboard RPC (spatial leaderboard with rank delta)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. leaderboard_snapshots — historical record of leaderboard results
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('co2', 'hazards')),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rank INTEGER NOT NULL,
  value NUMERIC NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_leaderboard_period_metric
  ON leaderboard_snapshots(period_type, metric, period_end);
CREATE INDEX idx_leaderboard_user_metric
  ON leaderboard_snapshots(user_id, metric);

-- RLS
ALTER TABLE leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own snapshots"
  ON leaderboard_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts snapshots"
  ON leaderboard_snapshots FOR INSERT
  WITH CHECK (true);

GRANT SELECT ON leaderboard_snapshots TO authenticated;
GRANT ALL ON leaderboard_snapshots TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Champion badge definitions (6 badges)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO badge_definitions
  (badge_key, category, display_tab, name, flavor_text, criteria_text, criteria_unit, tier, tier_family, is_hidden, is_seasonal, sort_order, icon_key)
VALUES
  ('co2_weekly_champion',
   'community', 'community',
   'Green Crown',
   'This week, nobody saved more CO2 than you.',
   'Finish #1 in weekly CO2 savings leaderboard',
   NULL, 0, 'co2_champion', false, false, 600, 'co2_champion'),

  ('co2_monthly_champion',
   'community', 'community',
   'Emerald Throne',
   'A month of leading the charge against emissions.',
   'Finish #1 in monthly CO2 savings leaderboard',
   NULL, 0, 'co2_champion', false, false, 601, 'co2_champion'),

  ('hazard_weekly_champion',
   'community', 'community',
   'Watchdog Crown',
   'More reports than anyone this week. The streets are safer.',
   'Finish #1 in weekly hazard reporting leaderboard',
   NULL, 0, 'hazard_champion', false, false, 602, 'hazard_champion'),

  ('hazard_monthly_champion',
   'community', 'community',
   'Guardian Shield',
   'A whole month as the neighborhood''s top hazard reporter.',
   'Finish #1 in monthly hazard reporting leaderboard',
   NULL, 0, 'hazard_champion', false, false, 603, 'hazard_champion'),

  ('co2_champion_repeat',
   'community', 'community',
   'Serial Saver',
   'Five weekly crowns. You don''t just win — you dominate.',
   'Win the weekly CO2 leaderboard 5 times',
   'wins', 1, 'co2_champion', false, false, 604, 'co2_champion'),

  ('hazard_champion_repeat',
   'community', 'community',
   'Eternal Watchdog',
   'Ten weekly wins. This neighborhood is your beat.',
   'Win the weekly hazard leaderboard 10 times',
   'wins', 1, 'hazard_champion', false, false, 605, 'hazard_champion')
ON CONFLICT (badge_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_neighborhood_leaderboard RPC
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Determine period start (4AM UTC cutoff like streak engine)
  IF p_period = 'week' THEN
    -- Current Monday at 4AM UTC
    v_period_start := date_trunc('week', now() AT TIME ZONE 'UTC')::date + interval '4 hours';
    v_prev_period_type := 'weekly';
    v_prev_period_end := (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 1);
  ELSIF p_period = 'month' THEN
    -- 1st of current month at 4AM UTC
    v_period_start := date_trunc('month', now() AT TIME ZONE 'UTC')::date + interval '4 hours';
    v_prev_period_type := 'monthly';
    v_prev_period_end := (date_trunc('month', now() AT TIME ZONE 'UTC')::date - 1);
  ELSE
    -- 'all' — no date filter
    v_period_start := NULL;
    v_prev_period_type := 'weekly';
    v_prev_period_end := (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 1);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT * FROM (
      -- CO2 metric: compute from trips.distance_meters (120g CO2/km = 0.00012 kg/m)
      -- Uses trips table directly so ALL completed trips count retroactively
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
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.rider_tier
      HAVING SUM(t.distance_meters * 0.00012) > 0

      UNION ALL

      -- Hazards metric: count from hazards table
      -- Fixed: location JSONB uses 'latitude'/'longitude' keys (not 'lat'/'lon')
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
  -- Latest completed period champion (rank=1)
  latest_champion AS (
    SELECT ls.user_id AS champ_uid
    FROM leaderboard_snapshots ls
    WHERE ls.metric = p_metric
      AND ls.period_type = v_prev_period_type
      AND ls.rank = 1
    ORDER BY ls.period_end DESC
    LIMIT 1
  ),
  -- Previous period ranks for delta calculation
  prev_ranks AS (
    SELECT ls.user_id AS prev_uid, ls.rank AS prev_rank
    FROM leaderboard_snapshots ls
    WHERE ls.metric = p_metric
      AND ls.period_type = v_prev_period_type
      AND ls.period_end = v_prev_period_end
  )
  -- Top 50 rows
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

  -- Append requesting user if not in top 50
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
