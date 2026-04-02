-- Habit Engine Foundation
-- Tables, RPCs, and seed data for the gamification / habit-building system.
-- Uses IF NOT EXISTS / IF EXISTS guards for idempotent re-runs.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ALTER profiles — add habit-engine columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cycling_goal TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardian_tier TEXT NOT NULL DEFAULT 'reporter';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_co2_saved_kg NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_money_saved_eur NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_hazards_reported INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_riders_protected INT NOT NULL DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ride_impacts — per-ride impact tracking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ride_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  co2_saved_kg NUMERIC NOT NULL DEFAULT 0,
  money_saved_eur NUMERIC NOT NULL DEFAULT 0,
  hazards_warned_count INT NOT NULL DEFAULT 0,
  distance_meters NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id)
);

CREATE INDEX IF NOT EXISTS idx_ride_impacts_user_id
  ON ride_impacts (user_id);

CREATE INDEX IF NOT EXISTS idx_ride_impacts_created_at
  ON ride_impacts (user_id, created_at DESC);

ALTER TABLE ride_impacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "ride_impacts_select_own" ON ride_impacts;
  CREATE POLICY "ride_impacts_select_own"
    ON ride_impacts FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "ride_impacts_insert_own" ON ride_impacts;
  CREATE POLICY "ride_impacts_insert_own"
    ON ride_impacts FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
END $$;

GRANT ALL ON ride_impacts TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. streak_state — authoritative streak tracking per user
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS streak_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_qualifying_date DATE,
  freeze_available BOOLEAN NOT NULL DEFAULT false,
  freeze_used_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE streak_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "streak_state_select_own" ON streak_state;
  CREATE POLICY "streak_state_select_own"
    ON streak_state FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "streak_state_insert_own" ON streak_state;
  CREATE POLICY "streak_state_insert_own"
    ON streak_state FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "streak_state_update_own" ON streak_state;
  CREATE POLICY "streak_state_update_own"
    ON streak_state FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));
END $$;

GRANT ALL ON streak_state TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. user_badges — earned achievements
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id
  ON user_badges (user_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_badges_select_own" ON user_badges;
  CREATE POLICY "user_badges_select_own"
    ON user_badges FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "user_badges_insert_own" ON user_badges;
  CREATE POLICY "user_badges_insert_own"
    ON user_badges FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
END $$;

GRANT ALL ON user_badges TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. quiz_questions — safety quiz pool
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL,
  explanation TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'road_safety', 'infrastructure', 'risk_awareness', 'first_aid'
  )),
  difficulty INT NOT NULL DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "quiz_questions_select_all" ON quiz_questions;
  CREATE POLICY "quiz_questions_select_all"
    ON quiz_questions FOR SELECT
    TO authenticated
    USING (true);
END $$;

GRANT SELECT ON quiz_questions TO authenticated;
GRANT ALL ON quiz_questions TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. user_quiz_history — quiz answers per user
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_quiz_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question_id UUID NOT NULL REFERENCES quiz_questions(id),
  selected_index INT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_user_quiz_history_user_id
  ON user_quiz_history (user_id);

ALTER TABLE user_quiz_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "user_quiz_history_select_own" ON user_quiz_history;
  CREATE POLICY "user_quiz_history_select_own"
    ON user_quiz_history FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

  DROP POLICY IF EXISTS "user_quiz_history_insert_own" ON user_quiz_history;
  CREATE POLICY "user_quiz_history_insert_own"
    ON user_quiz_history FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
END $$;

GRANT ALL ON user_quiz_history TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. reward_equivalents — CO2/money relatable equivalents pool
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reward_equivalents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('co2', 'money')),
  equivalent_text TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'eur'))
);

ALTER TABLE reward_equivalents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "reward_equivalents_select_all" ON reward_equivalents;
  CREATE POLICY "reward_equivalents_select_all"
    ON reward_equivalents FOR SELECT
    TO authenticated
    USING (true);
END $$;

GRANT SELECT ON reward_equivalents TO authenticated;
GRANT ALL ON reward_equivalents TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RPC: qualify_streak_action
--    Upserts streak_state using 4AM cutoff in user's timezone.
--    Returns current_streak, longest_streak after update.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION qualify_streak_action(
  p_user_id UUID,
  p_action_type TEXT,
  p_time_zone TEXT DEFAULT 'UTC'
)
RETURNS TABLE (
  current_streak INT,
  longest_streak INT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today DATE;
  v_prev_date DATE;
  v_prev_streak INT;
  v_freeze BOOLEAN;
  v_new_streak INT;
  v_new_longest INT;
BEGIN
  -- Compute "today" using 4AM cutoff in user's timezone
  v_today := ((now() AT TIME ZONE p_time_zone) - INTERVAL '4 hours')::date;

  -- Get current state
  SELECT ss.last_qualifying_date, ss.current_streak, ss.freeze_available
  INTO v_prev_date, v_prev_streak, v_freeze
  FROM streak_state ss
  WHERE ss.user_id = p_user_id;

  IF NOT FOUND THEN
    -- No row exists: insert new with streak=1
    INSERT INTO streak_state (user_id, current_streak, longest_streak, last_qualifying_date, updated_at)
    VALUES (p_user_id, 1, 1, v_today, now());

    RETURN QUERY SELECT 1, 1;
    RETURN;
  END IF;

  -- Already qualified today: no-op
  IF v_prev_date = v_today THEN
    RETURN QUERY
      SELECT ss.current_streak, ss.longest_streak
      FROM streak_state ss
      WHERE ss.user_id = p_user_id;
    RETURN;
  END IF;

  -- Yesterday: extend streak
  IF v_prev_date = v_today - 1 THEN
    v_new_streak := COALESCE(v_prev_streak, 0) + 1;
  -- Older than yesterday but freeze available: use freeze, keep streak
  ELSIF v_freeze THEN
    v_new_streak := COALESCE(v_prev_streak, 0);

    UPDATE streak_state SET
      freeze_available = false,
      freeze_used_date = v_today,
      last_qualifying_date = v_today,
      updated_at = now()
    WHERE user_id = p_user_id;

    -- Still need to update longest and return
    v_new_longest := GREATEST(
      (SELECT ss.longest_streak FROM streak_state ss WHERE ss.user_id = p_user_id),
      v_new_streak
    );

    UPDATE streak_state SET
      current_streak = v_new_streak,
      longest_streak = v_new_longest
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_new_streak, v_new_longest;
    RETURN;
  -- Older than yesterday, no freeze: reset
  ELSE
    v_new_streak := 1;
  END IF;

  v_new_longest := GREATEST(
    (SELECT ss.longest_streak FROM streak_state ss WHERE ss.user_id = p_user_id),
    v_new_streak
  );

  UPDATE streak_state SET
    current_streak = v_new_streak,
    longest_streak = v_new_longest,
    last_qualifying_date = v_today,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_new_streak, v_new_longest;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. RPC: record_ride_impact
--    Computes CO2 and money savings from distance, inserts ride_impacts,
--    and accumulates totals on profiles. Returns the ride_impacts row.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_ride_impact(
  p_trip_id UUID,
  p_user_id UUID,
  p_distance_meters NUMERIC
)
RETURNS ride_impacts
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_co2_kg NUMERIC;
  v_money_eur NUMERIC;
  v_result ride_impacts;
BEGIN
  -- EU avg 120g/km = 0.12 kg/km
  v_co2_kg := p_distance_meters / 1000.0 * 0.12;
  -- Romania car cost ~0.35 EUR/km
  v_money_eur := p_distance_meters / 1000.0 * 0.35;

  INSERT INTO ride_impacts (trip_id, user_id, co2_saved_kg, money_saved_eur, distance_meters)
  VALUES (p_trip_id, p_user_id, v_co2_kg, v_money_eur, p_distance_meters)
  RETURNING * INTO v_result;

  UPDATE profiles SET
    total_co2_saved_kg = total_co2_saved_kg + v_co2_kg,
    total_money_saved_eur = total_money_saved_eur + v_money_eur
  WHERE id = p_user_id;

  RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. RPC: get_impact_dashboard
--     Single JSON response with streak, totals, this-week aggregate,
--     and guardian tier.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_impact_dashboard(
  p_user_id UUID,
  p_time_zone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_profile RECORD;
  v_streak RECORD;
  v_this_week RECORD;
  v_week_start TIMESTAMPTZ;
BEGIN
  -- Profile totals + tier
  SELECT
    total_co2_saved_kg, total_money_saved_eur,
    total_hazards_reported, total_riders_protected,
    guardian_tier
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  -- Streak state
  SELECT
    current_streak, longest_streak,
    freeze_available, last_qualifying_date
  INTO v_streak
  FROM streak_state
  WHERE user_id = p_user_id;

  -- This week aggregate (Monday-aligned in user's timezone)
  v_week_start := date_trunc('week', now() AT TIME ZONE p_time_zone) AT TIME ZONE p_time_zone;

  SELECT
    COALESCE(COUNT(*), 0)::INT AS rides,
    COALESCE(SUM(distance_meters), 0) AS distance_meters,
    COALESCE(SUM(co2_saved_kg), 0) AS co2_saved_kg,
    COALESCE(SUM(money_saved_eur), 0) AS money_saved_eur
  INTO v_this_week
  FROM ride_impacts
  WHERE user_id = p_user_id
    AND created_at >= v_week_start;

  result := jsonb_build_object(
    'streak', jsonb_build_object(
      'currentStreak',       COALESCE(v_streak.current_streak, 0),
      'longestStreak',       COALESCE(v_streak.longest_streak, 0),
      'freezeAvailable',     COALESCE(v_streak.freeze_available, false),
      'lastQualifyingDate',  v_streak.last_qualifying_date
    ),
    'totals', jsonb_build_object(
      'totalCo2SavedKg',      COALESCE(v_profile.total_co2_saved_kg, 0),
      'totalMoneySavedEur',   COALESCE(v_profile.total_money_saved_eur, 0),
      'totalHazardsReported', COALESCE(v_profile.total_hazards_reported, 0),
      'totalRidersProtected', COALESCE(v_profile.total_riders_protected, 0)
    ),
    'thisWeek', jsonb_build_object(
      'rides',          v_this_week.rides,
      'distanceMeters', v_this_week.distance_meters,
      'co2SavedKg',     v_this_week.co2_saved_kg,
      'moneySavedEur',  v_this_week.money_saved_eur
    ),
    'guardianTier', COALESCE(v_profile.guardian_tier, 'reporter')
  );

  RETURN result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RPC: get_neighborhood_safety_score
--     Aggregates road_risk_data within radius using ST_DWithin.
--     Returns avg_score, total_segments, safest/dangerous counts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_neighborhood_safety_score(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION DEFAULT 1000
)
RETURNS TABLE (
  avg_score DOUBLE PRECISION,
  total_segments INT,
  safest_count INT,
  dangerous_count INT
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(AVG(rrd.risk_score), 0)::DOUBLE PRECISION AS avg_score,
    COUNT(*)::INT AS total_segments,
    COUNT(*) FILTER (WHERE rrd.risk_score >= 70)::INT AS safest_count,
    COUNT(*) FILTER (WHERE rrd.risk_score <= 30)::INT AS dangerous_count
  FROM road_risk_data rrd
  WHERE ST_DWithin(
    rrd.geom::geography,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    p_radius_meters
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Seed: reward_equivalents (20+ rows)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reward_equivalents (category, equivalent_text, threshold_value, unit) VALUES
  -- CO2 equivalents (kg)
  ('co2', 'Charging a smartphone 12 times',                      0.1,   'kg'),
  ('co2', 'Taking a car off the road for 2 minutes',             0.2,   'kg'),
  ('co2', 'Planting a small tree seedling',                       0.5,   'kg'),
  ('co2', 'One tree absorbing CO2 for a day',                     1.0,   'kg'),
  ('co2', 'Running a washing machine 3 times',                    2.0,   'kg'),
  ('co2', 'A hot shower saved',                                   3.0,   'kg'),
  ('co2', 'Skipping a 20 km car commute',                         5.0,   'kg'),
  ('co2', 'Powering a LED bulb for a year',                       7.0,   'kg'),
  ('co2', 'A tree growing for a full month',                     10.0,   'kg'),
  ('co2', 'A short domestic flight offset',                      25.0,   'kg'),
  ('co2', 'Powering a home for 2 weeks',                         50.0,   'kg'),
  ('co2', 'One less barrel of oil burned',                      100.0,   'kg'),
  ('co2', 'A year of veganism',                                 500.0,   'kg'),
  ('co2', '50 trees growing for a year',                       1000.0,   'kg'),

  -- Money equivalents (EUR)
  ('money', 'A coffee',                                           1.0,  'eur'),
  ('money', 'Two bus tickets',                                    1.5,  'eur'),
  ('money', 'A beer',                                             2.0,  'eur'),
  ('money', 'A movie ticket',                                     5.0,  'eur'),
  ('money', 'A monthly Spotify subscription',                     7.0,  'eur'),
  ('money', 'A nice dinner',                                     15.0,  'eur'),
  ('money', 'A new book',                                        20.0,  'eur'),
  ('money', 'A monthly transit pass',                            30.0,  'eur'),
  ('money', 'A pair of running shoes',                           60.0,  'eur'),
  ('money', 'A bike tune-up',                                   100.0,  'eur'),
  ('money', 'A weekend getaway',                                200.0,  'eur'),
  ('money', 'Half a new bike',                                  500.0,  'eur')
ON CONFLICT DO NOTHING;
