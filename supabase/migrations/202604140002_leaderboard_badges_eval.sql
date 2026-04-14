-- ═══════════════════════════════════════════════════════════════════════════
-- Extend check_and_award_badges to evaluate repeat champion badges
-- co2_champion_repeat: 5 weekly CO2 champion wins
-- hazard_champion_repeat: 10 weekly hazard champion wins
-- ═══════════════════════════════════════════════════════════════════════════

-- This migration adds champion win counting to check_and_award_badges.
-- Rather than recreating the entire 900-line function, we create a
-- supplementary function that the settle endpoint calls after awarding
-- champion badges. The check_and_award_badges function is also patched
-- to check these counts.

CREATE OR REPLACE FUNCTION check_champion_repeat_badges(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_co2_weekly_wins   INT;
  v_hazard_weekly_wins INT;
  v_candidates        TEXT[] := '{}';
  v_earned            TEXT[];
  v_result            JSONB;
BEGIN
  -- Get already-earned badges for this user
  SELECT ARRAY_AGG(badge_key) INTO v_earned
  FROM user_badges
  WHERE user_id = p_user_id;

  v_earned := COALESCE(v_earned, '{}');

  -- Count weekly champion wins from snapshots
  SELECT COUNT(*)::INT INTO v_co2_weekly_wins
  FROM leaderboard_snapshots
  WHERE user_id = p_user_id
    AND period_type = 'weekly'
    AND metric = 'co2'
    AND rank = 1;

  SELECT COUNT(*)::INT INTO v_hazard_weekly_wins
  FROM leaderboard_snapshots
  WHERE user_id = p_user_id
    AND period_type = 'weekly'
    AND metric = 'hazards'
    AND rank = 1;

  -- Evaluate repeat champion badges
  IF v_co2_weekly_wins >= 5 AND NOT ('co2_champion_repeat' = ANY(v_earned)) THEN
    v_candidates := v_candidates || 'co2_champion_repeat';
  END IF;

  IF v_hazard_weekly_wins >= 10 AND NOT ('hazard_champion_repeat' = ANY(v_earned)) THEN
    v_candidates := v_candidates || 'hazard_champion_repeat';
  END IF;

  -- Insert new badges
  IF ARRAY_LENGTH(v_candidates, 1) IS NOT NULL AND ARRAY_LENGTH(v_candidates, 1) > 0 THEN
    INSERT INTO user_badges (user_id, badge_key, earned_at)
    SELECT p_user_id, bd.badge_key, now()
    FROM badge_definitions bd
    WHERE bd.badge_key = ANY(v_candidates)
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  END IF;

  -- Return newly awarded badges
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

GRANT EXECUTE ON FUNCTION check_champion_repeat_badges(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION check_champion_repeat_badges(UUID) TO authenticated;
