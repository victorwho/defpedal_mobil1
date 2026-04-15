-- Migration: Mia Behavioral Detection Scoring RPC
-- Evaluates telemetry signals to compute a Mia detection score.
-- If score >= 50 and prompt not shown, queues the Mia invitation prompt.

CREATE OR REPLACE FUNCTION evaluate_mia_detection(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INT := 0;
  v_signals JSONB := '[]'::JSONB;
  v_prompt_triggered BOOLEAN := FALSE;
  v_signup_date TIMESTAMPTZ;
  v_days_since_signup INT;
  v_total_rides INT;
  v_prompt_shown BOOLEAN;
  v_route_not_started_count INT;
  v_app_open_count INT;
  v_long_browse_count INT;
  v_near_home_only BOOLEAN;
  v_signal_points INT;
BEGIN
  -- Read profile state
  SELECT
    created_at,
    mia_total_rides,
    mia_prompt_shown
  INTO v_signup_date, v_total_rides, v_prompt_shown
  FROM profiles
  WHERE id = p_user_id;

  IF v_signup_date IS NULL THEN
    RETURN jsonb_build_object('score', 0, 'signals', '[]'::JSONB, 'prompt_triggered', FALSE);
  END IF;

  v_days_since_signup := EXTRACT(DAY FROM (now() - v_signup_date))::INT;

  -- Signal 1: 7+ days since signup with zero rides → +30
  IF v_days_since_signup >= 7 AND v_total_rides = 0 THEN
    v_signal_points := 30;
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'signup_7d_no_rides',
      'points', v_signal_points,
      'days_since_signup', v_days_since_signup
    );
  END IF;

  -- Signal 2: Route generated but not started → +10 each, max 30
  SELECT COUNT(*)
  INTO v_route_not_started_count
  FROM user_telemetry_events
  WHERE user_id = p_user_id
    AND event_type = 'route_generated_not_started';

  IF v_route_not_started_count > 0 THEN
    v_signal_points := LEAST(v_route_not_started_count * 10, 30);
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'route_generated_not_started',
      'points', v_signal_points,
      'count', v_route_not_started_count
    );
  END IF;

  -- Signal 3: App opened 3+ times without riding → +20
  SELECT COUNT(*)
  INTO v_app_open_count
  FROM user_telemetry_events
  WHERE user_id = p_user_id
    AND event_type = 'app_open';

  IF v_app_open_count >= 3 AND v_total_rides = 0 THEN
    v_signal_points := 20;
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'app_opened_3plus_no_ride',
      'points', v_signal_points,
      'open_count', v_app_open_count
    );
  END IF;

  -- Signal 4: Map browsed 2+ min without action → +10 each, max 20
  SELECT COUNT(*)
  INTO v_long_browse_count
  FROM user_telemetry_events
  WHERE user_id = p_user_id
    AND event_type = 'map_browse_session'
    AND (properties->>'actions_taken') = '0'
    AND (properties->>'duration_seconds')::INT >= 120;

  IF v_long_browse_count > 0 THEN
    v_signal_points := LEAST(v_long_browse_count * 10, 20);
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'long_browse_no_action',
      'points', v_signal_points,
      'count', v_long_browse_count
    );
  END IF;

  -- Signal 5: Only zoomed near home (<2km) → +10
  SELECT NOT EXISTS (
    SELECT 1
    FROM user_telemetry_events
    WHERE user_id = p_user_id
      AND event_type = 'map_browse_session'
      AND (properties->>'max_distance_from_home_km')::NUMERIC >= 2
  ) INTO v_near_home_only;

  -- Only count this if there are any browse sessions at all
  IF v_near_home_only AND EXISTS (
    SELECT 1
    FROM user_telemetry_events
    WHERE user_id = p_user_id
      AND event_type = 'map_browse_session'
      AND properties ? 'max_distance_from_home_km'
  ) THEN
    v_signal_points := 10;
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'only_near_home',
      'points', v_signal_points
    );
  END IF;

  -- Signal 6: 14+ days since signup with zero rides → +20 additional
  IF v_days_since_signup >= 14 AND v_total_rides = 0 THEN
    v_signal_points := 20;
    v_score := v_score + v_signal_points;
    v_signals := v_signals || jsonb_build_object(
      'signal', 'signup_14d_no_rides',
      'points', v_signal_points,
      'days_since_signup', v_days_since_signup
    );
  END IF;

  -- Update detection score on profile
  UPDATE profiles
  SET mia_detection_score = v_score
  WHERE id = p_user_id;

  -- Trigger prompt if score >= 50 and not already shown
  IF v_score >= 50 AND v_prompt_shown = FALSE THEN
    v_prompt_triggered := TRUE;
    UPDATE profiles
    SET mia_prompt_queued = TRUE
    WHERE id = p_user_id;
  END IF;

  -- Record detection signals
  DELETE FROM mia_detection_signals WHERE user_id = p_user_id;
  FOR i IN 0..jsonb_array_length(v_signals) - 1 LOOP
    INSERT INTO mia_detection_signals (user_id, signal_type, points)
    VALUES (
      p_user_id,
      v_signals->i->>'signal',
      (v_signals->i->>'points')::INT
    );
  END LOOP;

  RETURN jsonb_build_object(
    'score', v_score,
    'signals', v_signals,
    'prompt_triggered', v_prompt_triggered
  );
END;
$$;
