-- Phase 2: Calories burned — DB persistence + dashboard aggregation
-- Adds calories_burned to ride_impacts, updates record_ride_impact RPC to store it,
-- and updates get_impact_dashboard to aggregate it for lifetime + this-week totals.

-- 1. Add column (idempotent via IF NOT EXISTS)
ALTER TABLE public.ride_impacts
  ADD COLUMN IF NOT EXISTS calories_burned NUMERIC NOT NULL DEFAULT 0;

-- 2. Replace record_ride_impact with a version that accepts and stores calories
CREATE OR REPLACE FUNCTION public.record_ride_impact(
  p_trip_id             UUID,
  p_user_id             UUID,
  p_distance_meters     NUMERIC,
  p_elevation_gain_m    NUMERIC   DEFAULT 0,
  p_weather_condition   TEXT      DEFAULT NULL,
  p_wind_speed_kmh      NUMERIC   DEFAULT NULL,
  p_temperature_c       NUMERIC   DEFAULT NULL,
  p_aqi_level           TEXT      DEFAULT NULL,
  p_ride_start_hour     INTEGER   DEFAULT NULL,
  p_duration_minutes    NUMERIC   DEFAULT 0,
  p_calories_burned     NUMERIC   DEFAULT 0
)
RETURNS ride_impacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_co2_kg     NUMERIC;
  v_money_eur  NUMERIC;
  v_result     ride_impacts;
  v_is_insert  BOOLEAN;
BEGIN
  v_co2_kg    := p_distance_meters / 1000.0 * 0.12;
  v_money_eur := p_distance_meters / 1000.0 * 0.35;

  SELECT EXISTS(SELECT 1 FROM ride_impacts WHERE trip_id = p_trip_id)
  INTO v_is_insert;
  v_is_insert := NOT v_is_insert;

  INSERT INTO ride_impacts (
    trip_id, user_id, co2_saved_kg, money_saved_eur, distance_meters,
    elevation_gain_m, weather_condition, wind_speed_kmh, temperature_c,
    aqi_level, ride_start_hour, duration_minutes, calories_burned
  )
  VALUES (
    p_trip_id, p_user_id, v_co2_kg, v_money_eur, p_distance_meters,
    COALESCE(p_elevation_gain_m, 0), p_weather_condition, p_wind_speed_kmh,
    p_temperature_c, p_aqi_level, p_ride_start_hour,
    COALESCE(p_duration_minutes, 0), COALESCE(p_calories_burned, 0)
  )
  ON CONFLICT (trip_id) DO UPDATE SET
    co2_saved_kg      = EXCLUDED.co2_saved_kg,
    money_saved_eur   = EXCLUDED.money_saved_eur,
    distance_meters   = EXCLUDED.distance_meters,
    elevation_gain_m  = EXCLUDED.elevation_gain_m,
    weather_condition = EXCLUDED.weather_condition,
    wind_speed_kmh    = EXCLUDED.wind_speed_kmh,
    temperature_c     = EXCLUDED.temperature_c,
    aqi_level         = EXCLUDED.aqi_level,
    ride_start_hour   = EXCLUDED.ride_start_hour,
    duration_minutes  = EXCLUDED.duration_minutes,
    calories_burned   = EXCLUDED.calories_burned
  RETURNING * INTO v_result;

  IF v_is_insert THEN
    UPDATE profiles SET
      total_co2_saved_kg    = total_co2_saved_kg    + v_co2_kg,
      total_money_saved_eur = total_money_saved_eur + v_money_eur
    WHERE id = p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ride_impact(UUID, UUID, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, NUMERIC, NUMERIC)
  TO authenticated, service_role;

-- 3. Replace get_impact_dashboard to include totalCaloriesBurned + thisWeek.caloriesBurned
CREATE OR REPLACE FUNCTION public.get_impact_dashboard(
  p_user_id   UUID,
  p_time_zone TEXT DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DECLARE
    v_streak          JSONB;
    v_totals          JSONB;
    v_this_week       JSONB;
    v_guardian_tier   TEXT;
    v_total_xp        INTEGER;
    v_rider_tier      TEXT;
    v_week_start      TIMESTAMPTZ;
    v_total_calories  NUMERIC;
  BEGIN
    v_week_start := date_trunc('week', (now() AT TIME ZONE p_time_zone))::TIMESTAMPTZ;

    SELECT jsonb_build_object(
      'currentStreak',      COALESCE(ss.current_streak, 0),
      'longestStreak',      COALESCE(ss.longest_streak, 0),
      'lastQualifyingDate', ss.last_qualifying_date,
      'freezeAvailable',    COALESCE(ss.freeze_available, false)
    )
    INTO v_streak
    FROM public.streak_state ss
    WHERE ss.user_id = p_user_id;

    IF v_streak IS NULL THEN
      v_streak := jsonb_build_object(
        'currentStreak', 0, 'longestStreak', 0,
        'lastQualifyingDate', NULL, 'freezeAvailable', false
      );
    END IF;

    SELECT jsonb_build_object(
      'totalCo2SavedKg',       COALESCE(p.total_co2_saved_kg, 0),
      'totalMoneySavedEur',    COALESCE(p.total_money_saved_eur, 0),
      'totalHazardsReported',  COALESCE(p.total_hazards_reported, 0),
      'totalRidersProtected',  COALESCE(p.total_riders_protected, 0),
      'totalMicrolives',       COALESCE(p.total_microlives, 0),
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
        'totalCo2SavedKg', 0, 'totalMoneySavedEur', 0,
        'totalHazardsReported', 0, 'totalRidersProtected', 0,
        'totalMicrolives', 0, 'totalCommunitySeconds', 0
      );
      v_guardian_tier := 'reporter';
      v_total_xp      := 0;
      v_rider_tier    := 'kickstand';
    END IF;

    -- Lifetime calories (aggregated from ride_impacts, not stored on profiles)
    SELECT COALESCE(SUM(ri.calories_burned), 0)
    INTO v_total_calories
    FROM public.ride_impacts ri
    WHERE ri.user_id = p_user_id;

    -- This-week stats including calories
    SELECT jsonb_build_object(
      'rides',           COUNT(*),
      'co2SavedKg',      COALESCE(SUM(ri.co2_saved_kg), 0),
      'moneySavedEur',   COALESCE(SUM(ri.money_saved_eur), 0),
      'hazardsReported', 0,
      'caloriesBurned',  COALESCE(SUM(ri.calories_burned), 0)
    )
    INTO v_this_week
    FROM public.ride_impacts ri
    WHERE ri.user_id = p_user_id
      AND ri.created_at >= v_week_start;

    IF v_this_week IS NULL THEN
      v_this_week := jsonb_build_object(
        'rides', 0, 'co2SavedKg', 0, 'moneySavedEur', 0,
        'hazardsReported', 0, 'caloriesBurned', 0
      );
    END IF;

    RETURN jsonb_build_object(
      'streak',              v_streak,
      'totals',              v_totals,
      'thisWeek',            v_this_week,
      'guardianTier',        v_guardian_tier,
      'totalXp',             v_total_xp,
      'riderTier',           v_rider_tier,
      'totalCaloriesBurned', v_total_calories
    );
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_impact_dashboard(UUID, TEXT) TO authenticated, service_role;
