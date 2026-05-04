-- ---------------------------------------------------------------------------
-- 202605040001 — get_nearby_hazards RPC (PostGIS spatial filter)
-- ---------------------------------------------------------------------------
--
-- Replaces the JS-side degree-bbox + 200-row truncation in
-- /v1/hazards/nearby. Previously the route fetched the 200 most-recent
-- hazards across the entire DB and filtered to the radius in Node — which
-- silently dropped older hazards inside the radius once any city had >200
-- active hazards, and the degree-delta bbox drifted at high latitudes.
--
-- This RPC pushes the spatial filter into Postgres via ST_DWithin (geography),
-- so the LIMIT applies AFTER the radius filter — what the API actually wants.
-- The hazards.location column is JSONB with 'latitude' / 'longitude' keys
-- (same shape used by get_neighborhood_leaderboard's hazard branch).
--
-- Row contract matches the existing /hazards/nearby SELECT so the route
-- handler can swap straight in. is_hidden / expires_at / score gates are
-- moved server-side (these were applied in the route's .from('hazards')
-- query before; they belong here now that all access goes through the RPC).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_nearby_hazards(
  p_user_lat DOUBLE PRECISION,
  p_user_lon DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID,
  location JSONB,
  hazard_type TEXT,
  created_at TIMESTAMPTZ,
  confirm_count INTEGER,
  deny_count INTEGER,
  score INTEGER,
  expires_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  description TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geography;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_user_lon, p_user_lat), 4326)::geography;

  RETURN QUERY
  SELECT
    h.id,
    h.location,
    h.hazard_type,
    h.created_at,
    h.confirm_count,
    h.deny_count,
    h.score,
    h.expires_at,
    h.last_confirmed_at,
    h.description
  FROM hazards h
  WHERE h.is_hidden = false
    AND h.expires_at > now()
    AND h.score > -3
    AND h.location IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(
        (h.location->>'longitude')::double precision,
        (h.location->>'latitude')::double precision
      ), 4326)::geography,
      v_point,
      p_radius_meters
    )
  ORDER BY h.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO service_role;
GRANT EXECUTE ON FUNCTION public.get_nearby_hazards TO authenticated;
