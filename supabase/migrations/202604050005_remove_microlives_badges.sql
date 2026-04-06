-- ============================================================================
-- Remove microlives-associated badges and microlife_tier profile column.
-- These conflict with the badge system: microlives are a display metric,
-- not an achievement criteria.
-- ============================================================================

-- 1. Delete any user_badges that reference these keys
DELETE FROM user_badges
WHERE badge_key IN (
  'ml_2', 'ml_8', 'ml_48', 'ml_336', 'ml_1440',
  'community_60s', 'community_300s', 'community_1800s', 'community_3600s'
);

-- 2. Delete the badge definitions
DELETE FROM badge_definitions
WHERE badge_key IN (
  'ml_2', 'ml_8', 'ml_48', 'ml_336', 'ml_1440',
  'community_60s', 'community_300s', 'community_1800s', 'community_3600s'
);

-- 3. Drop the unused microlife_tier column from profiles
ALTER TABLE profiles
  DROP COLUMN IF EXISTS microlife_tier;

-- 4. Recreate check_and_award_badges without microlives/community checks.
--    We re-read the full function from 202604050004 but strip the ML/community blocks.
CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_earned       TEXT[];
  v_candidates   TEXT[];

  -- ── Profile counters ─────────────────────────────────────────────────────
  v_total_co2            NUMERIC;
  v_total_money          NUMERIC;
  v_total_hazards        INT;
  v_total_riders_prot    INT;

  -- ── Streak ────────────────────────────────────────────────────────────────
  v_longest_streak       INT;

  -- ── Ride aggregates ───────────────────────────────────────────────────────
  v_ride_count           INT;
  v_total_distance_m     NUMERIC;
  v_total_duration_min   NUMERIC;
  v_total_elevation_m    NUMERIC;
  v_max_single_dist_m    NUMERIC;
  v_max_single_elev_m    NUMERIC;

  -- ── Weather / context ─────────────────────────────────────────────────────
  v_rain_rides           INT;
  v_snow_rides           INT;
  v_hot_rides            INT;    -- temp >= 35
  v_cold_rides           INT;    -- temp <= 0
  v_wind_rides           INT;    -- wind >= 30
  v_night_rides          INT;    -- start_hour 0-5
  v_early_rides          INT;    -- start_hour 5-7
  v_aqi_poor_rides       INT;
  v_long_rides           INT;    -- duration >= 120 min
  v_elevation_rides      INT;   -- single ride >= 500m gain
  v_unique_months        INT;

  -- ── Social ────────────────────────────────────────────────────────────────
  v_shares               INT;
  v_likes_given          INT;
  v_comments_given       INT;
  v_total_likes_recv     INT;

  -- ── Quiz ──────────────────────────────────────────────────────────────────
  v_quiz_total           INT;
  v_quiz_correct         INT;
  v_quiz_perfect_streak  INT;

  -- ── Multi-stop / round-trip ───────────────────────────────────────────────
  v_multi_stop_count     INT;

  -- Result
  v_awarded              JSONB;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────────
  -- Load currently earned badges
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT ARRAY_AGG(badge_key) INTO v_earned
  FROM user_badges
  WHERE user_id = p_user_id;

  v_earned := COALESCE(v_earned, ARRAY[]::TEXT[]);
  v_candidates := ARRAY[]::TEXT[];

  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Profile snapshot
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(total_co2_saved_kg, 0),
    COALESCE(total_money_saved_eur, 0),
    COALESCE(total_hazards_reported, 0),
    COALESCE(total_riders_protected, 0)
  INTO
    v_total_co2,
    v_total_money,
    v_total_hazards,
    v_total_riders_prot
  FROM profiles
  WHERE id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. Streak
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT COALESCE(longest_streak, 0)
  INTO v_longest_streak
  FROM streak_state
  WHERE user_id = p_user_id;

  v_longest_streak := COALESCE(v_longest_streak, 0);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. Ride aggregates
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(distance_meters), 0),
    COALESCE(SUM(duration_minutes), 0),
    COALESCE(SUM(elevation_gain_m), 0),
    COALESCE(MAX(distance_meters), 0),
    COALESCE(MAX(elevation_gain_m), 0)
  INTO
    v_ride_count,
    v_total_distance_m,
    v_total_duration_min,
    v_total_elevation_m,
    v_max_single_dist_m,
    v_max_single_elev_m
  FROM ride_impacts
  WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. Weather / context aggregates
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN weather_condition IN ('rain','drizzle','thunderstorm') THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN weather_condition IN ('snow','sleet','freezing_rain')  THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN temperature_c >= 35 THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN temperature_c <= 0  THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN wind_speed_kmh >= 30 THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN ride_start_hour BETWEEN 0 AND 4 THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN ride_start_hour BETWEEN 5 AND 6 THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN aqi_level IN ('poor','very_poor','hazardous') THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN duration_minutes >= 120 THEN 1 ELSE 0 END), 0)::INT,
    COALESCE(SUM(CASE WHEN elevation_gain_m >= 500 THEN 1 ELSE 0 END), 0)::INT,
    COUNT(DISTINCT TO_CHAR(created_at, 'YYYY-MM'))::INT
  INTO
    v_rain_rides, v_snow_rides, v_hot_rides, v_cold_rides,
    v_wind_rides, v_night_rides, v_early_rides, v_aqi_poor_rides,
    v_long_rides, v_elevation_rides, v_unique_months
  FROM ride_impacts
  WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. Social aggregates
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT COUNT(*)::INT INTO v_shares
  FROM trip_shares WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_likes_given
  FROM feed_likes WHERE user_id = p_user_id;

  SELECT COUNT(*)::INT INTO v_comments_given
  FROM feed_comments WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(sub.cnt), 0)::INT INTO v_total_likes_recv
  FROM (
    SELECT COUNT(*) AS cnt
    FROM feed_likes fl
    JOIN trip_shares ts ON fl.trip_share_id = ts.id
    WHERE ts.user_id = p_user_id
  ) sub;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. Quiz aggregates
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0)::INT
  INTO v_quiz_total, v_quiz_correct
  FROM quiz_answers
  WHERE user_id = p_user_id;

  -- Perfect-day streak (consecutive days with all-correct answers)
  WITH daily AS (
    SELECT DATE(answered_at) AS d,
           BOOL_AND(is_correct) AS perfect
    FROM quiz_answers
    WHERE user_id = p_user_id
    GROUP BY DATE(answered_at)
  ),
  grouped AS (
    SELECT d, perfect,
           d - (ROW_NUMBER() OVER (ORDER BY d) * INTERVAL '1 day') AS grp
    FROM daily
    WHERE perfect
  )
  SELECT COALESCE(MAX(cnt), 0)::INT INTO v_quiz_perfect_streak
  FROM (SELECT COUNT(*) AS cnt FROM grouped GROUP BY grp) sub;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. Multi-stop count
  -- ──────────────────────────────────────────────────────────────────────────
  v_multi_stop_count := 0; -- Not evaluatable from DB currently

  -- ════════════════════════════════════════════════════════════════════════════
  -- BADGE CANDIDATE EVALUATION
  -- ════════════════════════════════════════════════════════════════════════════

  -- ── FIRSTS ─────────────────────────────────────────────────────────────────
  IF v_ride_count >= 1 AND NOT ('first_ride' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_ride'; END IF;
  IF v_shares    >= 1 AND NOT ('first_share' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_share'; END IF;
  IF v_likes_given >= 1 AND NOT ('first_like' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_like'; END IF;
  IF v_comments_given >= 1 AND NOT ('first_comment' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_comment'; END IF;
  IF v_total_hazards >= 1 AND NOT ('first_hazard' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_hazard'; END IF;
  IF v_quiz_total >= 1 AND NOT ('first_quiz' = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_quiz'; END IF;

  -- ── TOTAL DISTANCE (tiered — road_warrior family) ─────────────────────────
  IF v_total_distance_m >= 50000  AND NOT ('distance_50km'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_50km';   END IF;
  IF v_total_distance_m >= 150000 AND NOT ('distance_150km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_150km';  END IF;
  IF v_total_distance_m >= 500000 AND NOT ('distance_500km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_500km';  END IF;
  IF v_total_distance_m >= 1500000 AND NOT ('distance_1500km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_1500km'; END IF;
  IF v_total_distance_m >= 5000000 AND NOT ('distance_5000km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_5000km'; END IF;

  -- ── SINGLE RIDE DISTANCE (tiered — century family) ────────────────────────
  IF v_max_single_dist_m >= 10000  AND NOT ('single_10km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_10km';  END IF;
  IF v_max_single_dist_m >= 25000  AND NOT ('single_25km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_25km';  END IF;
  IF v_max_single_dist_m >= 50000  AND NOT ('single_50km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_50km';  END IF;
  IF v_max_single_dist_m >= 100000 AND NOT ('single_100km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_100km'; END IF;
  IF v_max_single_dist_m >= 200000 AND NOT ('single_200km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_200km'; END IF;

  -- ── TOTAL TIME (tiered — saddle_sage family) ──────────────────────────────
  IF v_total_duration_min >= 300   AND NOT ('time_5h'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_5h';   END IF;
  IF v_total_duration_min >= 900   AND NOT ('time_15h'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_15h';  END IF;
  IF v_total_duration_min >= 3000  AND NOT ('time_50h'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_50h';  END IF;
  IF v_total_duration_min >= 9000  AND NOT ('time_150h' = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_150h'; END IF;
  IF v_total_duration_min >= 30000 AND NOT ('time_500h' = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_500h'; END IF;

  -- ── RIDE COUNT (tiered — pedal_pusher family) ─────────────────────────────
  IF v_ride_count >= 10   AND NOT ('rides_10'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_10';   END IF;
  IF v_ride_count >= 30   AND NOT ('rides_30'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_30';   END IF;
  IF v_ride_count >= 100  AND NOT ('rides_100'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_100';  END IF;
  IF v_ride_count >= 300  AND NOT ('rides_300'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_300';  END IF;
  IF v_ride_count >= 1000 AND NOT ('rides_1000' = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_1000'; END IF;

  -- ── STREAK (tiered — iron_streak family) ──────────────────────────────────
  IF v_longest_streak >= 3  AND NOT ('streak_3'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_3';  END IF;
  IF v_longest_streak >= 7  AND NOT ('streak_7'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_7';  END IF;
  IF v_longest_streak >= 14 AND NOT ('streak_14' = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_14'; END IF;
  IF v_longest_streak >= 30 AND NOT ('streak_30' = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_30'; END IF;
  IF v_longest_streak >= 60 AND NOT ('streak_60' = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_60'; END IF;

  -- ── CO2 (tiered — green_machine family) ───────────────────────────────────
  IF v_total_co2 >= 5   AND NOT ('co2_5kg'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_5kg';   END IF;
  IF v_total_co2 >= 15  AND NOT ('co2_15kg'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_15kg';  END IF;
  IF v_total_co2 >= 50  AND NOT ('co2_50kg'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_50kg';  END IF;
  IF v_total_co2 >= 150 AND NOT ('co2_150kg' = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_150kg'; END IF;
  IF v_total_co2 >= 500 AND NOT ('co2_500kg' = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_500kg'; END IF;

  -- ── MONEY (tiered — penny_wise family) ────────────────────────────────────
  IF v_total_money >= 10   AND NOT ('money_10'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_10';   END IF;
  IF v_total_money >= 50   AND NOT ('money_50'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_50';   END IF;
  IF v_total_money >= 200  AND NOT ('money_200'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_200';  END IF;
  IF v_total_money >= 500  AND NOT ('money_500'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_500';  END IF;
  IF v_total_money >= 2000 AND NOT ('money_2000' = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_2000'; END IF;

  -- ── HAZARDS (total reported from profiles) ────────────────────────────────
  IF v_total_hazards >= 5   AND NOT ('hazard_5'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_5';   END IF;
  IF v_total_hazards >= 15  AND NOT ('hazard_15'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_15';  END IF;
  IF v_total_hazards >= 50  AND NOT ('hazard_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_50';  END IF;
  IF v_total_hazards >= 100 AND NOT ('hazard_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_100'; END IF;
  IF v_total_hazards >= 250 AND NOT ('hazard_250' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_250'; END IF;

  -- ── RIDERS PROTECTED ──────────────────────────────────────────────────────
  IF v_total_riders_prot >= 5  AND NOT ('protect_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'protect_5';  END IF;
  IF v_total_riders_prot >= 25 AND NOT ('protect_25' = ANY(v_earned)) THEN v_candidates := v_candidates || 'protect_25'; END IF;
  IF v_total_riders_prot >= 100 AND NOT ('protect_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'protect_100'; END IF;

  -- ── ELEVATION (tiered — mountain_goat family) ─────────────────────────────
  IF v_total_elevation_m >= 1000  AND NOT ('total_climb_1km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_1km';  END IF;
  IF v_total_elevation_m >= 5000  AND NOT ('total_climb_5km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_5km';  END IF;
  IF v_total_elevation_m >= 10000 AND NOT ('total_climb_10km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_10km'; END IF;
  IF v_total_elevation_m >= 25000 AND NOT ('total_climb_25km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_25km'; END IF;

  -- ── WEATHER one-offs ──────────────────────────────────────────────────────
  IF v_rain_rides >= 1 AND NOT ('rain_rider'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'rain_rider';  END IF;
  IF v_snow_rides >= 1 AND NOT ('snow_rider'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'snow_rider';  END IF;
  IF v_hot_rides  >= 1 AND NOT ('heat_rider'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'heat_rider';  END IF;
  IF v_cold_rides >= 1 AND NOT ('cold_rider'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'cold_rider';  END IF;
  IF v_wind_rides >= 1 AND NOT ('wind_rider'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'wind_rider';  END IF;

  -- ── ALL-WEATHER composite ─────────────────────────────────────────────────
  IF (
    ('rain_rider' = ANY(v_earned) OR 'rain_rider' = ANY(v_candidates)) AND
    ('snow_rider' = ANY(v_earned) OR 'snow_rider' = ANY(v_candidates)) AND
    ('heat_rider' = ANY(v_earned) OR 'heat_rider' = ANY(v_candidates)) AND
    ('cold_rider' = ANY(v_earned) OR 'cold_rider' = ANY(v_candidates)) AND
    ('wind_rider' = ANY(v_earned) OR 'wind_rider' = ANY(v_candidates))
  ) AND NOT ('all_weather' = ANY(v_earned)) THEN
    v_candidates := v_candidates || 'all_weather';
  END IF;

  -- ── NIGHT / EARLY ─────────────────────────────────────────────────────────
  IF v_night_rides >= 1 AND NOT ('night_owl'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'night_owl';    END IF;
  IF v_early_rides >= 1 AND NOT ('early_bird'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'early_bird';   END IF;
  IF v_aqi_poor_rides >= 1 AND NOT ('smog_rider' = ANY(v_earned)) THEN v_candidates := v_candidates || 'smog_rider'; END IF;

  -- ── ENDURANCE ─────────────────────────────────────────────────────────────
  IF v_long_rides >= 1 AND NOT ('endurance_ride' = ANY(v_earned)) THEN v_candidates := v_candidates || 'endurance_ride'; END IF;
  IF v_elevation_rides >= 1 AND NOT ('hill_conqueror' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hill_conqueror'; END IF;

  -- ── SEASONAL (unique months) ──────────────────────────────────────────────
  IF v_unique_months >= 4 AND NOT ('four_seasons' = ANY(v_earned)) THEN v_candidates := v_candidates || 'four_seasons'; END IF;
  IF v_unique_months >= 12 AND NOT ('year_rounder' = ANY(v_earned)) THEN v_candidates := v_candidates || 'year_rounder'; END IF;

  -- ── SOCIAL (shares / likes / comments) ────────────────────────────────────
  IF v_shares >= 5  AND NOT ('social_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'social_5';  END IF;
  IF v_shares >= 20 AND NOT ('social_20' = ANY(v_earned)) THEN v_candidates := v_candidates || 'social_20'; END IF;
  IF v_shares >= 50 AND NOT ('social_50' = ANY(v_earned)) THEN v_candidates := v_candidates || 'social_50'; END IF;

  IF v_likes_given >= 10 AND NOT ('liker_10' = ANY(v_earned)) THEN v_candidates := v_candidates || 'liker_10'; END IF;
  IF v_likes_given >= 50 AND NOT ('liker_50' = ANY(v_earned)) THEN v_candidates := v_candidates || 'liker_50'; END IF;

  IF v_comments_given >= 5  AND NOT ('commenter_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'commenter_5';  END IF;
  IF v_comments_given >= 25 AND NOT ('commenter_25' = ANY(v_earned)) THEN v_candidates := v_candidates || 'commenter_25'; END IF;

  IF v_total_likes_recv >= 10  AND NOT ('popular_10'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'popular_10';  END IF;
  IF v_total_likes_recv >= 50  AND NOT ('popular_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'popular_50';  END IF;
  IF v_total_likes_recv >= 200 AND NOT ('popular_200' = ANY(v_earned)) THEN v_candidates := v_candidates || 'popular_200'; END IF;

  -- ── QUIZ ──────────────────────────────────────────────────────────────────
  IF v_quiz_total >= 10  AND NOT ('quiz_10'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_10';  END IF;
  IF v_quiz_total >= 50  AND NOT ('quiz_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_50';  END IF;
  IF v_quiz_total >= 100 AND NOT ('quiz_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_100'; END IF;

  IF v_quiz_correct >= 10  AND NOT ('quiz_ace_10'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_ace_10';  END IF;
  IF v_quiz_correct >= 50  AND NOT ('quiz_ace_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_ace_50';  END IF;
  IF v_quiz_correct >= 100 AND NOT ('quiz_ace_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_ace_100'; END IF;

  IF v_quiz_perfect_streak >= 7  AND NOT ('quiz_streak_7'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_streak_7';  END IF;
  IF v_quiz_perfect_streak >= 30 AND NOT ('quiz_streak_30' = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_streak_30'; END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- AWARD: insert candidates into user_badges, ignore already-earned
  -- ════════════════════════════════════════════════════════════════════════════
  IF array_length(v_candidates, 1) IS NOT NULL AND array_length(v_candidates, 1) > 0 THEN
    INSERT INTO user_badges (user_id, badge_key)
    SELECT p_user_id, bd.badge_key
    FROM badge_definitions bd
    WHERE bd.badge_key = ANY(v_candidates)
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Return newly awarded badge definitions
  SELECT COALESCE(jsonb_agg(row_to_json(bd)), '[]'::JSONB)
  INTO v_awarded
  FROM badge_definitions bd
  WHERE bd.badge_key = ANY(v_candidates)
    AND EXISTS (
      SELECT 1 FROM user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_key = bd.badge_key
    );

  RETURN v_awarded;
END;
$$;
