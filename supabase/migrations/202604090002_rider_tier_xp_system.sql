-- ═══════════════════════════════════════════════════════════════
-- Rider Tier & XP System
-- ═══════════════════════════════════════════════════════════════

-- 1. Tier definitions (reference table, seeded)
CREATE TABLE rider_tier_definitions (
  tier_level      INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  xp_required     INTEGER NOT NULL,
  tagline         TEXT NOT NULL,
  color           TEXT NOT NULL,
  pill_text_color TEXT NOT NULL DEFAULT '#FFFFFF',
  perk_description TEXT NOT NULL,
  sort_order      INTEGER NOT NULL
);

-- 2. XP event log (for breakdown, audit, analytics)
CREATE TABLE xp_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  action      TEXT NOT NULL,
  base_xp     INTEGER NOT NULL,
  multiplier  NUMERIC DEFAULT 1.0,
  final_xp    INTEGER NOT NULL,
  source_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_xp_events_user ON xp_events(user_id);
CREATE INDEX idx_xp_events_user_created ON xp_events(user_id, created_at DESC);

-- 3. Add XP and tier columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rider_tier TEXT DEFAULT 'kickstand';

-- 4. RLS policies
ALTER TABLE rider_tier_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read tier definitions"
  ON rider_tier_definitions FOR SELECT USING (true);

ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own XP events"
  ON xp_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own XP events"
  ON xp_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Drop the old guardian tier trigger (replaced by this system)
DROP TRIGGER IF EXISTS trigger_promote_guardian_tier ON profiles;
DROP FUNCTION IF EXISTS promote_guardian_tier();

-- ═══════════════════════════════════════════════════════════════
-- Seed Tier Definitions
-- ═══════════════════════════════════════════════════════════════

INSERT INTO rider_tier_definitions
  (tier_level, name, display_name, xp_required, tagline, color, pill_text_color, perk_description, sort_order)
VALUES
  (1,  'kickstand',    'Kickstand',    0,
   'The journey of a thousand kilometers begins with a single kick.',
   '#94A3B8', '#FFFFFF',
   'Badge system, daily quiz, basic profile', 1),

  (2,  'spoke',        'Spoke',        500,
   'You''re part of the wheel now.',
   '#64748B', '#FFFFFF',
   'Community feed access, route sharing', 2),

  (3,  'pedaler',      'Pedaler',      2000,
   'Steady legs. Steady progress. The road is yours.',
   '#14B8A6', '#FFFFFF',
   'Profile avatar frame (tier-colored ring)', 3),

  (4,  'street_smart', 'Street Smart', 5000,
   'You read the road like others read books.',
   '#06B6D4', '#FFFFFF',
   'Hazard validation voting, route safety rating', 4),

  (5,  'road_regular', 'Road Regular', 10000,
   'Rain, sun, Monday, Friday — you show up.',
   '#3B82F6', '#FFFFFF',
   'Riding analytics dashboard (weekly/monthly stats)', 5),

  (6,  'trail_blazer', 'Trail Blazer', 20000,
   'Where you ride, others follow.',
   '#F59E0B', '#111827',
   'Map theme customization (3 basemap color schemes)', 6),

  (7,  'road_captain', 'Road Captain', 35000,
   'The peloton has a leader. It''s you.',
   '#F97316', '#FFFFFF',
   'Featured in community feed, visible tier on shared trips', 7),

  (8,  'city_guardian', 'City Guardian', 60000,
   'Every safe route in this city has your fingerprints on it.',
   '#8B5CF6', '#FFFFFF',
   'City Heartbeat contributor priority', 8),

  (9,  'iron_cyclist', 'Iron Cyclist',  100000,
   'Built different. Forged on the road.',
   '#F43F5E', '#FFFFFF',
   'Exclusive seasonal challenges with bonus XP', 9),

  (10, 'legend',       'Legend',        150000,
   'They''ll name bike lanes after you.',
   '#FACC15', '#111827',
   'Gold name in community feed, permanent Legend title', 10);

-- ═══════════════════════════════════════════════════════════════
-- award_xp RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION award_xp(
  p_user_id    UUID,
  p_action     TEXT,
  p_base_xp    INTEGER,
  p_multiplier NUMERIC DEFAULT 1.0,
  p_source_id  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_final_xp  INTEGER;
  v_new_total INTEGER;
  v_old_tier  TEXT;
  v_new_tier  TEXT;
  v_tier_def  RECORD;
BEGIN
  v_final_xp := ROUND(p_base_xp * p_multiplier);

  -- Log XP event
  INSERT INTO xp_events (user_id, action, base_xp, multiplier, final_xp, source_id)
  VALUES (p_user_id, p_action, p_base_xp, p_multiplier, v_final_xp, p_source_id);

  -- Update total XP
  UPDATE profiles
  SET total_xp = COALESCE(total_xp, 0) + v_final_xp
  WHERE id = p_user_id
  RETURNING total_xp, rider_tier INTO v_new_total, v_old_tier;

  -- Determine correct tier for new XP total
  SELECT name INTO v_new_tier
  FROM rider_tier_definitions
  WHERE xp_required <= v_new_total
  ORDER BY xp_required DESC
  LIMIT 1;

  -- Promote if tier changed
  IF v_new_tier IS DISTINCT FROM v_old_tier THEN
    UPDATE profiles SET rider_tier = v_new_tier WHERE id = p_user_id;
  END IF;

  -- Return full tier definition if promoted (for client celebration)
  IF v_new_tier IS DISTINCT FROM v_old_tier THEN
    SELECT * INTO v_tier_def FROM rider_tier_definitions WHERE name = v_new_tier;
    RETURN jsonb_build_object(
      'xp_awarded', v_final_xp,
      'total_xp', v_new_total,
      'old_tier', v_old_tier,
      'new_tier', v_new_tier,
      'promoted', true,
      'tier_display_name', v_tier_def.display_name,
      'tier_tagline', v_tier_def.tagline,
      'tier_color', v_tier_def.color,
      'tier_level', v_tier_def.tier_level,
      'tier_perk', v_tier_def.perk_description
    );
  END IF;

  RETURN jsonb_build_object(
    'xp_awarded', v_final_xp,
    'total_xp', v_new_total,
    'old_tier', v_old_tier,
    'new_tier', v_new_tier,
    'promoted', false
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- XP Backfill for Existing Users
-- ═══════════════════════════════════════════════════════════════

UPDATE profiles p SET total_xp = (
  COALESCE((SELECT COUNT(*) * 85 FROM trip_tracks WHERE user_id = p.id AND end_reason = 'completed'), 0)
  + COALESCE(p.total_hazards_reported, 0) * 50
  + COALESCE((SELECT COUNT(*) * 75 FROM user_badges WHERE user_id = p.id), 0)
  + COALESCE((SELECT longest_streak * 10 FROM streak_state WHERE user_id = p.id), 0)
);

UPDATE profiles p SET rider_tier = (
  SELECT name FROM rider_tier_definitions
  WHERE xp_required <= COALESCE(p.total_xp, 0)
  ORDER BY xp_required DESC
  LIMIT 1
);

-- ═══════════════════════════════════════════════════════════════
-- Extend get_impact_dashboard with XP fields
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_impact_dashboard(
  p_user_id UUID,
  p_time_zone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_streak JSONB;
  v_totals JSONB;
  v_this_week JSONB;
  v_guardian_tier TEXT;
  v_total_xp INTEGER;
  v_rider_tier TEXT;
  v_week_start TIMESTAMPTZ;
BEGIN
  v_week_start := date_trunc('week', (now() AT TIME ZONE p_time_zone))::TIMESTAMPTZ;

  -- Streak state
  SELECT jsonb_build_object(
    'currentStreak', COALESCE(ss.current_streak, 0),
    'longestStreak', COALESCE(ss.longest_streak, 0),
    'lastQualifyingDate', ss.last_qualifying_date,
    'freezeAvailable', COALESCE(ss.freeze_available, false)
  )
  INTO v_streak
  FROM public.streak_state ss
  WHERE ss.user_id = p_user_id;

  IF v_streak IS NULL THEN
    v_streak := jsonb_build_object(
      'currentStreak', 0,
      'longestStreak', 0,
      'lastQualifyingDate', NULL,
      'freezeAvailable', false
    );
  END IF;

  -- Totals from profiles (includes microlives + XP columns)
  SELECT jsonb_build_object(
    'totalCo2SavedKg', COALESCE(p.total_co2_saved_kg, 0),
    'totalMoneySavedEur', COALESCE(p.total_money_saved_eur, 0),
    'totalHazardsReported', COALESCE(p.total_hazards_reported, 0),
    'totalRidersProtected', COALESCE(p.total_riders_protected, 0),
    'totalMicrolives', COALESCE(p.total_microlives, 0),
    'totalCommunitySeconds', COALESCE(p.total_community_seconds, 0)
  ),
  COALESCE(p.guardian_tier, 'reporter'),
  COALESCE(p.total_xp, 0),
  COALESCE(p.rider_tier, 'kickstand')
  INTO v_totals, v_guardian_tier, v_total_xp, v_rider_tier
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_totals IS NULL THEN
    v_totals := jsonb_build_object(
      'totalCo2SavedKg', 0,
      'totalMoneySavedEur', 0,
      'totalHazardsReported', 0,
      'totalRidersProtected', 0,
      'totalMicrolives', 0,
      'totalCommunitySeconds', 0
    );
    v_guardian_tier := 'reporter';
    v_total_xp := 0;
    v_rider_tier := 'kickstand';
  END IF;

  -- This week aggregation from ride_impacts
  SELECT jsonb_build_object(
    'rides', COUNT(*),
    'co2SavedKg', COALESCE(SUM(ri.co2_saved_kg), 0),
    'moneySavedEur', COALESCE(SUM(ri.money_saved_eur), 0),
    'hazardsReported', 0
  )
  INTO v_this_week
  FROM public.ride_impacts ri
  WHERE ri.user_id = p_user_id
    AND ri.created_at >= v_week_start;

  IF v_this_week IS NULL THEN
    v_this_week := jsonb_build_object('rides', 0, 'co2SavedKg', 0, 'moneySavedEur', 0, 'hazardsReported', 0);
  END IF;

  RETURN jsonb_build_object(
    'streak', v_streak,
    'totals', v_totals,
    'thisWeek', v_this_week,
    'guardianTier', v_guardian_tier,
    'totalXp', v_total_xp,
    'riderTier', v_rider_tier
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Extend get_nearby_feed with rider_tier
-- ═══════════════════════════════════════════════════════════════

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
      'guardian_tier', p.guardian_tier,
      'rider_tier', COALESCE(p.rider_tier, 'kickstand')
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
