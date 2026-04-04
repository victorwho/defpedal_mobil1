-- Hazard Reporter Impact RPC
-- Counts how many distinct cyclists were protected by a user's hazard reports.
-- Uses two signals:
--   1. Other users who validated (confirm/deny/pass) the reporter's hazards = they saw the warning
--   2. Other users who shared trips starting within 200m of the reporter's hazards while active
-- Also provides per-hazard breakdown.

CREATE OR REPLACE FUNCTION get_hazard_reporter_impact(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_total_hazards INT;
  v_active_hazards INT;
  v_riders_warned INT;
  v_validations_received INT;
  v_hazard_details JSONB;
BEGIN
  -- Total hazards reported by this user
  SELECT COUNT(*)::INT INTO v_total_hazards
  FROM hazards
  WHERE user_id = p_user_id;

  -- Currently active hazards
  SELECT COUNT(*)::INT INTO v_active_hazards
  FROM hazards
  WHERE user_id = p_user_id
    AND expires_at > now();

  -- Distinct riders who validated the user's hazards (they were warned)
  SELECT COUNT(DISTINCT hv.user_id)::INT INTO v_riders_warned
  FROM hazard_validations hv
  JOIN hazards h ON h.id = hv.hazard_id
  WHERE h.user_id = p_user_id
    AND hv.user_id != p_user_id;

  -- Total validations received on the user's hazards (from other users)
  SELECT COUNT(*)::INT INTO v_validations_received
  FROM hazard_validations hv
  JOIN hazards h ON h.id = hv.hazard_id
  WHERE h.user_id = p_user_id
    AND hv.user_id != p_user_id;

  -- Also count riders whose shared trips started near the user's hazards
  -- (trip_shares.start_coordinate is geography, hazards.location is JSONB)
  -- This catches riders who may not have validated but rode through the area
  SELECT GREATEST(v_riders_warned, COALESCE(nearby.cnt, 0))
  INTO v_riders_warned
  FROM (
    SELECT COUNT(DISTINCT ts.user_id)::INT AS cnt
    FROM trip_shares ts
    JOIN hazards h ON h.user_id = p_user_id
    WHERE ts.user_id != p_user_id
      AND h.location IS NOT NULL
      AND ts.shared_at >= h.created_at
      AND ST_DWithin(
        ts.start_coordinate,
        ST_SetSRID(ST_MakePoint(
          (h.location->>'longitude')::double precision,
          (h.location->>'latitude')::double precision
        ), 4326)::geography,
        200  -- 200m radius
      )
  ) nearby;

  -- Per-hazard breakdown (top 10 most impactful)
  SELECT COALESCE(jsonb_agg(row_to_json(hd)::jsonb ORDER BY hd.validation_count DESC), '[]'::jsonb)
  INTO v_hazard_details
  FROM (
    SELECT
      h.id,
      h.hazard_type,
      h.created_at,
      h.expires_at,
      h.confirm_count,
      h.deny_count,
      COUNT(DISTINCT hv.user_id) FILTER (WHERE hv.user_id != p_user_id) AS validation_count
    FROM hazards h
    LEFT JOIN hazard_validations hv ON hv.hazard_id = h.id
    WHERE h.user_id = p_user_id
    GROUP BY h.id, h.hazard_type, h.created_at, h.expires_at, h.confirm_count, h.deny_count
    ORDER BY COUNT(DISTINCT hv.user_id) FILTER (WHERE hv.user_id != p_user_id) DESC
    LIMIT 10
  ) hd;

  -- Update profiles.total_riders_protected with the computed value
  UPDATE profiles
  SET total_riders_protected = v_riders_warned
  WHERE id = p_user_id;

  result := jsonb_build_object(
    'totalHazardsReported', v_total_hazards,
    'activeHazards',        v_active_hazards,
    'ridersProtected',      v_riders_warned,
    'validationsReceived',  v_validations_received,
    'topHazards',           v_hazard_details
  );

  RETURN result;
END;
$$;
