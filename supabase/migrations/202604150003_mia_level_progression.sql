-- Migration: Mia Level Progression RPC
-- Evaluates whether a Mia user should level up after completing a ride.

CREATE OR REPLACE FUNCTION evaluate_mia_level_up(
  p_user_id UUID,
  p_ride_distance_km NUMERIC,
  p_had_destination BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_persona TEXT;
  v_status TEXT;
  v_current_level INT;
  v_total_rides INT;
  v_rides_with_dest INT;
  v_rides_over_5km INT;
  v_new_level INT;
  v_should_level_up BOOLEAN := FALSE;
BEGIN
  -- Read current Mia journey state
  SELECT persona, mia_journey_status, mia_journey_level,
         mia_total_rides, mia_rides_with_destination, mia_rides_over_5km
    INTO v_persona, v_status, v_current_level,
         v_total_rides, v_rides_with_dest, v_rides_over_5km
    FROM profiles
   WHERE id = p_user_id;

  -- If not an active Mia user, return early
  IF v_persona IS DISTINCT FROM 'mia' OR v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('leveled_up', FALSE);
  END IF;

  -- Increment ride counters
  v_total_rides := v_total_rides + 1;

  IF p_had_destination = TRUE THEN
    v_rides_with_dest := v_rides_with_dest + 1;
  END IF;

  IF p_ride_distance_km > 5.0 THEN
    v_rides_over_5km := v_rides_over_5km + 1;
  END IF;

  -- Persist updated counters
  UPDATE profiles
     SET mia_total_rides = v_total_rides,
         mia_rides_with_destination = v_rides_with_dest,
         mia_rides_over_5km = v_rides_over_5km
   WHERE id = p_user_id;

  -- Evaluate level-up criteria
  v_new_level := v_current_level;

  -- Level 1 -> 2: first ride completed
  IF v_current_level = 1 AND v_total_rides >= 1 THEN
    v_new_level := 2;
    v_should_level_up := TRUE;
  END IF;

  -- Level 2 -> 3: 3 total rides
  IF v_current_level = 2 AND v_total_rides >= 3 THEN
    v_new_level := 3;
    v_should_level_up := TRUE;
  END IF;

  -- Level 3 -> 4: 5 rides AND at least 1 with destination
  IF v_current_level = 3 AND v_total_rides >= 5 AND v_rides_with_dest >= 1 THEN
    v_new_level := 4;
    v_should_level_up := TRUE;
  END IF;

  -- Level 4 -> 5: (12 rides AND 2 over 5km) OR 20 total rides
  IF v_current_level = 4 AND (
    (v_total_rides >= 12 AND v_rides_over_5km >= 2) OR v_total_rides >= 20
  ) THEN
    v_new_level := 5;
    v_should_level_up := TRUE;
  END IF;

  -- Apply level-up
  IF v_should_level_up THEN
    UPDATE profiles
       SET mia_journey_level = v_new_level
     WHERE id = p_user_id;

    -- Log the level-up event
    INSERT INTO mia_journey_events (user_id, event_type, from_level, to_level, metadata)
    VALUES (
      p_user_id,
      'level_up',
      v_current_level,
      v_new_level,
      jsonb_build_object(
        'total_rides', v_total_rides,
        'rides_with_destination', v_rides_with_dest,
        'rides_over_5km', v_rides_over_5km,
        'ride_distance_km', p_ride_distance_km
      )
    );

    -- If reaching level 5, complete the journey and switch to alex
    IF v_new_level = 5 THEN
      UPDATE profiles
         SET mia_journey_status = 'completed',
             mia_journey_completed_at = NOW(),
             persona = 'alex'
       WHERE id = p_user_id;

      INSERT INTO mia_journey_events (user_id, event_type, from_level, to_level, metadata)
      VALUES (
        p_user_id,
        'journey_completed',
        v_current_level,
        5,
        jsonb_build_object(
          'total_rides', v_total_rides,
          'rides_with_destination', v_rides_with_dest,
          'rides_over_5km', v_rides_over_5km
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'leveled_up', TRUE,
      'from_level', v_current_level,
      'to_level', v_new_level,
      'new_level', v_new_level
    );
  END IF;

  RETURN jsonb_build_object(
    'leveled_up', FALSE,
    'from_level', v_current_level,
    'to_level', v_current_level,
    'new_level', v_current_level
  );
END;
$$;
