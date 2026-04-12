-- Secure award_xp RPC: callers can only award XP to themselves.
-- Previously any authenticated user could call award_xp with any p_user_id,
-- allowing XP inflation for arbitrary users via the Supabase client SDK.

CREATE OR REPLACE FUNCTION award_xp(
  p_user_id    UUID,
  p_action     TEXT,
  p_base_xp    INTEGER,
  p_multiplier NUMERIC DEFAULT 1.0,
  p_source_id  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final_xp  INTEGER;
  v_new_total INTEGER;
  v_old_tier  TEXT;
  v_new_tier  TEXT;
  v_tier_def  RECORD;
BEGIN
  -- Only the service role or the user themselves may award XP.
  -- auth.uid() is NULL for service_role calls (which bypass RLS anyway),
  -- so we only block when auth.uid() IS NOT NULL and differs.
  IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: cannot award XP to another user';
  END IF;

  v_final_xp := ROUND(p_base_xp * p_multiplier);

  INSERT INTO xp_events (user_id, action, base_xp, multiplier, final_xp, source_id)
  VALUES (p_user_id, p_action, p_base_xp, p_multiplier, v_final_xp, p_source_id);

  UPDATE profiles
  SET total_xp = COALESCE(total_xp, 0) + v_final_xp
  WHERE id = p_user_id
  RETURNING total_xp, rider_tier INTO v_new_total, v_old_tier;

  SELECT name INTO v_new_tier
  FROM rider_tier_definitions
  WHERE xp_required <= v_new_total
  ORDER BY xp_required DESC
  LIMIT 1;

  IF v_new_tier IS DISTINCT FROM v_old_tier THEN
    UPDATE profiles SET rider_tier = v_new_tier WHERE id = p_user_id;
  END IF;

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

-- Restrict to authenticated users only (not anon)
REVOKE EXECUTE ON FUNCTION award_xp FROM anon;
GRANT EXECUTE ON FUNCTION award_xp TO authenticated;
GRANT EXECUTE ON FUNCTION award_xp TO service_role;
