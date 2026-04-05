-- ═══════════════════════════════════════════════════════════════════════════
-- Badge Evaluation — Phase 2
-- 1. Updates record_ride_impact to accept new ride-context parameters
-- 2. Implements check_and_award_badges RPC that evaluates all ~146 badge
--    criteria in a single call and inserts newly-earned badges
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 1: Recreate record_ride_impact with new optional parameters
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_ride_impact(
  p_trip_id             UUID,
  p_user_id             UUID,
  p_distance_meters     NUMERIC,
  p_elevation_gain_m    NUMERIC  DEFAULT 0,
  p_weather_condition   TEXT     DEFAULT NULL,
  p_wind_speed_kmh      NUMERIC  DEFAULT NULL,
  p_temperature_c       NUMERIC  DEFAULT NULL,
  p_aqi_level           TEXT     DEFAULT NULL,
  p_ride_start_hour     INTEGER  DEFAULT NULL,
  p_duration_minutes    NUMERIC  DEFAULT 0
)
RETURNS ride_impacts
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_co2_kg     NUMERIC;
  v_money_eur  NUMERIC;
  v_result     ride_impacts;
  v_is_insert  BOOLEAN;
BEGIN
  -- EU avg 120g/km = 0.12 kg/km
  v_co2_kg    := p_distance_meters / 1000.0 * 0.12;
  -- Romania car cost ~0.35 EUR/km
  v_money_eur := p_distance_meters / 1000.0 * 0.35;

  -- Detect whether the trip_id already exists before upserting,
  -- so we know whether to accumulate profile totals.
  SELECT EXISTS(SELECT 1 FROM ride_impacts WHERE trip_id = p_trip_id)
  INTO v_is_insert;
  v_is_insert := NOT v_is_insert; -- true = this will be a new row

  INSERT INTO ride_impacts (
    trip_id,
    user_id,
    co2_saved_kg,
    money_saved_eur,
    distance_meters,
    elevation_gain_m,
    weather_condition,
    wind_speed_kmh,
    temperature_c,
    aqi_level,
    ride_start_hour,
    duration_minutes
  )
  VALUES (
    p_trip_id,
    p_user_id,
    v_co2_kg,
    v_money_eur,
    p_distance_meters,
    COALESCE(p_elevation_gain_m, 0),
    p_weather_condition,
    p_wind_speed_kmh,
    p_temperature_c,
    p_aqi_level,
    p_ride_start_hour,
    COALESCE(p_duration_minutes, 0)
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
    duration_minutes  = EXCLUDED.duration_minutes
  RETURNING * INTO v_result;

  -- Only accumulate profile totals for new ride_impacts rows.
  -- On conflict (retry with same trip_id) we skip to avoid double-counting.
  IF v_is_insert THEN
    UPDATE profiles SET
      total_co2_saved_kg    = total_co2_saved_kg    + v_co2_kg,
      total_money_saved_eur = total_money_saved_eur + v_money_eur
    WHERE id = p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION record_ride_impact(UUID, UUID, NUMERIC, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, NUMERIC) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Part 2: check_and_award_badges
--
-- Evaluates ALL badge criteria for a user in one call.
-- Inserts newly-earned badges into user_badges (ON CONFLICT DO NOTHING).
-- Returns JSONB array of badge_definitions rows for every newly-awarded badge.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- ── Profile snapshot ──────────────────────────────────────────────────────
  v_total_co2            NUMERIC;
  v_total_money          NUMERIC;
  v_total_hazards        INT;
  v_total_riders_prot    INT;
  v_total_microlives     NUMERIC;
  v_total_community_secs NUMERIC;

  -- ── Streak ────────────────────────────────────────────────────────────────
  v_longest_streak       INT;

  -- ── Ride aggregates ───────────────────────────────────────────────────────
  v_ride_count           INT;
  v_total_distance_m     NUMERIC;
  v_total_duration_min   NUMERIC;
  v_max_single_distance  NUMERIC;
  v_max_single_elev      NUMERIC;
  v_total_elevation_m    NUMERIC;
  v_early_count          INT;   -- ride_start_hour < 7
  v_night_count          INT;   -- ride_start_hour >= 21
  v_monthly_count        INT;   -- current calendar month
  v_rain_5_count         INT;   -- rainy rides
  v_wind_30_count        INT;   -- wind > 30 km/h
  v_cold_5_count         INT;   -- temp < 5°C
  v_hot_35_count         INT;   -- temp > 35°C
  v_good_aqi_count       INT;   -- aqi good/fair
  v_bad_aqi_count        INT;   -- aqi poor+

  -- ── Social ────────────────────────────────────────────────────────────────
  v_share_count          INT;
  v_like_count           INT;   -- feed_likes + trip_loves given
  v_comment_count        INT;
  v_validate_count       INT;

  -- ── Quiz ──────────────────────────────────────────────────────────────────
  v_quiz_days            INT;
  v_perfect_quiz_days    INT;
  v_perfect_streak_3     BOOLEAN;

  -- ── Hazard specialisation ─────────────────────────────────────────────────
  v_hazard_pothole       INT;
  v_hazard_parking       INT;
  v_hazard_construction  INT;
  v_hazard_intersection  INT;
  v_distinct_hazard_types INT;

  -- ── Single-ride flags ────────────────────────────────────────────────────
  v_first_ride           BOOLEAN;
  v_first_safe_route     BOOLEAN;
  v_first_night_ride     BOOLEAN;
  v_first_rain_ride      BOOLEAN;
  v_first_10km           BOOLEAN;
  v_sprint_500m          BOOLEAN;   -- elev>=500 + dist<25000 same ride
  v_endurance_2h         BOOLEAN;
  v_endurance_4h         BOOLEAN;
  v_round_trip           BOOLEAN;

  -- ── Seasonal ride counts (any year) ──────────────────────────────────────
  v_spring_count         INT;
  v_summer_count         INT;
  v_autumn_count         INT;
  v_winter_count         INT;

  -- ── Annual event flags ────────────────────────────────────────────────────
  v_new_year             BOOLEAN;
  v_valentine            BOOLEAN;
  v_earth_day            BOOLEAN;
  v_bike_day             BOOLEAN;
  v_summer_solstice      BOOLEAN;
  v_halloween            BOOLEAN;
  v_christmas            BOOLEAN;
  v_winter_solstice      BOOLEAN;
  v_leap_day             BOOLEAN;
  v_friday_13            BOOLEAN;
  v_pi_day               BOOLEAN;
  v_five_am              BOOLEAN;

  -- ── Hidden badges ─────────────────────────────────────────────────────────
  v_mirror_distance      BOOLEAN;
  v_round_number         BOOLEAN;
  v_same_commute_7       BOOLEAN;

  -- ── Already-earned badges (to skip) ─────────────────────────────────────
  v_earned               TEXT[];

  -- ── Candidate keys to insert ─────────────────────────────────────────────
  v_candidates           TEXT[] := ARRAY[]::TEXT[];

  -- ── Result ───────────────────────────────────────────────────────────────
  v_result               JSONB;

  -- ── Helper variable ──────────────────────────────────────────────────────
  v_temp_int             INT;
  v_d                    NUMERIC;
  v_first_digit          INT;
  v_last_digit           INT;

BEGIN

  -- ──────────────────────────────────────────────────────────────────────────
  -- 0. Load already-earned badges so we skip them
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT ARRAY_AGG(badge_key)
  INTO v_earned
  FROM user_badges
  WHERE user_id = p_user_id;

  v_earned := COALESCE(v_earned, ARRAY[]::TEXT[]);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. Profile snapshot
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(total_co2_saved_kg, 0),
    COALESCE(total_money_saved_eur, 0),
    COALESCE(total_hazards_reported, 0),
    COALESCE(total_riders_protected, 0),
    COALESCE(total_microlives, 0),
    COALESCE(total_community_seconds, 0)
  INTO
    v_total_co2,
    v_total_money,
    v_total_hazards,
    v_total_riders_prot,
    v_total_microlives,
    v_total_community_secs
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
  -- 3. Ride aggregates (single pass over ride_impacts)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(distance_meters), 0),
    COALESCE(SUM(duration_minutes), 0),
    COALESCE(MAX(distance_meters), 0),
    COALESCE(MAX(elevation_gain_m), 0),
    COALESCE(SUM(elevation_gain_m), 0),
    COALESCE(COUNT(*) FILTER (WHERE ride_start_hour IS NOT NULL AND ride_start_hour < 7), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE ride_start_hour IS NOT NULL AND ride_start_hour >= 21), 0)::INT,
    COALESCE(COUNT(*) FILTER (
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', now())
    ), 0)::INT,
    -- rain: includes 'rain', 'Rain', 'drizzle', 'Drizzle', or any containing those substrings
    COALESCE(COUNT(*) FILTER (
      WHERE weather_condition IS NOT NULL
        AND (LOWER(weather_condition) LIKE '%rain%' OR LOWER(weather_condition) LIKE '%drizzle%')
    ), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE wind_speed_kmh IS NOT NULL AND wind_speed_kmh > 30), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE temperature_c IS NOT NULL AND temperature_c < 5), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE temperature_c IS NOT NULL AND temperature_c > 35), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE aqi_level IS NOT NULL AND aqi_level IN ('good', 'fair')), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE aqi_level IS NOT NULL AND aqi_level NOT IN ('good', 'fair')), 0)::INT
  INTO
    v_ride_count,
    v_total_distance_m,
    v_total_duration_min,
    v_max_single_distance,
    v_max_single_elev,
    v_total_elevation_m,
    v_early_count,
    v_night_count,
    v_monthly_count,
    v_rain_5_count,
    v_wind_30_count,
    v_cold_5_count,
    v_hot_35_count,
    v_good_aqi_count,
    v_bad_aqi_count
  FROM ride_impacts
  WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 4. Boolean flags: first ride, first safe route
  -- ──────────────────────────────────────────────────────────────────────────
  v_first_ride := (v_ride_count >= 1);

  SELECT EXISTS (
    SELECT 1 FROM trip_tracks
    WHERE user_id = p_user_id AND routing_mode = 'safe'
  ) INTO v_first_safe_route;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 5. first_night_ride, first_rain_ride, first_10km (single-ride qualifiers)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND ride_start_hour IS NOT NULL
      AND (ride_start_hour >= 21 OR ride_start_hour < 5)
  ) INTO v_first_night_ride;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND weather_condition IS NOT NULL
      AND (LOWER(weather_condition) LIKE '%rain%' OR LOWER(weather_condition) LIKE '%drizzle%')
  ) INTO v_first_rain_ride;

  v_first_10km := (v_max_single_distance >= 10000);

  -- ──────────────────────────────────────────────────────────────────────────
  -- 6. Social counts
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT COALESCE(COUNT(*), 0)::INT INTO v_share_count
  FROM trip_shares WHERE user_id = p_user_id;

  SELECT (
    COALESCE((SELECT COUNT(*) FROM feed_likes   WHERE user_id = p_user_id), 0) +
    COALESCE((SELECT COUNT(*) FROM trip_loves   WHERE user_id = p_user_id), 0)
  )::INT INTO v_like_count;

  SELECT COALESCE(COUNT(*), 0)::INT INTO v_comment_count
  FROM feed_comments WHERE user_id = p_user_id;

  SELECT COALESCE(COUNT(*), 0)::INT INTO v_validate_count
  FROM hazard_validations WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 7. Quiz counts
  -- ──────────────────────────────────────────────────────────────────────────

  -- Days the user did any quiz (proxy for sessions)
  SELECT COALESCE(COUNT(DISTINCT DATE(answered_at AT TIME ZONE 'UTC')), 0)::INT
  INTO v_quiz_days
  FROM user_quiz_history
  WHERE user_id = p_user_id;

  -- Perfect quiz days: days where every answer was correct
  SELECT COALESCE(COUNT(*), 0)::INT
  INTO v_perfect_quiz_days
  FROM (
    SELECT DATE(answered_at AT TIME ZONE 'UTC') AS quiz_date
    FROM user_quiz_history
    WHERE user_id = p_user_id
    GROUP BY DATE(answered_at AT TIME ZONE 'UTC')
    HAVING COUNT(*) FILTER (WHERE is_correct = false) = 0
       AND COUNT(*) > 0
  ) perfect_days;

  -- Perfect streak of 3 consecutive days: detect using dense_rank
  SELECT EXISTS (
    WITH perfect_day_list AS (
      SELECT DATE(answered_at AT TIME ZONE 'UTC') AS quiz_date
      FROM user_quiz_history
      WHERE user_id = p_user_id
      GROUP BY DATE(answered_at AT TIME ZONE 'UTC')
      HAVING COUNT(*) FILTER (WHERE is_correct = false) = 0
         AND COUNT(*) > 0
    ),
    numbered AS (
      SELECT quiz_date,
             quiz_date - (ROW_NUMBER() OVER (ORDER BY quiz_date))::INT AS grp
      FROM perfect_day_list
    ),
    runs AS (
      SELECT COUNT(*) AS run_len FROM numbered GROUP BY grp
    )
    SELECT 1 FROM runs WHERE run_len >= 3
  ) INTO v_perfect_streak_3;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 8. Hazard specialisation
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE hazard_type = 'pothole'), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE hazard_type = 'illegally_parked_car'), 0)::INT,
    -- DB stores 'construction' (not 'construction_zone')
    COALESCE(COUNT(*) FILTER (WHERE hazard_type = 'construction'), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE hazard_type = 'dangerous_intersection'), 0)::INT,
    -- distinct hazard types: count how many of the 8 required types the user has reported at least once
    -- Required types: pothole, illegally_parked_car, blocked_bike_lane, missing_bike_lane,
    --                 poor_surface, narrow_street, dangerous_intersection, construction
    COUNT(DISTINCT
      CASE WHEN hazard_type IN (
        'pothole', 'illegally_parked_car', 'blocked_bike_lane', 'missing_bike_lane',
        'poor_surface', 'narrow_street', 'dangerous_intersection', 'construction'
      ) THEN hazard_type ELSE NULL END
    )::INT
  INTO
    v_hazard_pothole,
    v_hazard_parking,
    v_hazard_construction,
    v_hazard_intersection,
    v_distinct_hazard_types
  FROM hazards
  WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 9. Seasonal ride counts (any year)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM created_at) IN (3,4,5)), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM created_at) IN (6,7,8)), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM created_at) IN (9,10,11)), 0)::INT,
    COALESCE(COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM created_at) IN (12,1,2)), 0)::INT
  INTO
    v_spring_count,
    v_summer_count,
    v_autumn_count,
    v_winter_count
  FROM ride_impacts
  WHERE user_id = p_user_id;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 10. Athletic one-timers
  -- ──────────────────────────────────────────────────────────────────────────

  -- sprint: elev >= 500m AND dist < 25km in same ride
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND elevation_gain_m >= 500
      AND distance_meters < 25000
  ) INTO v_sprint_500m;

  -- endurance 2h / 4h
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id AND duration_minutes >= 120
  ) INTO v_endurance_2h;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id AND duration_minutes >= 240
  ) INTO v_endurance_4h;

  -- round_trip: start & destination within 200m of each other, ride >= 10km
  SELECT EXISTS (
    SELECT 1
    FROM trips t
    JOIN ride_impacts ri ON ri.trip_id = t.id
    WHERE t.user_id = p_user_id
      AND t.start_location IS NOT NULL
      AND t.destination_location IS NOT NULL
      AND ST_DWithin(t.start_location, t.destination_location, 200)
      AND ri.distance_meters >= 10000
  ) INTO v_round_trip;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 11. Annual event flags (based on ride_impacts.created_at date)
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 1
      AND EXTRACT(DAY FROM created_at) = 1
  ) INTO v_new_year;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 2
      AND EXTRACT(DAY FROM created_at) = 14
  ) INTO v_valentine;

  -- earth_day: ride on Apr 22 AND a hazard reported on the same calendar day/year
  SELECT EXISTS (
    SELECT 1
    FROM ride_impacts ri
    WHERE ri.user_id = p_user_id
      AND EXTRACT(MONTH FROM ri.created_at) = 4
      AND EXTRACT(DAY FROM ri.created_at) = 22
      AND EXISTS (
        SELECT 1 FROM hazards h
        WHERE h.user_id = p_user_id
          AND EXTRACT(YEAR  FROM h.created_at) = EXTRACT(YEAR  FROM ri.created_at)
          AND EXTRACT(MONTH FROM h.created_at) = 4
          AND EXTRACT(DAY   FROM h.created_at) = 22
      )
  ) INTO v_earth_day;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 6
      AND EXTRACT(DAY FROM created_at) = 3
  ) INTO v_bike_day;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 6
      AND EXTRACT(DAY FROM created_at) IN (20, 21)
  ) INTO v_summer_solstice;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 10
      AND EXTRACT(DAY FROM created_at) = 31
  ) INTO v_halloween;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 12
      AND EXTRACT(DAY FROM created_at) IN (24, 25)
  ) INTO v_christmas;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 12
      AND EXTRACT(DAY FROM created_at) IN (21, 22)
  ) INTO v_winter_solstice;

  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 2
      AND EXTRACT(DAY FROM created_at) = 29
  ) INTO v_leap_day;

  -- friday_13: joined with trips to check started_at day
  SELECT EXISTS (
    SELECT 1
    FROM ride_impacts ri
    JOIN trips t ON t.id = ri.trip_id
    WHERE ri.user_id = p_user_id
      AND EXTRACT(DOW FROM t.started_at) = 5
      AND EXTRACT(DAY FROM t.started_at) = 13
  ) INTO v_friday_13;

  -- pi_day: ride on Mar 14 with distance >= 3.14 km
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND EXTRACT(MONTH FROM created_at) = 3
      AND EXTRACT(DAY FROM created_at) = 14
      AND distance_meters >= 3140
  ) INTO v_pi_day;

  -- five_am: any ride starting before 5 AM
  SELECT EXISTS (
    SELECT 1 FROM ride_impacts
    WHERE user_id = p_user_id
      AND ride_start_hour IS NOT NULL
      AND ride_start_hour < 5
  ) INTO v_five_am;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 12. Hidden distance badges
  -- ──────────────────────────────────────────────────────────────────────────

  -- mirror_distance: a ride whose displayed km (rounded to 1 decimal) is a
  -- "mirror" number — i.e. all digits are the same when written as XX.X
  -- Valid mirrors: 11.1, 22.2, 33.3, 44.4, 55.5, 66.6, 77.7, 88.8, 99.9,
  --                111.1, 222.2, 333.3 (within 0.05 km tolerance)
  SELECT EXISTS (
    SELECT 1
    FROM ride_impacts
    WHERE user_id = p_user_id
      AND (
        -- 11.1 km = 11050–11150 m
        (distance_meters BETWEEN 11050 AND 11150) OR
        -- 22.2 km
        (distance_meters BETWEEN 22150 AND 22250) OR
        -- 33.3 km
        (distance_meters BETWEEN 33250 AND 33350) OR
        -- 44.4 km
        (distance_meters BETWEEN 44350 AND 44450) OR
        -- 55.5 km
        (distance_meters BETWEEN 55450 AND 55550) OR
        -- 66.6 km
        (distance_meters BETWEEN 66550 AND 66650) OR
        -- 77.7 km
        (distance_meters BETWEEN 77650 AND 77750) OR
        -- 88.8 km
        (distance_meters BETWEEN 88750 AND 88850) OR
        -- 99.9 km
        (distance_meters BETWEEN 99850 AND 99950) OR
        -- 111.1 km
        (distance_meters BETWEEN 111050 AND 111150) OR
        -- 222.2 km
        (distance_meters BETWEEN 222150 AND 222250) OR
        -- 333.3 km
        (distance_meters BETWEEN 333250 AND 333350)
      )
  ) INTO v_mirror_distance;

  -- round_number: displayed distance is a whole number km (within 50m), >= 5 km
  SELECT EXISTS (
    SELECT 1
    FROM ride_impacts
    WHERE user_id = p_user_id
      AND distance_meters >= 5000
      AND (distance_meters::BIGINT % 1000) <= 50
  ) INTO v_round_number;

  -- same_commute_7: 7 consecutive trips where start ≈ prior-start and dest ≈ prior-dest
  SELECT EXISTS (
    WITH ordered_trips AS (
      SELECT
        t.id,
        t.started_at,
        t.start_location,
        t.destination_location,
        LAG(t.start_location)      OVER (ORDER BY t.started_at) AS prev_start,
        LAG(t.destination_location) OVER (ORDER BY t.started_at) AS prev_dest
      FROM trips t
      WHERE t.user_id = p_user_id
        AND t.start_location IS NOT NULL
        AND t.destination_location IS NOT NULL
    ),
    matched AS (
      SELECT
        started_at,
        CASE
          WHEN prev_start IS NOT NULL
           AND prev_dest  IS NOT NULL
           AND ST_DWithin(start_location, prev_start, 200)
           AND ST_DWithin(destination_location, prev_dest, 200)
          THEN 1 ELSE 0
        END AS is_same
      FROM ordered_trips
    ),
    runs AS (
      SELECT
        started_at,
        is_same,
        SUM(CASE WHEN is_same = 0 THEN 1 ELSE 0 END)
          OVER (ORDER BY started_at) AS grp
      FROM matched
    ),
    run_lengths AS (
      SELECT grp, SUM(is_same) + 1 AS run_len
      FROM runs
      WHERE is_same = 1
      GROUP BY grp
    )
    SELECT 1 FROM run_lengths WHERE run_len >= 7
  ) INTO v_same_commute_7;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 13. Build candidate list
  --     Only add badges the user hasn't already earned.
  -- ──────────────────────────────────────────────────────────────────────────

  -- Helper macro: add key if criterion met and not yet earned
  -- (We'll use a series of IF blocks for clarity)

  -- ── FIRSTS ────────────────────────────────────────────────────────────────
  IF v_first_ride           AND NOT ('first_ride'        = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_ride';        END IF;
  IF v_first_safe_route     AND NOT ('first_safe_route'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_safe_route';  END IF;
  IF v_total_hazards >= 1   AND NOT ('first_hazard'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_hazard';      END IF;
  IF v_share_count >= 1     AND NOT ('first_share'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_share';       END IF;
  IF v_comment_count >= 1   AND NOT ('first_comment'     = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_comment';     END IF;
  IF v_like_count >= 1      AND NOT ('first_like'        = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_like';        END IF;
  IF v_validate_count >= 1  AND NOT ('first_validation'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_validation';  END IF;
  IF v_quiz_days >= 1       AND NOT ('first_quiz'        = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_quiz';        END IF;
  IF v_first_night_ride     AND NOT ('first_night_ride'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_night_ride';  END IF;
  IF v_first_rain_ride      AND NOT ('first_rain_ride'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_rain_ride';   END IF;
  IF v_first_10km           AND NOT ('first_10km'        = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_10km';        END IF;
  -- first_week_streak handled below with streak badges
  -- first_multi_stop: not evaluatable from DB; skipped

  -- ── DISTANCE (cumulative) ─────────────────────────────────────────────────
  IF v_total_distance_m >= 50000    AND NOT ('distance_50km'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_50km';   END IF;
  IF v_total_distance_m >= 150000   AND NOT ('distance_150km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_150km';  END IF;
  IF v_total_distance_m >= 500000   AND NOT ('distance_500km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_500km';  END IF;
  IF v_total_distance_m >= 1500000  AND NOT ('distance_1500km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_1500km'; END IF;
  IF v_total_distance_m >= 5000000  AND NOT ('distance_5000km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'distance_5000km'; END IF;

  -- ── SINGLE RIDE DISTANCE ─────────────────────────────────────────────────
  IF v_max_single_distance >= 10000  AND NOT ('single_10km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_10km';  END IF;
  IF v_max_single_distance >= 25000  AND NOT ('single_25km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_25km';  END IF;
  IF v_max_single_distance >= 50000  AND NOT ('single_50km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_50km';  END IF;
  IF v_max_single_distance >= 100000 AND NOT ('single_100km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_100km'; END IF;
  IF v_max_single_distance >= 200000 AND NOT ('single_200km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'single_200km'; END IF;

  -- ── TIME (cumulative duration_minutes) ────────────────────────────────────
  IF v_total_duration_min >= 300   AND NOT ('time_5h'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_5h';   END IF;
  IF v_total_duration_min >= 900   AND NOT ('time_15h'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_15h';  END IF;
  IF v_total_duration_min >= 3000  AND NOT ('time_50h'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_50h';  END IF;
  IF v_total_duration_min >= 9000  AND NOT ('time_150h' = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_150h'; END IF;
  IF v_total_duration_min >= 30000 AND NOT ('time_500h' = ANY(v_earned)) THEN v_candidates := v_candidates || 'time_500h'; END IF;

  -- ── RIDE COUNT ────────────────────────────────────────────────────────────
  IF v_ride_count >= 10   AND NOT ('rides_10'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_10';   END IF;
  IF v_ride_count >= 30   AND NOT ('rides_30'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_30';   END IF;
  IF v_ride_count >= 100  AND NOT ('rides_100'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_100';  END IF;
  IF v_ride_count >= 300  AND NOT ('rides_300'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_300';  END IF;
  IF v_ride_count >= 1000 AND NOT ('rides_1000' = ANY(v_earned)) THEN v_candidates := v_candidates || 'rides_1000'; END IF;

  -- ── STREAK ────────────────────────────────────────────────────────────────
  IF v_longest_streak >= 7  AND NOT ('streak_7'          = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_7';          END IF;
  IF v_longest_streak >= 7  AND NOT ('first_week_streak'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'first_week_streak'; END IF;
  IF v_longest_streak >= 14 AND NOT ('streak_14'          = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_14';         END IF;
  IF v_longest_streak >= 30 AND NOT ('streak_30'          = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_30';         END IF;
  IF v_longest_streak >= 60 AND NOT ('streak_60'          = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_60';         END IF;
  IF v_longest_streak >= 100 AND NOT ('streak_100'        = ANY(v_earned)) THEN v_candidates := v_candidates || 'streak_100';        END IF;

  -- ── EARLY BIRD ────────────────────────────────────────────────────────────
  IF v_early_count >= 5  AND NOT ('early_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'early_5';  END IF;
  IF v_early_count >= 15 AND NOT ('early_15' = ANY(v_earned)) THEN v_candidates := v_candidates || 'early_15'; END IF;
  IF v_early_count >= 50 AND NOT ('early_50' = ANY(v_earned)) THEN v_candidates := v_candidates || 'early_50'; END IF;

  -- ── NIGHT OWL ─────────────────────────────────────────────────────────────
  IF v_night_count >= 5  AND NOT ('night_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'night_5';  END IF;
  IF v_night_count >= 15 AND NOT ('night_15' = ANY(v_earned)) THEN v_candidates := v_candidates || 'night_15'; END IF;
  IF v_night_count >= 50 AND NOT ('night_50' = ANY(v_earned)) THEN v_candidates := v_candidates || 'night_50'; END IF;

  -- ── MONTHLY ───────────────────────────────────────────────────────────────
  IF v_monthly_count >= 10 AND NOT ('monthly_10' = ANY(v_earned)) THEN v_candidates := v_candidates || 'monthly_10'; END IF;
  IF v_monthly_count >= 20 AND NOT ('monthly_20' = ANY(v_earned)) THEN v_candidates := v_candidates || 'monthly_20'; END IF;
  IF v_monthly_count >= 30 AND NOT ('monthly_30' = ANY(v_earned)) THEN v_candidates := v_candidates || 'monthly_30'; END IF;

  -- ── CO2 ───────────────────────────────────────────────────────────────────
  IF v_total_co2 >= 5   AND NOT ('co2_5kg'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_5kg';   END IF;
  IF v_total_co2 >= 15  AND NOT ('co2_15kg'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_15kg';  END IF;
  IF v_total_co2 >= 50  AND NOT ('co2_50kg'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_50kg';  END IF;
  IF v_total_co2 >= 150 AND NOT ('co2_150kg' = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_150kg'; END IF;
  IF v_total_co2 >= 500 AND NOT ('co2_500kg' = ANY(v_earned)) THEN v_candidates := v_candidates || 'co2_500kg'; END IF;

  -- ── MONEY ─────────────────────────────────────────────────────────────────
  IF v_total_money >= 10   AND NOT ('money_10'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_10';   END IF;
  IF v_total_money >= 50   AND NOT ('money_50'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_50';   END IF;
  IF v_total_money >= 200  AND NOT ('money_200'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_200';  END IF;
  IF v_total_money >= 500  AND NOT ('money_500'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_500';  END IF;
  IF v_total_money >= 2000 AND NOT ('money_2000' = ANY(v_earned)) THEN v_candidates := v_candidates || 'money_2000'; END IF;

  -- ── MICROLIVES ────────────────────────────────────────────────────────────
  IF v_total_microlives >= 2    AND NOT ('ml_2'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'ml_2';    END IF;
  IF v_total_microlives >= 8    AND NOT ('ml_8'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'ml_8';    END IF;
  IF v_total_microlives >= 48   AND NOT ('ml_48'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'ml_48';   END IF;
  IF v_total_microlives >= 336  AND NOT ('ml_336'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'ml_336';  END IF;
  IF v_total_microlives >= 1440 AND NOT ('ml_1440' = ANY(v_earned)) THEN v_candidates := v_candidates || 'ml_1440'; END IF;

  -- ── COMMUNITY SECONDS ─────────────────────────────────────────────────────
  IF v_total_community_secs >= 60   AND NOT ('community_60s'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'community_60s';   END IF;
  IF v_total_community_secs >= 300  AND NOT ('community_300s'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'community_300s';  END IF;
  IF v_total_community_secs >= 1800 AND NOT ('community_1800s' = ANY(v_earned)) THEN v_candidates := v_candidates || 'community_1800s'; END IF;
  IF v_total_community_secs >= 3600 AND NOT ('community_3600s' = ANY(v_earned)) THEN v_candidates := v_candidates || 'community_3600s'; END IF;

  -- ── HAZARDS (total reported from profiles) ────────────────────────────────
  IF v_total_hazards >= 5   AND NOT ('hazard_5'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_5';   END IF;
  IF v_total_hazards >= 15  AND NOT ('hazard_15'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_15';  END IF;
  IF v_total_hazards >= 50  AND NOT ('hazard_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_50';  END IF;
  IF v_total_hazards >= 100 AND NOT ('hazard_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_100'; END IF;
  IF v_total_hazards >= 250 AND NOT ('hazard_250' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_250'; END IF;

  -- ── VALIDATORS ────────────────────────────────────────────────────────────
  IF v_validate_count >= 10  AND NOT ('validate_10'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'validate_10';  END IF;
  IF v_validate_count >= 30  AND NOT ('validate_30'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'validate_30';  END IF;
  IF v_validate_count >= 100 AND NOT ('validate_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'validate_100'; END IF;

  -- ── HAZARD SPECIALISTS ────────────────────────────────────────────────────
  IF v_hazard_pothole >= 10      AND NOT ('hazard_pothole'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_pothole';      END IF;
  IF v_hazard_parking >= 10      AND NOT ('hazard_parking'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_parking';      END IF;
  IF v_hazard_construction >= 10 AND NOT ('hazard_construction' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_construction'; END IF;
  IF v_hazard_intersection >= 10 AND NOT ('hazard_intersection' = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_intersection'; END IF;
  IF v_distinct_hazard_types >= 8 AND NOT ('hazard_all_types'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'hazard_all_types';   END IF;

  -- ── QUIZ ──────────────────────────────────────────────────────────────────
  IF v_quiz_days >= 5   AND NOT ('quiz_5'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_5';   END IF;
  IF v_quiz_days >= 15  AND NOT ('quiz_15'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_15';  END IF;
  IF v_quiz_days >= 50  AND NOT ('quiz_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_50';  END IF;
  IF v_quiz_days >= 100 AND NOT ('quiz_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_100'; END IF;
  IF v_perfect_quiz_days >= 1 AND NOT ('quiz_perfect_1'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_perfect_1';       END IF;
  IF v_perfect_quiz_days >= 5 AND NOT ('quiz_perfect_5'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_perfect_5';       END IF;
  IF v_perfect_streak_3       AND NOT ('quiz_perfect_streak_3' = ANY(v_earned)) THEN v_candidates := v_candidates || 'quiz_perfect_streak_3'; END IF;

  -- ── CLIMB (per-ride max) ──────────────────────────────────────────────────
  IF v_max_single_elev >= 100  AND NOT ('climb_100m'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'climb_100m';  END IF;
  IF v_max_single_elev >= 300  AND NOT ('climb_300m'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'climb_300m';  END IF;
  IF v_max_single_elev >= 500  AND NOT ('climb_500m'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'climb_500m';  END IF;
  IF v_max_single_elev >= 1000 AND NOT ('climb_1000m' = ANY(v_earned)) THEN v_candidates := v_candidates || 'climb_1000m'; END IF;

  -- ── CUMULATIVE CLIMB ─────────────────────────────────────────────────────
  IF v_total_elevation_m >= 1000  AND NOT ('total_climb_1km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_1km';  END IF;
  IF v_total_elevation_m >= 5000  AND NOT ('total_climb_5km'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_5km';  END IF;
  IF v_total_elevation_m >= 10000 AND NOT ('total_climb_10km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_10km'; END IF;
  IF v_total_elevation_m >= 25000 AND NOT ('total_climb_25km' = ANY(v_earned)) THEN v_candidates := v_candidates || 'total_climb_25km'; END IF;

  -- ── ATHLETIC ONE-TIMERS ───────────────────────────────────────────────────
  IF v_sprint_500m   AND NOT ('sprint_500m_climb' = ANY(v_earned)) THEN v_candidates := v_candidates || 'sprint_500m_climb'; END IF;
  IF v_endurance_2h  AND NOT ('endurance_2h'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'endurance_2h';      END IF;
  IF v_endurance_4h  AND NOT ('endurance_4h'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'endurance_4h';      END IF;
  IF v_round_trip    AND NOT ('round_trip'         = ANY(v_earned)) THEN v_candidates := v_candidates || 'round_trip';        END IF;

  -- ── WEATHER ───────────────────────────────────────────────────────────────
  IF v_rain_5_count  >= 5  AND NOT ('rain_ride'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'rain_ride';    END IF;
  IF v_rain_5_count  >= 15 AND NOT ('rain_ride_10' = ANY(v_earned)) THEN v_candidates := v_candidates || 'rain_ride_10'; END IF;
  IF v_wind_30_count >= 5  AND NOT ('wind_ride'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'wind_ride';    END IF;
  IF v_cold_5_count  >= 5  AND NOT ('cold_ride'    = ANY(v_earned)) THEN v_candidates := v_candidates || 'cold_ride';    END IF;
  IF v_hot_35_count  >= 5  AND NOT ('hot_ride'     = ANY(v_earned)) THEN v_candidates := v_candidates || 'hot_ride';     END IF;
  -- all_weather: requires all four individual weather badges earned (either already or in this pass)
  IF (
      ('rain_ride' = ANY(v_earned) OR 'rain_ride' = ANY(v_candidates)) AND
      ('wind_ride' = ANY(v_earned) OR 'wind_ride' = ANY(v_candidates)) AND
      ('cold_ride' = ANY(v_earned) OR 'cold_ride' = ANY(v_candidates)) AND
      ('hot_ride'  = ANY(v_earned) OR 'hot_ride'  = ANY(v_candidates))
     ) AND NOT ('all_weather' = ANY(v_earned))
  THEN v_candidates := v_candidates || 'all_weather'; END IF;
  IF v_good_aqi_count >= 20 AND NOT ('good_air_20' = ANY(v_earned)) THEN v_candidates := v_candidates || 'good_air_20'; END IF;
  IF v_bad_aqi_count  >= 5  AND NOT ('aqi_aware_5' = ANY(v_earned)) THEN v_candidates := v_candidates || 'aqi_aware_5'; END IF;

  -- ── SOCIAL ────────────────────────────────────────────────────────────────
  IF v_share_count >= 5   AND NOT ('shares_5'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'shares_5';   END IF;
  IF v_share_count >= 15  AND NOT ('shares_15'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'shares_15';  END IF;
  IF v_share_count >= 50  AND NOT ('shares_50'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'shares_50';  END IF;
  IF v_like_count >= 10   AND NOT ('likes_10'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'likes_10';   END IF;
  IF v_like_count >= 50   AND NOT ('likes_50'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'likes_50';   END IF;
  IF v_like_count >= 200  AND NOT ('likes_200'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'likes_200';  END IF;
  IF v_comment_count >= 5  AND NOT ('comments_5'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'comments_5';  END IF;
  IF v_comment_count >= 20 AND NOT ('comments_20' = ANY(v_earned)) THEN v_candidates := v_candidates || 'comments_20'; END IF;
  IF v_comment_count >= 50 AND NOT ('comments_50' = ANY(v_earned)) THEN v_candidates := v_candidates || 'comments_50'; END IF;
  IF v_total_riders_prot >= 5   AND NOT ('protected_5'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'protected_5';   END IF;
  IF v_total_riders_prot >= 25  AND NOT ('protected_25'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'protected_25';  END IF;
  IF v_total_riders_prot >= 100 AND NOT ('protected_100' = ANY(v_earned)) THEN v_candidates := v_candidates || 'protected_100'; END IF;

  -- ── SEASONAL ─────────────────────────────────────────────────────────────
  IF v_spring_count >= 30 AND NOT ('spring_bloom'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'spring_bloom';  END IF;
  IF v_summer_count >= 30 AND NOT ('summer_blaze'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'summer_blaze';  END IF;
  IF v_autumn_count >= 30 AND NOT ('autumn_leaf'   = ANY(v_earned)) THEN v_candidates := v_candidates || 'autumn_leaf';   END IF;
  IF v_winter_count >= 30 AND NOT ('winter_steel'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'winter_steel';  END IF;
  -- four_seasons: all 4 seasonal badges earned (either already or in this pass)
  IF (
      ('spring_bloom' = ANY(v_earned) OR 'spring_bloom' = ANY(v_candidates)) AND
      ('summer_blaze' = ANY(v_earned) OR 'summer_blaze' = ANY(v_candidates)) AND
      ('autumn_leaf'  = ANY(v_earned) OR 'autumn_leaf'  = ANY(v_candidates)) AND
      ('winter_steel' = ANY(v_earned) OR 'winter_steel' = ANY(v_candidates))
     ) AND NOT ('four_seasons' = ANY(v_earned))
  THEN v_candidates := v_candidates || 'four_seasons'; END IF;

  -- ── ANNUAL EVENTS ────────────────────────────────────────────────────────
  IF v_new_year       AND NOT ('new_year'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'new_year';       END IF;
  IF v_valentine      AND NOT ('valentine'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'valentine';      END IF;
  IF v_earth_day      AND NOT ('earth_day'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'earth_day';      END IF;
  IF v_bike_day       AND NOT ('bike_day'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'bike_day';       END IF;
  IF v_summer_solstice AND NOT ('summer_solstice' = ANY(v_earned)) THEN v_candidates := v_candidates || 'summer_solstice'; END IF;
  IF v_halloween      AND NOT ('halloween'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'halloween';      END IF;
  IF v_christmas      AND NOT ('christmas'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'christmas';      END IF;
  IF v_winter_solstice AND NOT ('winter_solstice' = ANY(v_earned)) THEN v_candidates := v_candidates || 'winter_solstice'; END IF;
  IF v_leap_day       AND NOT ('leap_day'       = ANY(v_earned)) THEN v_candidates := v_candidates || 'leap_day';       END IF;
  IF v_friday_13      AND NOT ('friday_13'      = ANY(v_earned)) THEN v_candidates := v_candidates || 'friday_13';      END IF;
  IF v_pi_day         AND NOT ('pi_day'         = ANY(v_earned)) THEN v_candidates := v_candidates || 'pi_day';         END IF;

  -- ── HIDDEN ────────────────────────────────────────────────────────────────
  IF v_five_am         AND NOT ('five_am'          = ANY(v_earned)) THEN v_candidates := v_candidates || 'five_am';          END IF;
  IF v_mirror_distance AND NOT ('mirror_distance'  = ANY(v_earned)) THEN v_candidates := v_candidates || 'mirror_distance';  END IF;
  IF v_round_number    AND NOT ('round_number'     = ANY(v_earned)) THEN v_candidates := v_candidates || 'round_number';     END IF;
  IF v_same_commute_7  AND NOT ('same_origin_dest_7' = ANY(v_earned)) THEN v_candidates := v_candidates || 'same_origin_dest_7'; END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 14. Insert new badges (only keys that exist in badge_definitions)
  -- ──────────────────────────────────────────────────────────────────────────
  IF ARRAY_LENGTH(v_candidates, 1) IS NOT NULL AND ARRAY_LENGTH(v_candidates, 1) > 0 THEN
    INSERT INTO user_badges (user_id, badge_key, earned_at)
    SELECT p_user_id, bd.badge_key, now()
    FROM badge_definitions bd
    WHERE bd.badge_key = ANY(v_candidates)
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 15. Return full badge_definitions rows for newly awarded badges
  -- ──────────────────────────────────────────────────────────────────────────
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'badge_key',     bd.badge_key,
        'category',      bd.category,
        'display_tab',   bd.display_tab,
        'name',          bd.name,
        'flavor_text',   bd.flavor_text,
        'criteria_text', bd.criteria_text,
        'criteria_unit', bd.criteria_unit,
        'tier',          bd.tier,
        'tier_family',   bd.tier_family,
        'is_hidden',     bd.is_hidden,
        'is_seasonal',   bd.is_seasonal,
        'sort_order',    bd.sort_order,
        'icon_key',      bd.icon_key,
        'earned_at',     ub.earned_at
      )
      ORDER BY bd.sort_order
    ),
    '[]'::JSONB
  )
  INTO v_result
  FROM badge_definitions bd
  JOIN user_badges ub ON ub.badge_key = bd.badge_key AND ub.user_id = p_user_id
  WHERE bd.badge_key = ANY(v_candidates);

  RETURN v_result;

END;
$$;

GRANT EXECUTE ON FUNCTION check_and_award_badges(UUID) TO service_role;
